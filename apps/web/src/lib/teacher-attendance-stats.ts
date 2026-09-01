import 'server-only';
import { NO_REASON_COLOR } from '@/lib/staff-absence-reasons';

type Tx = Parameters<Parameters<typeof import('@/lib/db').withTenant>[1]>[0];

/** Seuil réglementaire séparant absence courte et absence longue (en jours). */
export const LONG_ABSENCE_DAYS = 15;

export type TeacherAttendanceStats = {
  /** Journées pointées, tous statuts confondus. */
  totalDays: number;
  presentDays: number;
  absentDays: number;
  /** Journées d'absence appartenant à un épisode de plus de 15 jours. */
  longAbsenceDays: number;
  shortAbsenceDays: number;
  presenceRate: number | null;
  absenceRate: number | null;
  /** Séries mensuelles, alignées sur les mois de l'année scolaire. */
  monthly: {
    absences: number[];
    longAbsences: number[];
    shortAbsences: number[];
    absenceRate: (number | null)[];
  };
  /** Ventilation par motif (donut + taux par motif). */
  byReason: { label: string; color: string; days: number }[];
  /** Absences par jour de semaine — repère les pics du lundi et du vendredi. */
  byWeekday: number[];
  /** Professeurs à surveiller, les plus exposés en tête. */
  atRisk: {
    personId: string;
    name: string;
    absencesThisMonth: number;
    totalDays: number;
    reasons: string[];
  }[];
};

const WEEKDAYS = 7;

/**
 * Assiduité des enseignants sur l'année scolaire.
 *
 * Deux partis pris de calcul :
 *
 *  - Le taux est un **taux de journées pointées**, pas de créneaux : le
 *    pointage du personnel est journalier. Il n'est donc pas comparable au taux
 *    d'assiduité des élèves, qui compte des présences par séance.
 *  - Une absence est **longue** si elle appartient à un épisode continu de plus
 *    de 15 jours (seuil du ministère). On reconstitue les épisodes en chaînant
 *    les journées consécutives, plutôt que de compter les journées isolément —
 *    sans quoi 20 absences éparpillées passeraient pour une absence longue.
 */
