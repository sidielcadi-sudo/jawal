import 'server-only';
import { floorDate } from '@/lib/year-bounds';
import type { Prisma } from '@/lib/db';
import type { KpiStatus } from '@/lib/kpi-pilotage';
import { findAtRiskStudents } from '@/lib/bi';
import { listConversationsForParticipant } from '@/lib/messaging';

type Tx = Prisma.TransactionClient;

/** Index JS getUTCDay() (0 = dimanche) → enum DayOfWeek. */
const DAY_OF_WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

export type VieScolaireData = {
  // ── Bloc 1 — Présence & assiduité ──────────────────────────────────────
  presenceTodayRate: number | null; // %
  presenceTodayStatus: KpiStatus;
  presenceTodayTotal: number;
  /** Absences de la période, ventilées par justification. */
  absJustified: number;
  absUnjustified: number;
  lateToday: number;
  lateCumulative: number;
  lateTrend: number[]; // 6 dernières semaines (chronologique)
  abs7: number; // absences des 7 derniers jours
  abs30: number; // absences des 30 derniers jours

  // ── Bloc 2 — Discipline & comportement ─────────────────────────────────
  /** Gravité déduite du type de carnet (remarque < avertissement < exclusion). */
  incidents: { light: number; medium: number; severe: number; total: number };
  positives: { encouragements: number; felicitations: number; total: number };
  atRisk: Awaited<ReturnType<typeof findAtRiskStudents>>;

  // ── Bloc 3 — Organisation scolaire ─────────────────────────────────────
  sessionsPlanned: number;
  sessionsCancelled: number;
  substitutions: number;
  /** Aucun modèle « activités parascolaires » en base → N/A. */
  extracurricular: null;

  // ── Bloc 4 — Vie pratique ──────────────────────────────────────────────
  /** Effectif attendu à la cantine (demi-pensionnaires + internes). */
  canteenExpected: number;
  /** Aucun modèle « menu du jour » / « badge repas » → N/A. */
  canteenMenu: null;
  canteenBadge: null;
  transportToday: { morning: number; evening: number; late: number; incidents: number } | null;
  /** Effectif interne (régime INTERNE). */
  boardingExpected: number;
  /** Aucun modèle « pointage / incidents internat » → N/A. */
  boardingIncidents: null;

  // ── Bloc 5 — Communication ─────────────────────────────────────────────
  unreadMessages: number | null; // null si pas de compte utilisateur
  announcements7: number;
  /** Aucun modèle « RDV parents-professeurs » → N/A. */
  meetings: null;
};

const statusPresence = (v: number | null): KpiStatus =>
  v === null ? 'na' : v >= 95 ? 'green' : v >= 90 ? 'orange' : 'red';

