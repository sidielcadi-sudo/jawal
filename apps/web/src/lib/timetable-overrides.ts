import 'server-only';
import type { Prisma } from '@/lib/db';

type Tx = Prisma.TransactionClient;

export type UpcomingOverride = {
  id: string;
  date: string; // YYYY-MM-DD
  kind: 'SUBSTITUTION' | 'CANCELLED';
  slotLabel: string;
  className: string;
  subjectName: string;
  substituteName: string | null;
  /** Vue enseignant : 'absent' = son cours est couvert/annulé ; 'covering' = il remplace. */
  role?: 'absent' | 'covering';
};

const overrideInclude = {
  entry: {
    select: {
      slot: { select: { startTime: true, endTime: true } },
      class: { select: { name: true, nameAr: true } },
      subject: { select: { label: true, labelAr: true } },
    },
  },
  substituteTeacher: { select: { firstName: true, lastName: true } },
} satisfies Prisma.TimetableOverrideInclude;

function map(
  o: Prisma.TimetableOverrideGetPayload<{ include: typeof overrideInclude }>,
  role?: 'absent' | 'covering',
): UpcomingOverride {
  return {
    id: o.id,
    date: o.date.toISOString().slice(0, 10),
    kind: o.kind === 'CANCELLED' ? 'CANCELLED' : 'SUBSTITUTION',
    slotLabel: `${o.entry.slot.startTime}–${o.entry.slot.endTime}`,
    className: o.entry.class.name,
    subjectName: o.entry.subject?.label ?? '—',
    substituteName: o.substituteTeacher
      ? `${o.substituteTeacher.lastName} ${o.substituteTeacher.firstName}`
      : null,
    role,
  };
}

/** Fenêtre [aujourd'hui, +days] en UTC. */
function window(days: number): { gte: Date; lte: Date } {
  const now = new Date();
  const gte = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const lte = new Date(gte);
  lte.setUTCDate(lte.getUTCDate() + days);
  return { gte, lte };
}

/**
 * Un remplacement OU une annulation n'est visible (élève / parent / enseignant)
 * et notifié qu'une fois APPROUVÉ par la direction — les deux passent par le
 * même circuit validation → approbation.
 */
export const VISIBLE_OVERRIDE: Prisma.TimetableOverrideWhereInput = {
  approvalStatus: 'APPROVED',
};

/**
 * Le professeur assure-t-il CETTE séance à CETTE date en remplacement ?
 *
 * Sert de droit d'accès : le remplaçant fait l'appel, le cahier de textes et
 * le carnet de la séance qu’il prend en charge, exactement comme le
 * titulaire, mais pour ce jour-là seulement.
 */
export async function isCoveringEntry(
  tx: Tx,
  teacherId: string,
  entryId: string,
  date: Date,
): Promise<boolean> {
  const n = await tx.timetableOverride.count({
    where: {
      entryId,
      date,
      kind: 'SUBSTITUTION',
      substituteTeacherId: teacherId,
      ...VISIBLE_OVERRIDE,
    },
  });
  return n > 0;
}

/** Séances (entryId × date) assurées en remplacement sur une liste de jours. */
export async function coveredEntriesOn(
  tx: Tx,
  teacherId: string,
  dates: Date[],
): Promise<Array<{ entryId: string; date: Date }>> {
  if (dates.length === 0) return [];
  const rows = await tx.timetableOverride.findMany({
    where: {
      date: { in: dates },
      kind: 'SUBSTITUTION',
      substituteTeacherId: teacherId,
      ...VISIBLE_OVERRIDE,
    },
    select: { entryId: true, date: true },
  });
  return rows;
}

/** Séance où le titulaire est absent, placée dans sa semaine type. */
export type AbsentCell = {
  id: string;
  date: string;
  dayOfWeek: string;
  slotId: string;
  kind: 'SUBSTITUTION' | 'CANCELLED';
  approval: 'PENDING' | 'APPROVED' | 'REFUSED';
  substituteName: string | null;
};

/**
 * Séances des 14 prochains jours où l'enseignant est absent : absence
 * approuvée (séance à pourvoir), remplaçant affecté ou cours annulé. Vue du
 * titulaire : il sait quelles séances il ne fera pas, et par qui elles sont
 * assurées.
 */
