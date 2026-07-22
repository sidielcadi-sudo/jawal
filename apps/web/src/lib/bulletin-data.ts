import 'server-only';
import type { Prisma } from '@/lib/db';
import { computeClassBook, type SubjectMeta } from '@/lib/grades';
import { loadActiveFramework } from '@/lib/competences';
import { computeReports, type StudentReport } from '@/lib/competency-report';

type Tx = Prisma.TransactionClient;

type ClassBook = Awaited<ReturnType<typeof computeClassBook>>;

export type BulletinStudent = {
  student: { id: string; firstName: string; lastName: string; birthDate: Date | null };
  /** Ligne du carnet de classe : moyennes par matière, rangs, moyenne générale. */
  row: ClassBook['rows'][number];
  /** subjectId → texte d'appréciation pour la période. */
  apprec: Map<string, string>;
  council: { generalAppreciation: string | null; decision: string | null; heldAt: Date | null } | null;
  /**
   * Volet compétences (APC). Issu du bilan **figé** si la direction l'a gelé
   * pour la période ; sinon calculé à la volée et marqué `provisional`.
   * Null si aucun référentiel actif.
   */
  competences: (StudentReport & { provisional: boolean }) | null;
};

export type BulletinData = {
  cls: {
    id: string;
    name: string;
    academicYear: { label: string };
    level: { label: string; cycle: { label: string } };
    mainTeacher: { firstName: string; lastName: string } | null;
  };
  period: { id: string; label: string };
  classBook: ClassBook;
  /** Effectif total (élèves inscrits actifs), indépendant du filtre studentIds. */
  classSize: number;
  students: BulletinStudent[];
};

/**
 * Charge toutes les données nécessaires au rendu d'un ou plusieurs bulletins
 * d'une classe pour une période. Source unique partagée par la page de
 * consultation et les routes d'export PDF (élève + lot classe).
 *
 * `studentIds` absent ⇒ tous les élèves inscrits actifs (mode lot).
 * Doit être appelé dans un `withTenant` (RLS positionné).
 */
export async function loadBulletinData(
  tx: Tx,
  opts: { classId: string; periodId: string; studentIds?: string[] },
): Promise<BulletinData | null> {
  const cls = await tx.class.findUnique({
    where: { id: opts.classId },
    include: {
      academicYear: { select: { label: true } },
      level: { include: { cycle: { select: { label: true } } } },
      mainTeacher: { select: { firstName: true, lastName: true } },
      students: {
        where: { unenrolledAt: null },
        include: {
          student: {
            select: { id: true, firstName: true, lastName: true, birthDate: true, type: true },
          },
        },
        orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
      },
    },
  });
  if (!cls) return null;

  const period = await tx.period.findUnique({
    where: { id: opts.periodId },
    select: { id: true, label: true },
  });
  if (!period) return null;

  const enrolled = cls.students
    .map((sc) => sc.student)
    .filter((s) => s.type === 'STUDENT');

  const subjects = await tx.subject.findMany({ orderBy: [{ order: 'asc' }, { label: 'asc' }] });
  const allSubjects: SubjectMeta[] = subjects.map((s) => ({
    id: s.id,
    label: s.label,
    scale: s.scale,
    coefficient: s.coefficient,
    order: s.order,
  }));

  // Le carnet calcule moyennes de classe + rangs pour TOUS les élèves : on le
  // construit toujours sur l'effectif complet, même en mode bulletin unique,
  // pour que rang et moyenne de classe restent corrects.
  const classBook = await computeClassBook(tx, {
    classId: opts.classId,
    periodId: opts.periodId,
    students: enrolled.map((s) => ({ id: s.id, firstName: s.firstName, lastName: s.lastName })),
    allSubjects,
  });

  const targetIds = opts.studentIds ?? enrolled.map((s) => s.id);
  const targetSet = new Set(targetIds);

  const [apprecs, councils] = await Promise.all([
    tx.subjectAppreciation.findMany({
      where: { periodId: opts.periodId, studentId: { in: targetIds } },
      select: { studentId: true, subjectId: true, text: true },
    }),
    tx.councilEntry.findMany({
      where: { classId: opts.classId, periodId: opts.periodId, studentId: { in: targetIds } },
      select: { studentId: true, generalAppreciation: true, decision: true, heldAt: true },
    }),
  ]);

  const apprecByStudent = new Map<string, Map<string, string>>();
  for (const a of apprecs) {
    let m = apprecByStudent.get(a.studentId);
    if (!m) apprecByStudent.set(a.studentId, (m = new Map()));
    m.set(a.subjectId, a.text);
  }
  const councilByStudent = new Map(councils.map((c) => [c.studentId, c]));

  // Volet compétences : bilan figé prioritaire, sinon calcul à la volée.
  const compIds = enrolled.filter((s) => targetSet.has(s.id)).map((s) => s.id);
  const competencesByStudent = new Map<string, StudentReport & { provisional: boolean }>();
  const framework = await loadActiveFramework(tx);
  if (framework && compIds.length > 0) {
    const frozen = await tx.competencyReport.findMany({
      where: { periodId: opts.periodId, studentId: { in: compIds } },
      select: { studentId: true, data: true },
    });
    for (const f of frozen) {
      competencesByStudent.set(f.studentId, {
        ...(f.data as unknown as StudentReport),
        provisional: false,
      });
    }
    const missing = compIds.filter((id) => !competencesByStudent.has(id));
    if (missing.length > 0) {
      const live = await computeReports(tx, {
        frameworkId: framework.id,
        periodId: opts.periodId,
        studentIds: missing,
        levelId: cls.levelId,
      });
      for (const [id, r] of live) competencesByStudent.set(id, { ...r, provisional: true });
    }
  }

  const students: BulletinStudent[] = enrolled
    .filter((s) => targetSet.has(s.id))
    .map((s) => ({
      student: { id: s.id, firstName: s.firstName, lastName: s.lastName, birthDate: s.birthDate },
      row: classBook.rows.find((r) => r.studentId === s.id)!,
      apprec: apprecByStudent.get(s.id) ?? new Map<string, string>(),
      council: councilByStudent.get(s.id) ?? null,
      competences: competencesByStudent.get(s.id) ?? null,
    }));

  return {
    cls: {
      id: cls.id,
      name: cls.name,
      academicYear: cls.academicYear,
      level: cls.level,
      mainTeacher: cls.mainTeacher,
    },
    period,
    classBook,
    classSize: enrolled.length,
    students,
  };
}
