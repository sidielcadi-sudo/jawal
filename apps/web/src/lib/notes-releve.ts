import 'server-only';
import type { Prisma } from '@/lib/db';
import { computeAverage20, type AverageItem } from '@/lib/grade-average';
import { categoryOf } from '@/lib/attendance-category';

type Tx = Prisma.TransactionClient;

export type ReleveRow = {
  studentId: string;
  name: string;
  /** Heures d'absence (records absence/exclusion finalisés sur la période). */
  hAbs: number;
  /** Retards sur la période. */
  ret: number;
  /** Notes saisies / nombre d'évaluations. */
  notes: number;
  totalEvals: number;
  /** Moyenne /20 dans la matière sur la période. */
  moy: number | null;
  /** Appréciation existante pour (élève, matière, période). */
  appreciation: string | null;
};

/**
 * Relevé d'une classe pour une matière + période : par élève, agrège moyenne,
 * nombre de notes, absences/retards et l'appréciation saisie. À appeler dans un
 * `withTenant`.
 */
export async function loadReleveRows(
  tx: Tx,
  {
    classId,
    subjectId,
    period,
  }: { classId: string; subjectId: string; period: { id: string; startDate: Date; endDate: Date } },
): Promise<ReleveRow[]> {
  const [students, evals, appreciations] = await Promise.all([
    tx.studentClass.findMany({
      where: { classId, unenrolledAt: null },
      select: { student: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { student: { lastName: 'asc' } },
    }),
    tx.evaluation.findMany({
      where: { classId, subjectId, periodId: period.id },
      select: {
        maxValue: true,
        weight: true,
        optional: true,
        optionalMode: true,
        grades: { select: { studentId: true, value: true } },
      },
    }),
    tx.subjectAppreciation.findMany({
      where: { subjectId, periodId: period.id },
      select: { studentId: true, text: true },
    }),
  ]);

  const studentIds = students.map((s) => s.student.id);

  // Absences / retards finalisés sur la fenêtre de la période.
  const records =
    studentIds.length > 0
      ? await tx.attendanceRecord.findMany({
          where: {
            studentId: { in: studentIds },
            session: { finalizedAt: { not: null }, date: { gte: period.startDate, lte: period.endDate } },
          },
          select: { studentId: true, status: true, infirmary: true, punishment: true, exclusion: true },
        })
      : [];
  const absById = new Map<string, { hAbs: number; ret: number }>();
  for (const r of records) {
    const cur = absById.get(r.studentId) ?? { hAbs: 0, ret: 0 };
    const cat = categoryOf(r);
    if (cat === 'ABSENT' || cat === 'EXCLUSION') cur.hAbs += 1;
    if (r.status === 'LATE') cur.ret += 1;
    absById.set(r.studentId, cur);
  }

  const apprById = new Map(appreciations.map((a) => [a.studentId, a.text]));

  // Notes par élève (pour moyenne + comptage).
  const gradesByStudent = new Map<string, AverageItem[]>();
  const notesCountByStudent = new Map<string, number>();
  for (const ev of evals) {
    for (const g of ev.grades) {
      if (g.value === null) continue;
      const items = gradesByStudent.get(g.studentId) ?? [];
      items.push({
        n20: (g.value / ev.maxValue) * 20,
        weight: ev.weight,
        optional: ev.optional,
        mode: ev.optionalMode as 'BONUS' | 'NOTE',
      });
      gradesByStudent.set(g.studentId, items);
      notesCountByStudent.set(g.studentId, (notesCountByStudent.get(g.studentId) ?? 0) + 1);
    }
  }

  return students.map((s) => {
    const id = s.student.id;
    const abs = absById.get(id) ?? { hAbs: 0, ret: 0 };
    const items = gradesByStudent.get(id) ?? [];
    return {
      studentId: id,
      name: `${s.student.lastName} ${s.student.firstName}`,
      hAbs: abs.hAbs,
      ret: abs.ret,
      notes: notesCountByStudent.get(id) ?? 0,
      totalEvals: evals.length,
      moy: items.length > 0 ? computeAverage20(items) : null,
      appreciation: apprById.get(id) ?? null,
    };
  });
}

export type ClassSubject = { subjectId: string; label: string; teacherName: string | null };

/**
 * Matières enseignées dans une classe (toutes, tous profs) pour l'année active,
 * avec le nom de l'enseignant — sert au sélecteur de matière du relevé (lecture
 * seule des appréciations des autres profs incluse).
 */
export async function loadClassSubjects(
  tx: Tx,
  classId: string,
  academicYearId: string,
): Promise<ClassSubject[]> {
  const select = {
    subjectId: true,
    subject: { select: { label: true } },
    teacher: { select: { firstName: true, lastName: true } },
  } as const;
  const [assignments, entries] = await Promise.all([
    tx.teacherAssignment.findMany({ where: { classId, academicYearId }, select }),
    tx.timetableEntry.findMany({ where: { classId, academicYearId }, select }),
  ]);
  const map = new Map<string, ClassSubject>();
  for (const a of [...assignments, ...entries]) {
    if (!a.subjectId || map.has(a.subjectId)) continue;
    map.set(a.subjectId, {
      subjectId: a.subjectId,
      label: a.subject?.label ?? '—',
      teacherName: a.teacher ? `${a.teacher.firstName} ${a.teacher.lastName}` : null,
    });
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}
