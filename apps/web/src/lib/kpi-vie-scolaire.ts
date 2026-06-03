import 'server-only';
import type { Prisma } from '@/lib/db';
import type { KpiStatus } from '@/lib/kpi-pilotage';
import { findAtRiskStudents } from '@/lib/bi';

type Tx = Prisma.TransactionClient;

export type VieScolaireData = {
  presenceTodayRate: number | null; // %
  presenceTodayStatus: KpiStatus;
  presenceTodayTotal: number;
  unjustifiedAbsences: number;
  lateCumulative: number;
  lateTrend: number[]; // 6 dernières semaines (chronologique)
  incidentsDisciplinary: number | null; // N/A
  notificationsRate: number | null; // N/A
  recordsComplete: number | null; // %
  recordsCompleteStatus: KpiStatus;
  medicalIncidents: number | null; // N/A
  atRisk: Awaited<ReturnType<typeof findAtRiskStudents>>;
};

const statusPresence = (v: number | null): KpiStatus =>
  v === null ? 'na' : v >= 95 ? 'green' : v >= 90 ? 'orange' : 'red';
const statusRecords = (v: number | null): KpiStatus =>
  v === null ? 'na' : v >= 90 ? 'green' : v >= 75 ? 'orange' : 'red';

function dayRange(d: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/**
 * Cockpit Vie scolaire (CPE) pour la période active. Présence du jour,
 * absences non justifiées, retards (+ tendance), dossiers administratifs
 * complets (heuristique), élèves à risque. Incidents disciplinaires/médicaux
 * et notifications parents = `null` (aucun modèle) → affichés « N/A ».
 * À appeler dans un `withTenant`.
 */
export async function computeVieScolaire(
  tx: Tx,
  periodId: string | null,
): Promise<VieScolaireData> {
  const now = new Date();
  const today = dayRange(now);

  // 1) Présence du jour (sessions finalisées aujourd'hui).
  const todayRecords = await tx.attendanceRecord.findMany({
    where: { session: { finalizedAt: { not: null }, date: { gte: today.start, lt: today.end } } },
    select: { status: true },
  });
  const presenceTodayTotal = todayRecords.length;
  const presentToday = todayRecords.filter((r) => r.status !== 'ABSENT').length;
  const presenceTodayRate = presenceTodayTotal > 0 ? (presentToday / presenceTodayTotal) * 100 : null;

  // Période active pour les cumuls.
  const period = periodId
    ? await tx.period.findUnique({ where: { id: periodId }, select: { startDate: true, endDate: true } })
    : null;

  // 2) Absences non justifiées (ABSENT sans justificatif approuvé) sur la période.
  let unjustifiedAbsences = 0;
  let lateCumulative = 0;
  if (period) {
    const records = await tx.attendanceRecord.findMany({
      where: {
        status: { in: ['ABSENT', 'LATE'] },
        session: { finalizedAt: { not: null }, date: { gte: period.startDate, lte: period.endDate } },
      },
      select: { status: true, justification: { select: { status: true } } },
    });
    unjustifiedAbsences = records.filter(
      (r) => r.status === 'ABSENT' && r.justification?.status !== 'APPROVED',
    ).length;
    lateCumulative = records.filter((r) => r.status === 'LATE').length;
  }

  // 4 bis) Tendance retards : 6 dernières semaines.
  const lateTrend: number[] = [];
  const weekLate = await tx.attendanceRecord.findMany({
    where: {
      status: 'LATE',
      session: {
        finalizedAt: { not: null },
        date: { gte: new Date(today.end.getTime() - 42 * 86400000), lt: today.end },
      },
    },
    select: { session: { select: { date: true } } },
  });
  for (let w = 5; w >= 0; w--) {
    const from = new Date(today.end.getTime() - (w + 1) * 7 * 86400000);
    const to = new Date(today.end.getTime() - w * 7 * 86400000);
    lateTrend.push(weekLate.filter((r) => r.session.date >= from && r.session.date < to).length);
  }

  // 6) Dossiers élèves complets (heuristique : date de naissance + un contact
  //    + au moins un parent rattaché).
  const students = await tx.person.findMany({
    where: { type: 'STUDENT', deletedAt: null },
    select: {
      birthDate: true,
      contacts: true,
      _count: { select: { relationsAsChild: true } },
    },
  });
  let recordsComplete: number | null = null;
  let recordsCompleteStatus: KpiStatus = 'na';
  if (students.length > 0) {
    const complete = students.filter((s) => {
      const c = (s.contacts ?? {}) as { email?: string; phone?: string };
      return !!s.birthDate && !!(c.email || c.phone) && s._count.relationsAsChild > 0;
    }).length;
    recordsComplete = (complete / students.length) * 100;
    recordsCompleteStatus = statusRecords(recordsComplete);
  }

  // 8) Élèves à risque (réutilise la BI existante).
  const atRisk = period ? await findAtRiskStudents(tx, periodId!, { limit: 5 }) : [];

  return {
    presenceTodayRate,
    presenceTodayStatus: statusPresence(presenceTodayRate),
    presenceTodayTotal,
    unjustifiedAbsences,
    lateCumulative,
    lateTrend,
    incidentsDisciplinary: null,
    notificationsRate: null,
    recordsComplete,
    recordsCompleteStatus,
    medicalIncidents: null,
    atRisk,
  };
}
