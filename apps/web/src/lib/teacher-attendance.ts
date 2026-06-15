import 'server-only';
import type { Prisma } from '@/lib/db';
import type { AttendanceStatusInput } from '@jawal/shared';
import { parseDateUTC, toDateStr, dowOf, weekDays } from '@/lib/lesson-book';

type Tx = Prisma.TransactionClient;

export type AppelWeekSession = {
  entryId: string;
  date: string;
  dow: string;
  classId: string;
  className: string;
  subject: string | null;
  room: string | null;
  slotStart: string;
  slotEnd: string;
  periodLabel: string;
  /** Appel validé (session finalisée) pour (classId, date, periodLabel). */
  done: boolean;
};

const periodLabelOf = (start: string, end: string) => `${start}-${end}`;

/**
 * Séances datées d'un enseignant pour une semaine (lun→sam), enrichies de
 * l'état d'appel : `done` = une AttendanceSession finalisée existe pour la case.
 * Sert à colorer la grille (vert = fait, rose = à faire).
 */
export async function getTeacherWeekAppel(
  tx: Tx,
  teacherId: string,
  mondayStr: string,
): Promise<{ days: { date: string; dow: string }[]; sessions: AppelWeekSession[] }> {
  const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
  const days = weekDays(mondayStr);
  if (!year) return { days, sessions: [] };

  const entries = await tx.timetableEntry.findMany({
    where: {
      teacherId,
      academicYearId: year.id,
      dayOfWeek: { in: days.map((d) => d.dow) },
      slot: { isBreak: false },
    },
    include: {
      slot: { select: { startTime: true, endTime: true } },
      subject: { select: { label: true } },
      class: { select: { id: true, name: true } },
      room: { select: { code: true } },
    },
  });

  const dateObjs = days.map((d) => parseDateUTC(d.date));
  const finalized =
    entries.length > 0
      ? await tx.attendanceSession.findMany({
          where: {
            classId: { in: [...new Set(entries.map((e) => e.classId))] },
            date: { in: dateObjs },
            finalizedAt: { not: null },
          },
          select: { classId: true, date: true, periodLabel: true },
        })
      : [];
  const doneSet = new Set(
    finalized.map((s) => `${s.classId}|${toDateStr(s.date)}|${s.periodLabel ?? ''}`),
  );

  const sessions: AppelWeekSession[] = [];
  for (const day of days) {
    for (const e of entries) {
      if (e.dayOfWeek !== day.dow) continue;
      const periodLabel = periodLabelOf(e.slot.startTime, e.slot.endTime);
      sessions.push({
        entryId: e.id,
        date: day.date,
        dow: day.dow,
        classId: e.classId,
        className: e.class.name,
        subject: e.subject?.label ?? null,
        room: e.room?.code ?? null,
        slotStart: e.slot.startTime,
        slotEnd: e.slot.endTime,
        periodLabel,
        done: doneSet.has(`${e.classId}|${day.date}|${periodLabel}`),
      });
    }
  }
  sessions.sort((a, b) => a.date.localeCompare(b.date) || a.slotStart.localeCompare(b.slotStart));
  return { days, sessions };
}

export type AppelRow = {
  studentId: string;
  firstName: string;
  lastName: string;
  status: AttendanceStatusInput;
  lateMinutes: number | null;
  lateReasonId: string | null;
  infirmary: boolean;
  punishment: boolean;
  exclusion: boolean;
  note: string | null;
  /** Observation aux parents (→ entrée carnet OBSERVATION). */
  observation: string | null;
  observationVisible: boolean;
  /** Encouragement (→ entrée carnet ENCOURAGEMENT). */
  encouragement: string | null;
  encouragementVisible: boolean;
};

export type AppelDetail = {
  sessionId: string | null;
  finalizedAt: Date | null;
  date: string;
  periodLabel: string;
  className: string;
  subject: string | null;
  room: string | null;
  slotStart: string;
  slotEnd: string;
  teacherName: string | null;
  rows: AppelRow[];
};

/**
 * Charge la feuille d'appel d'une séance pour l'enseignant **sans rien écrire** :
 * vérifie l'appartenance de la case d'EDT et la cohérence du jour, construit le
 * tableau à partir des élèves inscrits, fusionné avec la session d'appel
 * existante (si déjà saisie). Aucune session/record n'est créé tant que
 * l'enseignant n'enregistre pas — évite les brouillons fantômes au simple
 * affichage (ou au prefetch). Renvoie null si non autorisé / incohérent.
 */
