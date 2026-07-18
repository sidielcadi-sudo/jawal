import 'server-only';
import type { Prisma } from '@/lib/db';

type Tx = Prisma.TransactionClient;

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

/** Statut d'avancement de l'approbation des remplacements d'une absence prof. */
export type RollupStatus = 'PENDING' | 'PARTIAL' | 'APPROVED' | 'NONE';
export type Rollup = { status: RollupStatus; approved: number; total: number };

/**
 * Pour un lot d'absences enseignants, calcule l'état d'approbation de leurs
 * remplacements : une séance est « approuvée » si son override (remplacement ou
 * annulation) est APPROVED. Rollup :
 *  - APPROVED : toutes les séances approuvées,
 *  - PARTIAL  : certaines approuvées,
 *  - PENDING  : aucune approuvée,
 *  - NONE     : aucune séance à couvrir (absence hors jours de cours).
 */
export async function computeSubstitutionRollups(
  tx: Tx,
  leaves: { id: string; personId: string; startDate: Date; endDate: Date }[],
): Promise<Map<string, Rollup>> {
  const result = new Map<string, Rollup>();
  if (leaves.length === 0) return result;

  const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
  if (!year) {
    for (const l of leaves) result.set(l.id, { status: 'NONE', approved: 0, total: 0 });
    return result;
  }

  const teacherIds = [...new Set(leaves.map((l) => l.personId))];
  const entries = await tx.timetableEntry.findMany({
    where: { academicYearId: year.id, teacherId: { in: teacherIds }, slot: { isBreak: false } },
    select: { id: true, teacherId: true, dayOfWeek: true },
  });
  const entriesByTeacher = new Map<string, { id: string; dayOfWeek: string }[]>();
  for (const e of entries) {
    if (!e.teacherId) continue;
    (entriesByTeacher.get(e.teacherId) ?? entriesByTeacher.set(e.teacherId, []).get(e.teacherId)!).push({
      id: e.id,
      dayOfWeek: e.dayOfWeek,
    });
  }

  const allEntryIds = entries.map((e) => e.id);
  const minStart = new Date(Math.min(...leaves.map((l) => l.startDate.getTime())));
  const maxEnd = new Date(Math.max(...leaves.map((l) => l.endDate.getTime())));
  const overrides = allEntryIds.length
    ? await tx.timetableOverride.findMany({
        where: { entryId: { in: allEntryIds }, date: { gte: minStart, lte: maxEnd } },
        select: { entryId: true, date: true, kind: true, substituteTeacherId: true, approvalStatus: true },
      })
    : [];
  const ovByKey = new Map(overrides.map((o) => [`${o.entryId}|${o.date.toISOString().slice(0, 10)}`, o]));

  for (const l of leaves) {
    const tEntries = entriesByTeacher.get(l.personId) ?? [];
    let total = 0;
    let approved = 0;
    const d = new Date(Date.UTC(l.startDate.getUTCFullYear(), l.startDate.getUTCMonth(), l.startDate.getUTCDate()));
    const last = new Date(Date.UTC(l.endDate.getUTCFullYear(), l.endDate.getUTCMonth(), l.endDate.getUTCDate()));
    while (d <= last) {
      const code = DOW[d.getUTCDay()];
      const dateStr = d.toISOString().slice(0, 10);
      for (const e of tEntries) {
        if (e.dayOfWeek !== code) continue;
        total++;
        const ov = ovByKey.get(`${e.id}|${dateStr}`);
        if (ov && ov.approvalStatus === 'APPROVED' && (ov.kind === 'CANCELLED' || ov.substituteTeacherId)) {
          approved++;
        }
      }
      d.setUTCDate(d.getUTCDate() + 1);
    }
    const status: RollupStatus =
      total === 0 ? 'NONE' : approved === total ? 'APPROVED' : approved > 0 ? 'PARTIAL' : 'PENDING';
    result.set(l.id, { status, approved, total });
  }
  return result;
}