export async function absentCellsForTeacher(
  tx: Tx,
  teacherId: string,
  days = 14,
): Promise<AbsentCell[]> {
  const rows = await tx.timetableOverride.findMany({
    where: { date: window(days), entry: { teacherId } },
    select: {
      id: true,
      date: true,
      kind: true,
      approvalStatus: true,
      entry: { select: { dayOfWeek: true, slotId: true } },
      substituteTeacher: { select: { firstName: true, lastName: true } },
    },
    orderBy: { date: 'asc' },
  });
  return rows.map((o) => ({
    id: o.id,
    date: o.date.toISOString().slice(0, 10),
    dayOfWeek: o.entry.dayOfWeek,
    slotId: o.entry.slotId,
    kind: o.kind === 'CANCELLED' ? 'CANCELLED' : 'SUBSTITUTION',
    approval: o.approvalStatus,
    substituteName: o.substituteTeacher
      ? `${o.substituteTeacher.lastName} ${o.substituteTeacher.firstName}`
      : null,
  }));
}

/** Séance couverte par un remplaçant, placée dans SA semaine type. */
export type CoveringCell = {
  id: string;
  /** AAAA-MM-JJ de la séance remplacée. */
  date: string;
  dayOfWeek: string;
  slotId: string;
  className: string;
  subjectName: string;
  roomLabel: string | null;
};

/**
 * Remplacements approuvés à venir qu'un enseignant assure, rendus par case
 * (jour × créneau) : sa semaine type ne les connaît pas, puisqu'ils
 * n'existent que pour une date donnée.
 */
export async function coveringCellsForTeacher(
  tx: Tx,
  teacherId: string,
  days = 14,
): Promise<CoveringCell[]> {
  const rows = await tx.timetableOverride.findMany({
    where: {
      date: window(days),
      kind: 'SUBSTITUTION',
      substituteTeacherId: teacherId,
      ...VISIBLE_OVERRIDE,
    },
    select: {
      id: true,
      date: true,
      entry: {
        select: {
          dayOfWeek: true,
          slotId: true,
          class: { select: { name: true } },
          subject: { select: { label: true } },
          room: { select: { code: true, label: true } },
        },
      },
    },
    orderBy: { date: 'asc' },
  });
  return rows.map((o) => ({
    id: o.id,
    date: o.date.toISOString().slice(0, 10),
    dayOfWeek: o.entry.dayOfWeek,
    slotId: o.entry.slotId,
    className: o.entry.class.name,
    subjectName: o.entry.subject?.label ?? '—',
    roomLabel: o.entry.room?.label ?? o.entry.room?.code ?? null,
  }));
}

export async function upcomingOverridesForClass(
  tx: Tx,
  classId: string,
  days = 14,
): Promise<UpcomingOverride[]> {
  const rows = await tx.timetableOverride.findMany({
    where: { date: window(days), entry: { classId }, ...VISIBLE_OVERRIDE },
    include: overrideInclude,
    orderBy: { date: 'asc' },
  });
  return rows.map((o) => map(o));
}

/**
 * Remplacements/annulations à venir concernant un enseignant : ceux où il est
 * absent (son cours couvert/annulé) et ceux où il assure le remplacement.
 */
export async function upcomingOverridesForTeacher(
  tx: Tx,
  teacherId: string,
  days = 14,
): Promise<UpcomingOverride[]> {
  const win = window(days);
  const [absent, covering] = await Promise.all([
    tx.timetableOverride.findMany({
      where: { date: win, entry: { teacherId }, ...VISIBLE_OVERRIDE },
      include: overrideInclude,
      orderBy: { date: 'asc' },
    }),
    tx.timetableOverride.findMany({
      where: { date: win, kind: 'SUBSTITUTION', approvalStatus: 'APPROVED', substituteTeacherId: teacherId },
      include: overrideInclude,
      orderBy: { date: 'asc' },
    }),
  ]);
  return [...absent.map((o) => map(o, 'absent')), ...covering.map((o) => map(o, 'covering'))].sort(
    (a, b) => a.date.localeCompare(b.date),
  );
}