export async function loadTeacherAppel(
  tx: Tx,
  teacherId: string,
  entryId: string,
  dateStr: string,
): Promise<AppelDetail | null> {
  const entry = await tx.timetableEntry.findUnique({
    where: { id: entryId },
    include: {
      slot: { select: { startTime: true, endTime: true } },
      subject: { select: { label: true } },
      class: {
        select: {
          id: true,
          name: true,
          students: {
            where: { unenrolledAt: null },
            select: { student: { select: { id: true, firstName: true, lastName: true } } },
            orderBy: { student: { lastName: 'asc' } },
          },
        },
      },
      room: { select: { code: true } },
      teacher: { select: { firstName: true, lastName: true } },
    },
  });
  if (!entry || entry.teacherId !== teacherId) return null;
  if (dowOf(dateStr) !== entry.dayOfWeek) return null;

  const dateOnly = parseDateUTC(dateStr);
  const periodLabel = periodLabelOf(entry.slot.startTime, entry.slot.endTime);

  // Session existante (si l'appel a déjà été saisi) — lecture seule.
  const attSession = await tx.attendanceSession.findFirst({
    where: { classId: entry.classId, date: dateOnly, periodLabel },
    include: { records: true },
  });
  const byStudent = new Map((attSession?.records ?? []).map((r) => [r.studentId, r]));

  // Observations / encouragements déjà saisis dans cette feuille d'appel.
  const carnet = attSession
    ? await tx.carnetEntry.findMany({
        where: {
          attendanceSessionId: attSession.id,
          type: { in: ['OBSERVATION', 'ENCOURAGEMENT'] },
        },
        select: { studentId: true, type: true, content: true, visibleToParents: true },
      })
    : [];
  const obsByStudent = new Map<string, { content: string; visible: boolean }>();
  const encByStudent = new Map<string, { content: string; visible: boolean }>();
  for (const c of carnet) {
    (c.type === 'OBSERVATION' ? obsByStudent : encByStudent).set(c.studentId, {
      content: c.content,
      visible: c.visibleToParents,
    });
  }

  const rows: AppelRow[] = entry.class.students.map(({ student }) => {
    const r = byStudent.get(student.id);
    const obs = obsByStudent.get(student.id);
    const enc = encByStudent.get(student.id);
    return {
      studentId: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      status: (r?.status ?? 'PRESENT') as AttendanceStatusInput,
      lateMinutes: r?.lateMinutes ?? null,
      lateReasonId: r?.lateReasonId ?? null,
      infirmary: r?.infirmary ?? false,
      punishment: r?.punishment ?? false,
      exclusion: r?.exclusion ?? false,
      note: r?.note ?? null,
      observation: obs?.content ?? null,
      observationVisible: obs?.visible ?? true,
      encouragement: enc?.content ?? null,
      encouragementVisible: enc?.visible ?? true,
    };
  });

  return {
    sessionId: attSession?.id ?? null,
    finalizedAt: attSession?.finalizedAt ?? null,
    date: dateStr,
    periodLabel,
    className: entry.class.name,
    subject: entry.subject?.label ?? null,
    room: entry.room?.code ?? null,
    slotStart: entry.slot.startTime,
    slotEnd: entry.slot.endTime,
    teacherName: entry.teacher ? `${entry.teacher.firstName} ${entry.teacher.lastName}` : null,
    rows,
  };
}

/**
 * Get-or-create la session d'appel d'une séance (à l'enregistrement uniquement).
 * Renvoie l'id de session, après vérification d'appartenance au prof.
 */
export async function getOrCreateAppelSession(
  tx: Tx,
  tenantId: string,
  teacherId: string,
  entryId: string,
  dateStr: string,
): Promise<{ sessionId: string; finalizedAt: Date | null } | null> {
  const entry = await tx.timetableEntry.findUnique({
    where: { id: entryId },
    include: { slot: { select: { startTime: true, endTime: true } } },
  });
  if (!entry || entry.teacherId !== teacherId) return null;
  if (dowOf(dateStr) !== entry.dayOfWeek) return null;

  const dateOnly = parseDateUTC(dateStr);
  const periodLabel = periodLabelOf(entry.slot.startTime, entry.slot.endTime);
  let sess = await tx.attendanceSession.findFirst({
    where: { classId: entry.classId, date: dateOnly, periodLabel },
  });
  if (!sess) {
    sess = await tx.attendanceSession.create({
      data: { tenantId, classId: entry.classId, date: dateOnly, periodLabel },
    });
  }
  return { sessionId: sess.id, finalizedAt: sess.finalizedAt };
}

/** Vérifie que la séance d'EDT appartient à l'enseignant (pour les actions). */
export async function teacherOwnsEntry(
  tx: Tx,
  teacherId: string,
  entryId: string,
): Promise<boolean> {
  const entry = await tx.timetableEntry.findUnique({
    where: { id: entryId },
    select: { teacherId: true },
  });
  return entry?.teacherId === teacherId;
}
