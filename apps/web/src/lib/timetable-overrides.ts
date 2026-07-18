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
      class: { select: { name: true } },
      subject: { select: { label: true } },
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
