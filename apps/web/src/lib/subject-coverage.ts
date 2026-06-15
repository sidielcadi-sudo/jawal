import 'server-only';
import type { Prisma } from '@/lib/db';

type Tx = Prisma.TransactionClient;

export type SubjectCoverageRow = {
  subjectId: string;
  label: string;
  /** Heures/semaine demandées par le programme (Σ weeklyHours × nb classes du niveau). */
  demandHours: number;
  /** Heures/semaine offertes par les profs de la matière (Σ heures contractuelles). */
  supplyHours: number;
  /** Nombre de profs pouvant enseigner la matière (spécialité). */
  teacherCount: number;
  /** supply − demand : négatif = déficit, positif = marge. */
  gap: number;
};

/**
 * Couverture horaire par matière : compare le volume d'heures requis par le
 * programme (curriculum × nombre de classes) au volume d'heures disponible des
 * enseignants spécialistes de la matière (heures contractuelles). À appeler dans
 * un `withTenant`.
 */
export async function loadSubjectCoverage(
  tx: Tx,
  academicYearId: string,
): Promise<SubjectCoverageRow[]> {
  const [subjects, classes, curriculum, specialties] = await Promise.all([
    tx.subject.findMany({ select: { id: true, label: true } }),
    tx.class.findMany({ where: { academicYearId, deletedAt: null }, select: { levelId: true } }),
    tx.curriculumSubject.findMany({ select: { levelId: true, subjectId: true, weeklyHours: true } }),
    tx.teacherSpecialty.findMany({
      select: {
        subjectId: true,
        teacher: { select: { id: true, contractualHoursPerWeek: true, type: true, deletedAt: true } },
      },
    }),
  ]);

  const labelById = new Map(subjects.map((s) => [s.id, s.label]));

  // Nombre de classes par niveau (année active).
  const classCountByLevel = new Map<string, number>();
  for (const c of classes) classCountByLevel.set(c.levelId, (classCountByLevel.get(c.levelId) ?? 0) + 1);

  // Demande : heures programme × nombre de classes du niveau.
  const demand = new Map<string, number>();
  for (const cs of curriculum) {
    const n = classCountByLevel.get(cs.levelId) ?? 0;
    if (n === 0) continue;
    demand.set(cs.subjectId, (demand.get(cs.subjectId) ?? 0) + cs.weeklyHours * n);
  }

  // Offre : par matière, somme des heures contractuelles des profs spécialistes
  // (un prof n'est compté qu'une fois par matière).
  const teachersBySubject = new Map<string, Map<string, number>>();
  for (const sp of specialties) {
    const tch = sp.teacher;
    if (!tch || tch.deletedAt || tch.type !== 'TEACHER') continue;
    const m = teachersBySubject.get(sp.subjectId) ?? new Map<string, number>();
    m.set(tch.id, tch.contractualHoursPerWeek ?? 0);
    teachersBySubject.set(sp.subjectId, m);
  }

  const subjectIds = new Set<string>([...demand.keys(), ...teachersBySubject.keys()]);
  const rows: SubjectCoverageRow[] = [];
  for (const sid of subjectIds) {
    const demandHours = demand.get(sid) ?? 0;
    const teachers = teachersBySubject.get(sid);
    const supplyHours = teachers ? [...teachers.values()].reduce((a, b) => a + b, 0) : 0;
    rows.push({
      subjectId: sid,
      label: labelById.get(sid) ?? '—',
      demandHours,
      supplyHours,
      teacherCount: teachers ? teachers.size : 0,
      gap: supplyHours - demandHours,
    });
  }
  // Déficits d'abord (gap croissant), puis par matière.
  rows.sort((a, b) => a.gap - b.gap || a.label.localeCompare(b.label));
  return rows;
}
