import 'server-only';
import type { Prisma } from '@/lib/db';
import { categoryOf, type AttendanceCategory } from '@/lib/attendance-category';

type Tx = Prisma.TransactionClient;

export type CarnetEntryRow = {
  id: string;
  type: string;
  content: string;
  occurredAt: Date;
  authorName: string;
  authorRole: string;
  className: string | null;
  subjectLabel: string | null;
  parentReadAt: Date | null;
};

export type CarnetEvent = {
  id: string;
  date: Date;
  category: AttendanceCategory;
  className: string;
  justifStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
};

/**
 * Charge le carnet d'un élève : entrées manuelles (CarnetEntry) + événements
 * dérivés des feuilles d'appel finalisées (absences/retards/exclusions/…), sans
 * duplication. À appeler dans un `withTenant`.
 */
export async function loadStudentCarnet(
  tx: Tx,
  studentId: string,
  opts?: { forParents?: boolean },
): Promise<{ entries: CarnetEntryRow[]; events: CarnetEvent[] }> {
  const year = await tx.academicYear.findFirst({
    where: { active: true },
    select: { startDate: true, endDate: true },
  });

  const [entriesRaw, recordsRaw] = await Promise.all([
    tx.carnetEntry.findMany({
      where: { studentId, ...(opts?.forParents ? { visibleToParents: true } : {}) },
      orderBy: { occurredAt: 'desc' },
    }),
    year
      ? tx.attendanceRecord.findMany({
          where: {
            studentId,
            session: {
              finalizedAt: { not: null },
              date: { gte: year.startDate, lte: year.endDate },
            },
          },
          orderBy: { session: { date: 'desc' } },
          include: {
            session: { include: { class: { select: { name: true } } } },
            justification: { select: { status: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  // Résolution des libellés classe/matière des entrées (optionnels).
  const classIds = [...new Set(entriesRaw.map((e) => e.classId).filter(Boolean) as string[])];
  const subjectIds = [...new Set(entriesRaw.map((e) => e.subjectId).filter(Boolean) as string[])];
  const [classes, subjects] = await Promise.all([
    classIds.length
      ? tx.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    subjectIds.length
      ? tx.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, label: true } })
      : Promise.resolve([]),
  ]);
  const classMap = new Map(classes.map((c) => [c.id, c.name]));
  const subjectMap = new Map(subjects.map((s) => [s.id, s.label]));

  const entries: CarnetEntryRow[] = entriesRaw.map((e) => ({
    id: e.id,
    type: e.type,
    content: e.content,
    occurredAt: e.occurredAt,
    authorName: e.authorName,
    authorRole: e.authorRole,
    className: e.classId ? classMap.get(e.classId) ?? null : null,
    subjectLabel: e.subjectId ? subjectMap.get(e.subjectId) ?? null : null,
    parentReadAt: e.parentReadAt,
  }));

  const events: CarnetEvent[] = recordsRaw
    .map((r) => ({ r, cat: categoryOf(r) }))
    .filter(({ cat }) => cat !== 'PRESENT')
    .map(({ r, cat }) => ({
      id: r.id,
      date: r.session.date,
      category: cat,
      className: r.session.class.name,
      justifStatus: (r.justification?.status as CarnetEvent['justifStatus']) ?? null,
    }));

  return { entries, events };
}

/** Nombre d'entrées visibles non encore lues par les parents (badge). */
export async function countUnreadCarnet(tx: Tx, studentId: string): Promise<number> {
  return tx.carnetEntry.count({
    where: { studentId, visibleToParents: true, parentReadAt: null },
  });
}

/**
 * L'enseignant a-t-il accès au carnet de cet élève ? Vrai si l'élève est inscrit
 * (StudentClass actif) dans une classe où le prof a une affectation ou une case
 * d'EDT sur l'année active.
 */
export async function teacherCanAccessStudent(
  tx: Tx,
  teacherId: string,
  studentId: string,
): Promise<boolean> {
  const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
  if (!year) return false;
  const sc = await tx.studentClass.findMany({
    where: { studentId, unenrolledAt: null },
    select: { classId: true },
  });
  const classIds = sc.map((s) => s.classId);
  if (classIds.length === 0) return false;
  const [a, e] = await Promise.all([
    tx.teacherAssignment.findFirst({
      where: { teacherId, academicYearId: year.id, classId: { in: classIds } },
      select: { id: true },
    }),
    tx.timetableEntry.findFirst({
      where: { teacherId, academicYearId: year.id, classId: { in: classIds } },
      select: { id: true },
    }),
  ]);
  return Boolean(a || e);
}