export async function teacherAttendanceStats(
  tx: Tx,
  monthCount: number,
  yearStart: Date | null,
  displayName: (p: {
    firstName: string;
    lastName: string;
    firstNameAr: string | null;
    lastNameAr: string | null;
  }) => string,
  reasonLabel: (r: { label: string; labelAr: string | null }) => string,
): Promise<TeacherAttendanceStats> {
  const zeros = (n: number) => Array.from({ length: n }, () => 0);
  const empty: TeacherAttendanceStats = {
    totalDays: 0,
    presentDays: 0,
    absentDays: 0,
    longAbsenceDays: 0,
    shortAbsenceDays: 0,
    presenceRate: null,
    absenceRate: null,
    monthly: {
      absences: zeros(monthCount),
      longAbsences: zeros(monthCount),
      shortAbsences: zeros(monthCount),
      absenceRate: Array.from({ length: monthCount }, () => null),
    },
    byReason: [],
    byWeekday: zeros(WEEKDAYS),
    atRisk: [],
  };
  if (!yearStart) return empty;

  const y0 = yearStart.getUTCFullYear();
  const m0 = yearStart.getUTCMonth();
  const start = new Date(Date.UTC(y0, m0, 1));
  const end = new Date(Date.UTC(y0, m0 + monthCount, 1));

  const rows = await tx.staffAttendance.findMany({
    where: {
      date: { gte: start, lt: end },
      person: { type: 'TEACHER', deletedAt: null },
    },
    select: {
      personId: true,
      date: true,
      status: true,
      person: {
        select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true },
      },
      absenceReason: { select: { label: true, labelAr: true, color: true } },
    },
    orderBy: [{ personId: 'asc' }, { date: 'asc' }],
  });
  if (rows.length === 0) return empty;

  const monthIndex = (d: Date) => (d.getUTCFullYear() - y0) * 12 + (d.getUTCMonth() - m0);
  const isAbsent = (status: string) => status === 'ABSENT';

  const out: TeacherAttendanceStats = { ...empty, byReason: [], atRisk: [] };
  out.monthly = {
    absences: zeros(monthCount),
    longAbsences: zeros(monthCount),
    shortAbsences: zeros(monthCount),
    absenceRate: Array.from({ length: monthCount }, () => null),
  };
  out.byWeekday = zeros(WEEKDAYS);
  const monthTotals = zeros(monthCount);

  // ── Épisodes continus, par enseignant ───────────────────────────────────
  // `longDays` retient les journées appartenant à un épisode de plus de 15
  // jours consécutifs ; c'est la définition ministérielle de l'absence longue.
  const longDays = new Set<string>();
  let episode: { personId: string; days: Date[] } | null = null;
  const flush = () => {
    if (episode && episode.days.length > LONG_ABSENCE_DAYS) {
      for (const d of episode.days) longDays.add(`${episode.personId}|${d.toISOString()}`);
    }
    episode = null;
  };
  for (const r of rows) {
    if (!isAbsent(r.status)) {
      flush();
      continue;
    }
    const prev = episode?.days[episode.days.length - 1];
    const contiguous =
      episode?.personId === r.personId &&
      prev !== undefined &&
      r.date.getTime() - prev.getTime() <= 86_400_000 * 3; // tolère un week-end
    if (contiguous) episode!.days.push(r.date);
    else {
      flush();
      episode = { personId: r.personId, days: [r.date] };
    }
  }
  flush();

  // ── Agrégats ────────────────────────────────────────────────────────────
  const reasonDays = new Map<string, { label: string; color: string; days: number }>();
  const perTeacher = new Map<
    string,
    { name: string; total: number; thisMonth: number; reasons: Set<string> }
  >();
  const nowMonth = monthIndex(new Date());

  for (const r of rows) {
    const k = monthIndex(r.date);
    if (k < 0 || k >= monthCount) continue;
    out.totalDays += 1;
    monthTotals[k]! += 1;

    if (!isAbsent(r.status)) {
      out.presentDays += 1;
      continue;
    }

    out.absentDays += 1;
    out.monthly.absences[k]! += 1;
    out.byWeekday[r.date.getUTCDay()]! += 1;

    const isLong = longDays.has(`${r.personId}|${r.date.toISOString()}`);
    if (isLong) {
      out.longAbsenceDays += 1;
      out.monthly.longAbsences[k]! += 1;
    } else {
      out.shortAbsenceDays += 1;
      out.monthly.shortAbsences[k]! += 1;
    }

    const label = r.absenceReason ? reasonLabel(r.absenceReason) : '—';
    const color = r.absenceReason?.color ?? NO_REASON_COLOR;
    const cur = reasonDays.get(label) ?? { label, color, days: 0 };
    cur.days += 1;
    reasonDays.set(label, cur);

    const t = perTeacher.get(r.personId) ?? {
      name: displayName(r.person),
      total: 0,
      thisMonth: 0,
      reasons: new Set<string>(),
    };
    t.total += 1;
    if (k === nowMonth) t.thisMonth += 1;
    if (r.absenceReason) t.reasons.add(label);
    perTeacher.set(r.personId, t);
  }

  out.presenceRate = out.totalDays > 0 ? (out.presentDays / out.totalDays) * 100 : null;
  out.absenceRate = out.totalDays > 0 ? (out.absentDays / out.totalDays) * 100 : null;
  for (let k = 0; k < monthCount; k++) {
    out.monthly.absenceRate[k] =
      monthTotals[k]! > 0 ? (out.monthly.absences[k]! / monthTotals[k]!) * 100 : null;
  }
  out.byReason = [...reasonDays.values()].sort((a, b) => b.days - a.days);

  // Seuils d'alerte : 3 absences dans le mois, ou 10 journées cumulées.
  out.atRisk = [...perTeacher]
    .map(([personId, t]) => ({
      personId,
      name: t.name,
      absencesThisMonth: t.thisMonth,
      totalDays: t.total,
      reasons: [...t.reasons],
    }))
    .filter((t) => t.absencesThisMonth >= 3 || t.totalDays >= 10)
    .sort((a, b) => b.totalDays - a.totalDays || b.absencesThisMonth - a.absencesThisMonth);

  return out;
}
