import 'server-only';
import type { Prisma } from '@/lib/db';
import { categoryOf, type AttendanceCategory } from '@/lib/attendance-category';
import { dowOf, toDateStr } from '@/lib/lesson-book';

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
  /** Créneau horaire de la séance liée (ex. « 08:00 → 09:00 »), si applicable. */
  sessionLabel: string | null;
  parentReadAt: Date | null;
};

export type CarnetEvent = {
  id: string;
  date: Date;
  category: AttendanceCategory;
  className: string;
  justifStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  /** Créneau horaire de la séance (`AttendanceSession.periodLabel`). */
  periodLabel: string | null;
  /** Matière et enseignant de la séance, résolus via l'emploi du temps. */
  subjectLabel: string | null;
  teacherName: string | null;
  /** Renseigné seulement en recherche multi-élèves (niveau / classe). */
  studentName?: string;
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
    select: { id: true, startDate: true, endDate: true },
  });

  const [entriesRaw, recordsRaw] = await Promise.all([
    // Année active seulement, comme les événements dérivés des appels : un
      // carnet qui remonte aux exercices clos noie l'année en cours.
    tx.carnetEntry.findMany({
      where: {
        studentId,
        ...(opts?.forParents ? { visibleToParents: true } : {}),
        ...(year ? { occurredAt: { gte: year.startDate, lte: year.endDate } } : {}),
      },
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
            session: {
              include: { class: { select: { id: true, name: true, nameAr: true } } },
            },
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
      ? tx.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true, nameAr: true } })
      : Promise.resolve([]),
    subjectIds.length
      ? tx.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, label: true } })
      : Promise.resolve([]),
  ]);
  const classMap = new Map(classes.map((c) => [c.id, c.name]));
  const subjectMap = new Map(subjects.map((s) => [s.id, s.label]));

  // Séance + matière des entrées liées à un appel (via attendanceSession → EDT).
  const sessionIds = [
    ...new Set(entriesRaw.map((e) => e.attendanceSessionId).filter(Boolean) as string[]),
  ];
  const sessions = sessionIds.length
    ? await tx.attendanceSession.findMany({
        where: { id: { in: sessionIds } },
        select: { id: true, periodLabel: true, classId: true, date: true },
      })
    : [];
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const sessClassIds = [...new Set(sessions.map((s) => s.classId))];
  const ttEntries =
    year && sessClassIds.length
      ? await tx.timetableEntry.findMany({
          where: { academicYearId: year.id, classId: { in: sessClassIds } },
          select: {
            classId: true,
            dayOfWeek: true,
            slot: { select: { startTime: true, endTime: true } },
            subject: { select: { label: true, labelAr: true } },
          },
        })
      : [];
  const ttSubjectMap = new Map<string, string | null>();
  for (const en of ttEntries) {
    ttSubjectMap.set(
      `${en.classId}|${en.dayOfWeek}|${en.slot.startTime}-${en.slot.endTime}`,
      en.subject?.label ?? null,
    );
  }

  const entries: CarnetEntryRow[] = entriesRaw.map((e) => {
    const sess = e.attendanceSessionId ? sessionById.get(e.attendanceSessionId) : null;
    const sessSubject =
      sess && sess.periodLabel
        ? ttSubjectMap.get(`${sess.classId}|${dowOf(toDateStr(sess.date))}|${sess.periodLabel}`) ??
          null
        : null;
    return {
      id: e.id,
      type: e.type,
      content: e.content,
      occurredAt: e.occurredAt,
      authorName: e.authorName,
      authorRole: e.authorRole,
      className: e.classId ? classMap.get(e.classId) ?? null : sess ? classMap.get(sess.classId) ?? null : null,
      subjectLabel: e.subjectId ? subjectMap.get(e.subjectId) ?? null : sessSubject,
      sessionLabel: sess?.periodLabel ? sess.periodLabel.replace('-', ' → ') : null,
      parentReadAt: e.parentReadAt,
    };
  });

  const kept = recordsRaw.map((r) => ({ r, cat: categoryOf(r) })).filter(({ cat }) => cat !== 'PRESENT');
  const lessons = await resolveLessons(
    tx,
    year?.id ?? null,
    kept.map(({ r }) => ({ classId: r.session.class.id, date: r.session.date, periodLabel: r.session.periodLabel })),
  );
  const events: CarnetEvent[] = kept.map(({ r, cat }) => ({
    id: r.id,
    date: r.session.date,
    category: cat,
    className: r.session.class.name,
    justifStatus: (r.justification?.status as CarnetEvent['justifStatus']) ?? null,
    periodLabel: r.session.periodLabel,
    ...(lessons.get(lessonKey(r.session.class.id, r.session.date, r.session.periodLabel)) ?? {
      subjectLabel: null,
      teacherName: null,
    }),
  }));

  return { entries, events };
}