function dayRange(d: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/**
 * Cockpit Vie scolaire (CPE), organisé en 5 blocs : présence & assiduité,
 * discipline & comportement, organisation scolaire, vie pratique, communication.
 *
 * Les indicateurs sans modèle en base (activités parascolaires, menus/badge
 * cantine, pointage internat, RDV parents-professeurs) sont renvoyés à `null`
 * et affichés « N/A » côté page.
 *
 * À appeler dans un `withTenant`.
 */
export async function computeVieScolaire(
  tx: Tx,
  periodId: string | null,
  userId?: string,
): Promise<VieScolaireData> {
  const now = new Date();
  const today = dayRange(now);
  const dayKey = DAY_OF_WEEK[now.getUTCDay()]!;
  const since7 = new Date(today.end.getTime() - 7 * 86_400_000);
  const since30 = new Date(today.end.getTime() - 30 * 86_400_000);
  // Les fenêtres glissantes (30 jours, 6 semaines) ne remontent pas avant la
  // rentrée : en septembre, elles compteraient les absences de l'an passé.
  const rentree = await tx.academicYear.findFirst({
    where: { active: true },
    select: { startDate: true },
  });
  const floor = (d: Date) => floorDate(d, rentree?.startDate);

  // ── Bloc 1 — Présence & assiduité ──────────────────────────────────────
  const todayRecords = await tx.attendanceRecord.findMany({
    where: { session: { finalizedAt: { not: null }, date: { gte: today.start, lt: today.end } } },
    select: { status: true },
  });
  const presenceTodayTotal = todayRecords.length;
  const presentToday = todayRecords.filter((r) => r.status !== 'ABSENT').length;
  const presenceTodayRate =
    presenceTodayTotal > 0 ? (presentToday / presenceTodayTotal) * 100 : null;
  const lateToday = todayRecords.filter((r) => r.status === 'LATE').length;

  const period = periodId
    ? await tx.period.findUnique({
        where: { id: periodId },
        select: { startDate: true, endDate: true },
      })
    : null;

  // Absences justifiées / non justifiées + retards cumulés (sur la période).
  let absJustified = 0;
  let absUnjustified = 0;
  let lateCumulative = 0;
  if (period) {
    const records = await tx.attendanceRecord.findMany({
      where: {
        status: { in: ['ABSENT', 'LATE'] },
        session: { finalizedAt: { not: null }, date: { gte: period.startDate, lte: period.endDate } },
      },
      select: { status: true, justification: { select: { status: true } } },
    });
    for (const r of records) {
      if (r.status === 'LATE') lateCumulative += 1;
      else if (r.justification?.status === 'APPROVED') absJustified += 1;
      else absUnjustified += 1;
    }
  }

  // Historique des absences : 7 et 30 derniers jours (une seule requête).
  const absHistory = await tx.attendanceRecord.findMany({
    where: {
      status: 'ABSENT',
      session: { finalizedAt: { not: null }, date: { gte: floor(since30), lt: today.end } },
    },
    select: { session: { select: { date: true } } },
  });
  const abs30 = absHistory.length;
  const abs7 = absHistory.filter((r) => r.session.date >= since7).length;

  // Tendance des retards : 6 dernières semaines.
  const weekLate = await tx.attendanceRecord.findMany({
    where: {
      status: 'LATE',
      session: {
        finalizedAt: { not: null },
        date: { gte: floor(new Date(today.end.getTime() - 42 * 86_400_000)), lt: today.end },
      },
    },
    select: { session: { select: { date: true } } },
  });
  const lateTrend: number[] = [];
  for (let w = 5; w >= 0; w--) {
    const from = new Date(today.end.getTime() - (w + 1) * 7 * 86_400_000);
    const to = new Date(today.end.getTime() - w * 7 * 86_400_000);
    lateTrend.push(weekLate.filter((r) => r.session.date >= from && r.session.date < to).length);
  }

  // ── Bloc 2 — Discipline & comportement ─────────────────────────────────
  // Fenêtre : la période sélectionnée, sinon les 30 derniers jours.
  const carnetFrom = period?.startDate ?? since30;
  const carnetTo = period?.endDate ?? today.end;
  const carnetCounts = await tx.carnetEntry.groupBy({
    by: ['type'],
    where: { occurredAt: { gte: carnetFrom, lte: carnetTo } },
    _count: true,
  });
  const countOf = (t: string) => carnetCounts.find((c) => c.type === t)?._count ?? 0;
  // Gravité déduite du type (pas de champ `severity` en base) :
  //   remarque disciplinaire < avertissement < exclusion.
  const light = countOf('REMARQUE_DISCIPLINAIRE');
  const medium = countOf('AVERTISSEMENT');
  const severe = countOf('EXCLUSION');
  const encouragements = countOf('ENCOURAGEMENT');
  const felicitations = countOf('FELICITATION');

  const atRisk = periodId ? await findAtRiskStudents(tx, periodId, { limit: 5 }) : [];

  // ── Bloc 3 — Organisation scolaire ─────────────────────────────────────
  const activeYear = await tx.academicYear.findFirst({
    where: { active: true },
    select: { id: true },
  });
  const sessionsPlanned = activeYear
    ? await tx.timetableEntry.count({
        where: { academicYearId: activeYear.id, dayOfWeek: dayKey },
      })
    : 0;
  const overrides = await tx.timetableOverride.groupBy({
    by: ['kind'],
    where: { date: { gte: today.start, lt: today.end } },
    _count: true,
  });
  const sessionsCancelled = overrides.find((o) => o.kind === 'CANCELLED')?._count ?? 0;
  const substitutions = overrides.find((o) => o.kind === 'SUBSTITUTION')?._count ?? 0;

  // ── Bloc 4 — Vie pratique ──────────────────────────────────────────────
  const activeStudent = {
    type: 'STUDENT' as const,
    deletedAt: null,
    enrollments: { some: { status: 'ACTIVE' as const } },
  };
  const [canteenExpected, boardingExpected] = await Promise.all([
    tx.person.count({
      where: { ...activeStudent, regime: { in: ['DEMI_PENSIONNAIRE', 'INTERNE'] } },
    }),
    tx.person.count({ where: { ...activeStudent, regime: 'INTERNE' } }),
  ]);

  const transportRecords = await tx.transportAttendanceRecord.findMany({
    where: { session: { date: { gte: today.start, lt: today.end } } },
    select: { status: true, session: { select: { direction: true } } },
  });
  const transportToday =
    transportRecords.length > 0
      ? {
          morning: transportRecords.filter((r) => r.session.direction === 'MORNING').length,
          evening: transportRecords.filter((r) => r.session.direction === 'EVENING').length,
          late: transportRecords.filter((r) => r.status === 'LATE').length,
          incidents: transportRecords.filter((r) => r.status === 'INCIDENT').length,
        }
      : null;

  // ── Bloc 5 — Communication ─────────────────────────────────────────────
  let unreadMessages: number | null = null;
  if (userId) {
    const convos = await listConversationsForParticipant(tx, userId);
    unreadMessages = convos.filter((c) => c.flag).length;
  }
  const announcements7 = await tx.announcement.count({
    where: { publishedAt: { not: null, gte: since7, lte: now } },
  });

  return {
    presenceTodayRate,
    presenceTodayStatus: statusPresence(presenceTodayRate),
    presenceTodayTotal,
    absJustified,
    absUnjustified,
    lateToday,
    lateCumulative,
    lateTrend,
    abs7,
    abs30,
    incidents: { light, medium, severe, total: light + medium + severe },
    positives: { encouragements, felicitations, total: encouragements + felicitations },
    atRisk,
    sessionsPlanned,
    sessionsCancelled,
    substitutions,
    extracurricular: null,
    canteenExpected,
    canteenMenu: null,
    canteenBadge: null,
    transportToday,
    boardingExpected,
    boardingIncidents: null,
    unreadMessages,
    announcements7,
    meetings: null,
  };
}