/**
 * Événements d'appel d'un ensemble d'élèves, sur une période optionnelle.
 *
 * Sert la recherche du carnet par niveau / classe / élève. Les libellés de
 * matière et d'enseignant sont résolus comme pour un élève seul, en une passe
 * pour tout le lot.
 */
export async function loadCarnetEventsForStudents(
  tx: Tx,
  students: { id: string; firstName: string; lastName: string; firstNameAr: string | null; lastNameAr: string | null }[],
  range?: { from: Date | null; to: Date | null },
): Promise<CarnetEvent[]> {
  const year = await tx.academicYear.findFirst({
    where: { active: true },
    select: { id: true, startDate: true, endDate: true },
  });
  if (!year) return [];

  // Sans borne saisie, on reste dans l'année scolaire active.
  const gte = range?.from ?? year.startDate;
  const lte = range?.to ?? year.endDate;

  const records = await tx.attendanceRecord.findMany({
    where: {
      studentId: { in: students.map((s) => s.id) },
      session: { finalizedAt: { not: null }, date: { gte, lte } },
    },
    orderBy: { session: { date: 'desc' } },
    include: {
      session: { include: { class: { select: { id: true, name: true, nameAr: true } } } },
      justification: { select: { status: true } },
    },
  });

  const kept = records.map((r) => ({ r, cat: categoryOf(r) })).filter(({ cat }) => cat !== 'PRESENT');
  const lessons = await resolveLessons(
    tx,
    year.id,
    kept.map(({ r }) => ({ classId: r.session.class.id, date: r.session.date, periodLabel: r.session.periodLabel })),
  );
  const nameById = new Map(students.map((s) => [s.id, `${s.lastName} ${s.firstName}`]));

  return kept.map(({ r, cat }) => ({
    id: r.id,
    date: r.session.date,
    category: cat,
    className: r.session.class.name,
    justifStatus: (r.justification?.status as CarnetEvent['justifStatus']) ?? null,
    periodLabel: r.session.periodLabel,
    studentName: nameById.get(r.studentId) ?? '',
    ...(lessons.get(lessonKey(r.session.class.id, r.session.date, r.session.periodLabel)) ?? {
      subjectLabel: null,
      teacherName: null,
    }),
  }));
}

/** Clé (classe × jour × créneau) reliant une séance d'appel à sa case d'EDT. */
function lessonKey(classId: string, date: Date, periodLabel: string | null): string {
  return `${classId}|${date.getUTCDay()}|${periodLabel ?? ''}`;
}

/**
 * Matière et enseignant d'une séance d'appel.
 *
 * L'appel ne stocke ni l'un ni l'autre : `AttendanceSession` ne porte que le
 * créneau (`periodLabel`, du type « 08h00-09h00 »). On les retrouve donc dans
 * l'emploi du temps, sur la case (classe × jour de semaine × créneau).
 */
async function resolveLessons(
  tx: Tx,
  academicYearId: string | null,
  sessions: { classId: string; date: Date; periodLabel: string | null }[],
): Promise<Map<string, { subjectLabel: string | null; teacherName: string | null }>> {
  const out = new Map<string, { subjectLabel: string | null; teacherName: string | null }>();
  const classIds = [...new Set(sessions.map((s) => s.classId))];
  if (!academicYearId || classIds.length === 0) return out;

  const entries = await tx.timetableEntry.findMany({
    where: { academicYearId, classId: { in: classIds } },
    select: {
      classId: true,
      dayOfWeek: true,
      slot: { select: { startTime: true, endTime: true } },
      subject: { select: { label: true } },
      teacher: { select: { firstName: true, lastName: true } },
    },
  });

  // L'EDT indexe par jour de semaine ; le créneau du pointage est le libellé
  // « HHhMM-HHhMM ». On construit les deux formes rencontrées en base.
  const byCell = new Map<string, { subjectLabel: string | null; teacherName: string | null }>();
  for (const e of entries) {
    const value = {
      subjectLabel: e.subject?.label ?? null,
      teacherName: e.teacher ? `${e.teacher.lastName} ${e.teacher.firstName}` : null,
    };
    const day = DAY_INDEX[e.dayOfWeek] ?? -1;
    for (const label of [
      `${e.slot.startTime}-${e.slot.endTime}`,
      `${e.slot.startTime.replace(':', 'h')}-${e.slot.endTime.replace(':', 'h')}`,
    ]) {
      byCell.set(`${e.classId}|${day}|${label}`, value);
    }
  }
  for (const s of sessions) {
    const hit = byCell.get(lessonKey(s.classId, s.date, s.periodLabel));
    if (hit) out.set(lessonKey(s.classId, s.date, s.periodLabel), hit);
  }
  return out;
}

/** `DayOfWeek` Prisma → index JS de `Date.getUTCDay()` (dimanche = 0). */
const DAY_INDEX: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};

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
