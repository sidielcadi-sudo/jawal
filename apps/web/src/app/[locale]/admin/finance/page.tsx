import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { installmentStepMonths } from '@/lib/fees';
import { loadUnpaidByFamily } from '@/lib/unpaid';
import { kpiTone } from '@/lib/kpi-tones';
import { DistributionTabs } from './distribution';
import { YearSelect } from './year-select';
import { personDisplayName } from '@/lib/localized-name';

export default async function FinanceDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; year?: string; section?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const t = await getTranslations('admin.finance');

  // Onglets de premier niveau de la page Finances.
  const SECTIONS = ['revenus', 'impayes', 'depenses', 'tresorerie', 'rentabilite', 'suivi'] as const;
  type Section = (typeof SECTIONS)[number];
  const section: Section = (SECTIONS as readonly string[]).includes(sp.section ?? '')
    ? (sp.section as Section)
    : 'revenus';

  const session = (await auth())!;
  const tenantId = session.user.tenantId;

  const data = await withTenant(tenantId, async (tx) => {
    const tenant = await tx.tenant.findFirst();

    // Sommes globales en JS (Decimal Prisma → Number via aggregate)
    const allInstallments = await tx.installment.findMany({
      where: { status: { not: 'CANCELLED' } },
      select: { id: true, amount: true, status: true, studentId: true, dueDate: true, feeScheduleItemId: true, supportCourseId: true },
    });
    const allPayments = await tx.payment.findMany({
      select: { amount: true, paidAt: true, installmentId: true, method: true },
    });

    // Année scolaire sélectionnée → fenêtre de filtrage. KPI, listes d'impayés
    // et répartition ne comptent que les échéances dont la date tombe dans cette
    // année (12 mois à partir du début de l'année scolaire).
    const today = new Date();
    const years = await tx.academicYear.findMany({
      orderBy: { startDate: 'desc' },
      select: { id: true, label: true, active: true, startDate: true },
    });
    const activeYear = years.find((y) => y.active);
    const selectedYearId = sp.year ?? activeYear?.id ?? years[0]?.id ?? null;
    const selectedYear = years.find((y) => y.id === selectedYearId);
    const fallbackStart = new Date(
      today.getUTCMonth() >= 8 ? today.getUTCFullYear() : today.getUTCFullYear() - 1,
      8,
      1,
    );
    const ys0 = startOfMonth(selectedYear ? new Date(selectedYear.startDate) : fallbackStart);
    const yearEnd = addMonths(ys0, 12);
    const yearInstallments = allInstallments.filter((i) => i.dueDate >= ys0 && i.dueDate < yearEnd);

    let totalDue = 0;
    let totalPaid = 0;
    const paidByInst = new Map<string, number>();
    for (const p of allPayments) {
      paidByInst.set(p.installmentId, (paidByInst.get(p.installmentId) ?? 0) + Number(p.amount));
    }
    // « À date » : on ne retient que les échéances déjà tombées. C'est la
    // mesure qui juge le recouvrement — le total de l'année inclut des
    // échéances à venir, dont l'absence de paiement n'est pas un retard.
    //
    // Le reste à date se calcule échéance par échéance, jamais comme
    // « dû à date − encaissé total » : un versement d'avance sur une échéance
    // de juin viendrait effacer un impayé d'octobre et masquerait l'arriéré.
    let dueToDate = 0;
    let paidToDate = 0;
    let remainingToDate = 0;
    for (const i of yearInstallments) {
      const paid = paidByInst.get(i.id) ?? 0;
      totalDue += Number(i.amount);
      totalPaid += paid;
      if (i.dueDate <= today) {
        dueToDate += Number(i.amount);
        paidToDate += paid;
        remainingToDate += Math.max(0, Number(i.amount) - paid);
      }
    }
    const collectionRate = totalDue > 0 ? (totalPaid / totalDue) * 100 : 0;
    // Le taux qui juge réellement le recouvrement : il rapporte l'encaissé aux
    // seules échéances tombées. Le taux annuel, lui, part toujours très bas en
    // début d'année puisque l'essentiel des échéances est encore à venir.
    const collectionRateToDate = dueToDate > 0 ? (paidToDate / dueToDate) * 100 : 0;

    // Répartition des montants encaissés par moyen de paiement (sur l'année) —
    // même périmètre que « Encaissé » (paiements des échéances de l'année).
    const yearInstIds = new Set(yearInstallments.map((i) => i.id));
    const byMethodMap = new Map<string, number>();
    for (const p of allPayments) {
      if (!yearInstIds.has(p.installmentId)) continue;
      byMethodMap.set(p.method, (byMethodMap.get(p.method) ?? 0) + Number(p.amount));
    }
    const byMethod = [...byMethodMap.entries()]
      .map(([method, amount]) => ({ method, amount }))
      .sort((a, b) => b.amount - a.amount);

    // Top 10 élèves en retard de paiement (totalRemaining décroissant)
    const remainingByStudent = new Map<string, number>();
    for (const i of yearInstallments) {
      const paid = paidByInst.get(i.id) ?? 0;
      const rem = Math.max(0, Number(i.amount) - paid);
      if (rem > 0) {
        remainingByStudent.set(i.studentId, (remainingByStudent.get(i.studentId) ?? 0) + rem);
      }
    }
    const topUnpaidIds = Array.from(remainingByStudent.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id);
    const topUnpaid = topUnpaidIds.length
      ? await tx.person.findMany({
          where: { id: { in: topUnpaidIds } },
          select: { id: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true },
        })
      : [];

    // Statut par élève basé sur la date d'échéance :
    //  - Soldé : plus rien à payer ;
    //  - En retard : au moins une échéance impayée dont la date est dépassée ;
    //  - À jour : reste à payer mais aucune échéance encore échue.
    const now = new Date();
    const dueByStudent = new Map<string, number>();
    const overdueByStudent = new Set<string>();
    for (const i of yearInstallments) {
      dueByStudent.set(i.studentId, (dueByStudent.get(i.studentId) ?? 0) + Number(i.amount));
      const rem = Number(i.amount) - (paidByInst.get(i.id) ?? 0);
      if (rem > 0 && i.dueDate < now) overdueByStudent.add(i.studentId);
    }
    const studentIds = [...dueByStudent.keys()];
    const persons = studentIds.length
      ? await tx.person.findMany({
          where: {
            id: { in: studentIds },
            ...(q
              ? {
                  OR: [
                    { firstName: { contains: q, mode: 'insensitive' } },
                    { lastName: { contains: q, mode: 'insensitive' } },
                  ],
                }
              : {}),
          },
          select: { id: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true },
        })
      : [];
    const statusRank = { LATE: 0, UPTODATE: 1, PAID: 2 } as const;
    const studentList = persons
      .map((p) => {
        const remaining = remainingByStudent.get(p.id) ?? 0;
        const status: 'PAID' | 'LATE' | 'UPTODATE' =
          remaining <= 0 ? 'PAID' : overdueByStudent.has(p.id) ? 'LATE' : 'UPTODATE';
        return {
          id: p.id,
          name: personDisplayName(locale, p),
          due: dueByStudent.get(p.id) ?? 0,
          remaining,
          status,
        };
      })
      .sort(
        (a, b) =>
          statusRank[a.status] - statusRank[b.status] ||
          b.remaining - a.remaining ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 100);

    // Encaissements des 30 derniers jours
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recent = allPayments.filter((p) => p.paidAt >= since);
    const recentTotal = recent.reduce((s, p) => s + Number(p.amount), 0);

    // ---- Histogramme : répartition par type d'échéances sur l'année ----
    // Échéances classées par cadence (pas en mois de la grille tarifaire).
    // Uniquement les frais ANNUELS (kind=ANNUAL) ; les grilles EXCEPTIONNELLES
    // et les frais ad hoc (sans grille) sont exclus.
    const schedules = await tx.feeScheduleItem.findMany({
      select: { id: true, installmentCount: true, kind: true, category: true },
    });
    const schedSetByStep = (lo: number, hi: number) =>
      new Set(
        schedules
          .filter((s) => {
            if (s.kind !== 'ANNUAL') return false;
            const st = installmentStepMonths(s.installmentCount);
            return st >= lo && st <= hi;
          })
          .map((s) => s.id),
      );
    const idsForSchedules = (sch: Set<string>) =>
      new Set(
        allInstallments.filter((i) => i.feeScheduleItemId && sch.has(i.feeScheduleItemId)).map((i) => i.id),
      );
    const monthlyIds = idsForSchedules(schedSetByStep(1, 1));
    const quarterlyIds = idsForSchedules(schedSetByStep(2, 3));
    const semestrialIds = idsForSchedules(schedSetByStep(4, 6));
    const annualIds = idsForSchedules(schedSetByStep(7, 999));
    // Vue globale : toutes les échéances liées à une grille ANNUAL (toutes cadences).
    const allAnnualIds = idsForSchedules(
      new Set(schedules.filter((s) => s.kind === 'ANNUAL').map((s) => s.id)),
    );

    const buildBuckets = (
      instIds: Set<string>,
      nBuckets: number,
      monthsPer: number,
      labelFn: (k: number, start: Date) => string,
    ) => {
      const out: { label: string; due: number; collected: number }[] = [];
      for (let k = 0; k < nBuckets; k++) {
        const s = addMonths(ys0, k * monthsPer);
        const e = addMonths(ys0, (k + 1) * monthsPer);
        // Dû ET encaissé sur le même axe : celui de l'ÉCHÉANCE.
        //
        // L'encaissé était auparavant ventilé par date de PAIEMENT. Les deux
        // séries ne parlaient donc pas de la même chose, et « Impayé = Dû −
        // Encaissé » soustrayait des grandeurs hétérogènes : un règlement
        // d'octobre pour une échéance de septembre creusait un impayé de
        // septembre qui n'existait pas. Pire, les régularisations d'arriérés
        // d'un exercice antérieur entraient dans le graphe sans entrer dans
        // les indicateurs — 18 189 MAD d'écart sur ce jeu de données.
        //
        // Conséquence assumée : le graphe ne décrit plus la trésorerie du mois
        // mais le recouvrement des échéances du mois. C'est ce que mesurent
        // les indicateurs de tête, et c'est avec eux qu'il doit concorder.
        let due = 0;
        let collected = 0;
        for (const i of allInstallments) {
          if (!instIds.has(i.id) || i.dueDate < s || i.dueDate >= e) continue;
          due += Number(i.amount);
          collected += paidByInst.get(i.id) ?? 0;
        }
        out.push({ label: labelFn(k, s), due, collected });
      }
      return out;
    };
    const monthLabel = (_k: number, s: Date) => s.toLocaleDateString(locale, { month: 'short' });
    const globalHisto = buildBuckets(allAnnualIds, 12, 1, monthLabel);
    const monthlyHisto = buildBuckets(monthlyIds, 12, 1, monthLabel);
    const quarterlyHisto = buildBuckets(quarterlyIds, 4, 3, (k) => `T${k + 1}`);
    const semestrialHisto = buildBuckets(semestrialIds, 2, 6, (k) => `S${k + 1}`);
    const annualHisto = buildBuckets(annualIds, 12, 1, monthLabel);

    // ---- Répartition par activité (Dû / Encaissé / Impayé) sur l'année ----
    // Catégorie de frais → activité : scolarité / cantine / transport / exceptionnel.
    const ACTIVITY_OF: Record<string, 'tuition' | 'canteen' | 'transport' | 'other'> = {
      TUITION: 'tuition',
      INSCRIPTION: 'tuition',
      CANTEEN: 'canteen',
      TRANSPORT: 'transport',
      DAYCARE: 'other',
      OTHER: 'other',
    };
    const catById = new Map(schedules.map((s) => [s.id, s.category]));
    type Act = 'tuition' | 'canteen' | 'transport' | 'support' | 'other';
    const activityAgg: Record<Act, { due: number; collected: number }> = {
      tuition: { due: 0, collected: 0 },
      canteen: { due: 0, collected: 0 },
      transport: { due: 0, collected: 0 },
      support: { due: 0, collected: 0 },
      other: { due: 0, collected: 0 },
    };
    for (const i of yearInstallments) {
      // Les échéances de soutien (supportCourseId) forment leur propre activité.
      const act: Act = i.supportCourseId
        ? 'support'
        : (i.feeScheduleItemId && ACTIVITY_OF[catById.get(i.feeScheduleItemId) ?? '']) || 'other';
      activityAgg[act].due += Number(i.amount);
      activityAgg[act].collected += paidByInst.get(i.id) ?? 0;
    }
    const byActivity = [
      { label: t('activity.tuition'), ...activityAgg.tuition },
      { label: t('activity.canteen'), ...activityAgg.canteen },
      { label: t('activity.transport'), ...activityAgg.transport },
      { label: t('activity.support'), ...activityAgg.support },
      { label: t('activity.other'), ...activityAgg.other },
    ];

    // ─── Trésorerie ────────────────────────────────────────────────────────
    // Cash in = encaissements (paiements) ; cash out = dépenses enregistrées.
    const allExpenses = await tx.expense.findMany({ select: { amount: true, date: true, category: true } });
    const sumIn = (from: Date, to: Date) =>
      allPayments.reduce((s, p) => (p.paidAt >= from && p.paidAt < to ? s + Number(p.amount) : s), 0);
    const sumOut = (from: Date, to: Date) =>
      allExpenses.reduce((s, e) => (e.date >= from && e.date < to ? s + Number(e.amount) : s), 0);

    const monthStart = startOfMonth(today);
    const nextMonth = addMonths(monthStart, 1);
    const prevMonth = addMonths(monthStart, -1);
    const cashInMonth = sumIn(monthStart, nextMonth);
    const cashOutMonth = sumOut(monthStart, nextMonth);
    const cashInPrev = sumIn(prevMonth, monthStart);
    const cashOutPrev = sumOut(prevMonth, monthStart);
    const variation = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

    // Solde = cumul de tous les encaissements moins toutes les dépenses.
    const cashBalance =
      allPayments.reduce((s, p) => s + Number(p.amount), 0) -
      allExpenses.reduce((s, e) => s + Number(e.amount), 0);

    // Flux des 6 derniers mois (mois courant inclus).
    const cashFlow: { label: string; in: number; out: number }[] = [];
    for (let k = 5; k >= 0; k--) {
      const s = addMonths(monthStart, -k);
      const e = addMonths(s, 1);
      cashFlow.push({ label: s.toLocaleDateString(locale, { month: 'short' }), in: sumIn(s, e), out: sumOut(s, e) });
    }
    // Charge mensuelle moyenne sur les 6 mois → autonomie & couverture.
    const avgMonthlyOut = cashFlow.reduce((s, f) => s + f.out, 0) / (cashFlow.length || 1);
    const coverageMonths = avgMonthlyOut > 0 ? cashBalance / avgMonthlyOut : null;
    const autonomyDays = avgMonthlyOut > 0 ? Math.round((cashBalance / avgMonthlyOut) * 30) : null;

    // Projection 3 mois : encaissements = reste dû des échéances à venir ;
    // dépenses = charge mensuelle moyenne × 3.
    const in3End = addMonths(monthStart, 3);
    const projectedIn = allInstallments.reduce((s, i) => {
      if (i.dueDate < today || i.dueDate >= in3End) return s;
      return s + Math.max(0, Number(i.amount) - (paidByInst.get(i.id) ?? 0));
    }, 0);
    const projectedOut = avgMonthlyOut * 3;

    // ─── Rentabilité ───────────────────────────────────────────────────────
    // Résultat net sur l'année sélectionnée = encaissé − dépenses de l'année.
    const yearExpenses = sumOut(ys0, yearEnd);
    const netResult = totalPaid - yearExpenses;
    const netMargin = totalPaid > 0 ? (netResult / totalPaid) * 100 : 0;
    const studentCount = await tx.person.count({
      where: { type: 'STUDENT', deletedAt: null, enrollments: { some: { status: 'ACTIVE' } } },
    });
    const revenuePerStudent = studentCount > 0 ? totalPaid / studentCount : 0;

    // ─── Impayés & recouvrement ────────────────────────────────────────────
    const DAY = 86_400_000;
    const AGING = [
      { key: 'd0_30', max: 30 },
      { key: 'd31_60', max: 60 },
      { key: 'd61_90', max: 90 },
      { key: 'd90p', max: Infinity },
    ];
    const aging = AGING.map((b) => ({ key: b.key, amount: 0 }));
    for (const i of yearInstallments) {
      const rem = Math.max(0, Number(i.amount) - (paidByInst.get(i.id) ?? 0));
      if (rem <= 0 || i.dueDate >= today) continue;
      const days = Math.floor((today.getTime() - i.dueDate.getTime()) / DAY);
      const bucket = aging[AGING.findIndex((b) => days <= b.max)];
      if (bucket) bucket.amount += rem;
    }
    const unpaidRate = totalDue > 0 ? ((totalDue - totalPaid) / totalDue) * 100 : 0;

    // Relances enregistrées (PaymentReminder).
    const reminders = await tx.paymentReminder.findMany({
      where: { createdAt: { gte: ys0, lt: yearEnd } },
      select: { studentId: true, createdAt: true },
    });
    const inDunning = new Set(reminders.map((r) => r.studentId)).size;
    const stillOwing = [...new Set(reminders.map((r) => r.studentId))].filter(
      (id) => (remainingByStudent.get(id) ?? 0) > 0,
    ).length;

    // Montant récupéré ce mois = encaissements reçus APRÈS la date d'échéance.
    const dueByInst = new Map(allInstallments.map((i) => [i.id, i.dueDate]));
    let recoveredMonth = 0;
    for (const p of allPayments) {
      const d = dueByInst.get(p.installmentId);
      if (d && p.paidAt >= monthStart && p.paidAt < nextMonth && p.paidAt > d) recoveredMonth += Number(p.amount);
    }

    // Délai de relance = jours entre la 1re échéance impayée et la 1re relance.
    const firstReminder = new Map<string, Date>();
    for (const r of reminders) {
      const cur = firstReminder.get(r.studentId);
      if (!cur || r.createdAt < cur) firstReminder.set(r.studentId, r.createdAt);
    }
    const firstOverdue = new Map<string, Date>();
    for (const i of yearInstallments) {
      if (i.dueDate >= today) continue;
      if (Math.max(0, Number(i.amount) - (paidByInst.get(i.id) ?? 0)) <= 0) continue;
      const cur = firstOverdue.get(i.studentId);
      if (!cur || i.dueDate < cur) firstOverdue.set(i.studentId, i.dueDate);
    }
    const delays: number[] = [];
    for (const [sid, rd] of firstReminder) {
      const od = firstOverdue.get(sid);
      if (!od) continue;
      const d = Math.floor((rd.getTime() - od.getTime()) / DAY);
      if (d >= 0) delays.push(d);
    }
    const avgDunningDelay = delays.length
      ? Math.round(delays.reduce((s, d) => s + d, 0) / delays.length)
      : null;
    const DELAYS = [
      { key: 'd0_15', max: 15 },
      { key: 'd16_30', max: 30 },
      { key: 'd31_60', max: 60 },
      { key: 'd60p', max: Infinity },
    ];
    const delayDist = DELAYS.map((b) => ({ key: b.key, count: 0 }));
    for (const d of delays) {
      const slot = delayDist[DELAYS.findIndex((b) => d <= b.max)];
      if (slot) slot.count += 1;
    }

    // Efficacité des relances : taux de recouvrement avant / après la 1re
    // relance, sur les échéances déjà échues au moment où celle-ci est envoyée.
    const paymentsByInst = new Map<string, { amount: number; paidAt: Date }[]>();
    for (const p of allPayments) {
      const arr = paymentsByInst.get(p.installmentId) ?? [];
      arr.push({ amount: Number(p.amount), paidAt: p.paidAt });
      paymentsByInst.set(p.installmentId, arr);
    }
    const instByStudent = new Map<string, typeof allInstallments>();
    for (const i of yearInstallments) {
      const arr = instByStudent.get(i.studentId) ?? [];
      arr.push(i);
      instByStudent.set(i.studentId, arr);
    }
    let dunnedBase = 0; // dû échu à la date de relance
    let dunnedPaidBefore = 0; // encaissé avant la relance
    let dunnedPaidAfter = 0; // encaissé après la relance
    for (const [sid, rDate] of firstReminder) {
      for (const i of instByStudent.get(sid) ?? []) {
        if (i.dueDate >= rDate) continue;
        dunnedBase += Number(i.amount);
        for (const p of paymentsByInst.get(i.id) ?? []) {
          if (p.paidAt < rDate) dunnedPaidBefore += p.amount;
          else dunnedPaidAfter += p.amount;
        }
      }
    }
    const dunnedResidual = Math.max(0, dunnedBase - dunnedPaidBefore);
    const rateBefore = dunnedBase > 0 ? (dunnedPaidBefore / dunnedBase) * 100 : null;
    const rateAfter = dunnedResidual > 0 ? (dunnedPaidAfter / dunnedResidual) * 100 : null;
    const rateOverall =
      dunnedBase > 0 ? ((dunnedPaidBefore + dunnedPaidAfter) / dunnedBase) * 100 : null;

    // ─── Dépenses & charges ────────────────────────────────────────────────
    const expenseByCat = new Map<string, number>();
    for (const e of allExpenses) {
      if (e.date < ys0 || e.date >= yearEnd) continue;
      expenseByCat.set(e.category, (expenseByCat.get(e.category) ?? 0) + Number(e.amount));
    }
    const expenseCats = [...expenseByCat.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
    const costPerStudent = studentCount > 0 ? yearExpenses / studentCount : 0;

    // ─── Suivi administratif ───────────────────────────────────────────────
    const DIGITAL = new Set(['CMI', 'STRIPE', 'TRANSFER']);
    let digitalAmt = 0;
    let allPayAmt = 0;
    for (const p of allPayments) {
      // Taux de digitalisation de l'année : seuls les règlements portant sur
      // les échéances de l'exercice sélectionné comptent.
      if (!yearInstIds.has(p.installmentId)) continue;
      const a = Number(p.amount);
      allPayAmt += a;
      if (DIGITAL.has(p.method)) digitalAmt += a;
    }
    const digitalRate = allPayAmt > 0 ? (digitalAmt / allPayAmt) * 100 : 0;

    let overpaid = 0;
    for (const i of yearInstallments) {
      const ex = (paidByInst.get(i.id) ?? 0) - Number(i.amount);
      if (ex > 0) overpaid += ex;
    }
    const in30 = new Date(today.getTime() + 30 * DAY);
    const upcomingCount = yearInstallments.filter(
      (i) => i.dueDate >= today && i.dueDate < in30 && Number(i.amount) - (paidByInst.get(i.id) ?? 0) > 0,
    ).length;
    const transfersCount = await tx.radiationRequest.count({
      where: {
        type: 'TRANSFERT',
        ...(selectedYearId ? { enrollment: { academicYearId: selectedYearId } } : {}),
      },
    });

    // Impayés groupés par famille, bornés à l'année scolaire sélectionnée.
    // Les créances des exercices antérieurs ne polluent pas les indicateurs de
    // l'année : elles sont traitées dans « Gestion des impayés ».
    const unpaid = await loadUnpaidByFamily(tx, { from: ys0, to: yearEnd, yearId: selectedYearId ?? undefined });

    // Créances des exercices ANTÉRIEURS à l'année sélectionnée : hors des
    // indicateurs ci-dessus, mais on en annonce le montant et on renvoie vers
    // « Gestion des impayés », seul écran qui les détaille par année.
    let previousYearsUnpaid = 0;
    let previousYearsStudents = 0;
    {
      const seen = new Set<string>();
      for (const i of allInstallments) {
        if (i.dueDate >= ys0 || i.dueDate > today) continue;
        const rem = Number(i.amount) - (paidByInst.get(i.id) ?? 0);
        if (rem <= 0.01) continue;
        previousYearsUnpaid += rem;
        seen.add(i.studentId);
      }
      previousYearsStudents = seen.size;
    }

    return {
      currency: tenant?.currency ?? 'MAD',
      previousYearsUnpaid: Math.round(previousYearsUnpaid * 100) / 100,
      previousYearsStudents,
      totalDue,
      totalPaid,
      totalRemaining: Math.max(0, totalDue - totalPaid),
      dueToDate,
      paidToDate,
      remainingToDate,
      collectionRateToDate,
      collectionRate,
      installmentsCount: yearInstallments.length,
      paidCount: yearInstallments.filter((i) => i.status === 'PAID').length,
      pendingCount: yearInstallments.filter((i) => i.status === 'PENDING').length,
      partialCount: yearInstallments.filter((i) => i.status === 'PARTIAL').length,
      topUnpaid: topUnpaid.map((p) => ({
        ...p,
        remaining: remainingByStudent.get(p.id) ?? 0,
      })),
      studentList,
      recentTotal,
      recentCount: recent.length,
      globalHisto,
      monthlyHisto,
      quarterlyHisto,
      semestrialHisto,
      annualHisto,
      byActivity,
      byMethod,
      unpaidFamiliesCount: unpaid.familiesCount,
      topFamilies: unpaid.families.slice(0, 6),
      // Trésorerie
      cashBalance,
      autonomyDays,
      cashInMonth,
      cashOutMonth,
      cashInVar: variation(cashInMonth, cashInPrev),
      cashOutVar: variation(cashOutMonth, cashOutPrev),
      projectedIn,
      projectedOut,
      cashFlow,
      coverageMonths,
      // Rentabilité
      netResult,
      netMargin,
      yearExpenses,
      revenuePerStudent,
      studentCount,
      // Impayés & recouvrement
      aging,
      unpaidRate,
      inDunning,
      stillOwing,
      recoveredMonth,
      remindersCount: reminders.length,
      rateBefore,
      rateAfter,
      rateOverall,
      dunnedBase,
      // Dépenses & charges
      expenseCats,
      costPerStudent,
      // Suivi administratif
      digitalRate,
      avgDunningDelay,
      delayDist,
      overpaid,
      upcomingCount,
      transfersCount,
      years: years.map((y) => ({ id: y.id, label: y.label, active: y.active })),
      selectedYearId,
      selectedYearLabel: selectedYear?.label ?? null,
    };
  });

  return (
    <div className="px-3 py-3">
      <header className="relative mb-4 flex flex-wrap items-center justify-between gap-3 -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-600">{t('subtitle')}</p>
          {/* Le périmètre de tous les chiffres de la page, dit une fois. */}
          <p className="mt-0.5 text-xs text-slate-500">
            {t('scopeHint', { year: data.selectedYearLabel ?? '—' })}
          </p>
        </div>
        {/* Sélecteur d'année (auto-submit, sans bouton) — dans le flux, juste
            avant les boutons d'action : centré en absolu il recouvrait
            « Dépenses » sur les écrans larges. */}
        <div className="flex flex-wrap items-center gap-2">
          <YearSelect years={data.years} selectedYearId={data.selectedYearId} />
          <Link
            href={`/${locale}/admin/finance/expenses`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t('expensesLink')}
          </Link>
          <Link
            href={`/${locale}/admin/finance/exceptional`}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            {t('exceptionalLink')}
          </Link>
          <Link
            href={`/${locale}/admin/finance/unpaid`}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            {t('unpaid.manageLink')}
          </Link>
          <Link
            href={`/${locale}/admin/finance/creances-annulees`}
            className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
          >
            {t('waivedLink')}
          </Link>
        </div>
      </header>

      {/* Bandeau d'indicateurs — un pastel clair distinct par carte.
          Ligne du haut : l'ANNÉE entière. Ligne du bas : ce qui est déjà
          exigible. Les deux mesures répondent à des questions différentes —
          « combien l'année rapportera-t-elle » et « qu'est-ce qui aurait dû
          être encaissé et ne l'est pas » — et ne doivent pas être confondues. */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Kpi
          label={t('kpi.totalDue')}
          value={`${formatNumber(data.totalDue)} ${data.currency}`}
          toneIndex={0}
        />
        <Kpi
          label={t('kpi.totalPaid')}
          value={`${formatNumber(data.totalPaid)} ${data.currency}`}
          color="emerald"
          toneIndex={1}
        />
        <Kpi
          label={t('kpi.totalRemainingYear')}
          value={`${formatNumber(data.totalRemaining)} ${data.currency}`}
          color={data.totalRemaining > 0 ? 'red' : 'emerald'}
          toneIndex={2}
        />
        <Kpi
          label={t('kpi.collectionRate')}
          value={`${data.collectionRate.toFixed(1)}%`}
          color={data.collectionRate >= 80 ? 'emerald' : data.collectionRate >= 50 ? 'amber' : 'red'}
          toneIndex={3}
        />
        <Kpi
          toneIndex={4}
          label={t('unpaid.familiesKpi')}
          value={String(data.unpaidFamiliesCount)}
          color={data.unpaidFamiliesCount > 0 ? 'red' : 'emerald'}
        />
      </div>

      {/* Échéances déjà tombées, colonne par colonne sous leur équivalent
          annuel : « Reste à recouvrer à date » se lit ainsi juste sous
          « Reste à recouvrer (année) », et la comparaison se fait d'un coup
          d'œil vertical plutôt qu'en cherchant la carte. */}
      <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Kpi label={t('kpi.dueToDate')} value={`${formatNumber(data.dueToDate)} ${data.currency}`} />
        <Kpi
          label={t('kpi.paidToDate')}
          value={`${formatNumber(data.paidToDate)} ${data.currency}`}
          color="emerald"
        />
        <Kpi
          label={t('kpi.remainingToDate')}
          value={`${formatNumber(data.remainingToDate)} ${data.currency}`}
          color={data.remainingToDate > 0 ? 'red' : 'emerald'}
        />
        <Kpi
          label={t('kpi.collectionRateToDate')}
          value={`${data.collectionRateToDate.toFixed(1)}%`}
          color={
            data.collectionRateToDate >= 80
              ? 'emerald'
              : data.collectionRateToDate >= 50
                ? 'amber'
                : 'red'
          }
        />
      </div>

      {/* Onglets de premier niveau */}
      <nav className="folder-tabs mt-5">
        {SECTIONS.map((s) => {
          const href = `?section=${s}${data.selectedYearId ? `&year=${data.selectedYearId}` : ''}`;
          return (
            <Link key={s} href={href} className={`folder-tab ${section === s ? 'is-active' : ''}`}>
              {t(`sections.${s}`)}
            </Link>
          );
        })}
      </nav>

      {section === 'revenus' && (
      <>
      {/* Répartition annuelle par type d’échéances (mensuel / trimestriel / semestriel) */}
      <DistributionTabs
        data={{
          global: data.globalHisto,
          monthly: data.monthlyHisto,
          quarterly: data.quarterlyHisto,
          semestrial: data.semestrialHisto,
          annual: data.annualHisto,
        }}
        byActivity={data.byActivity}
        byMethod={data.byMethod}
        currency={data.currency}
      />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">{t('unpaid.topTitle')}</h2>
            <Link href={`/${locale}/admin/finance/unpaid`} className="text-xs text-brand-700 hover:underline">
              {t('unpaid.seeAll')} →
            </Link>
          </div>
          <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="px-4 py-3 text-start">{t('unpaid.family')}</th>
                  <th className="px-4 py-3 text-end">{t('unpaid.impaye')}</th>
                  <th className="px-4 py-3 text-end">{t('unpaid.daysLate')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.topFamilies.map((f) => (
                  <tr key={f.familyId}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {f.familyName}
                      {f.studentCount > 1 && (
                        <span className="ms-1 text-xs text-slate-400">({f.studentCount})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums font-semibold text-red-700">
                      {formatNumber(f.totalUnpaid)} {data.currency}
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums text-amber-700">
                      {t('unpaid.days', { count: f.daysLate })}
                    </td>
                  </tr>
                ))}
                {data.topFamilies.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center text-slate-500">
                      {t('noUnpaid')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside>
          <h2 className="mb-3 text-base font-semibold text-slate-900">{t('breakdown.title')}</h2>
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5 text-sm">
            <Row label={t('breakdown.installments')} value={String(data.installmentsCount)} />
            <Row
              label={t('breakdown.paid')}
              value={String(data.paidCount)}
              color="emerald"
            />
            <Row label={t('breakdown.partial')} value={String(data.partialCount)} color="amber" />
            <Row label={t('breakdown.pending')} value={String(data.pendingCount)} color="red" />
          </div>

          <h2 className="mb-3 mt-6 text-base font-semibold text-slate-900">{t('recent.title')}</h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {t('recent.last30days')}
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-emerald-700">
              {formatNumber(data.recentTotal)} {data.currency}
            </div>
            <div className="text-xs text-slate-500">
              {t('recent.paymentCount', { count: data.recentCount })}
            </div>
          </div>
        </aside>
      </div>
      </>
      )}

      {section === 'impayes' && (
        <>
        {/* Créances reportées : elles n'entrent pas dans les indicateurs de
            l'année, mais elles existent — on les annonce et on renvoie vers
            l'écran qui les détaille par famille, élève et année. */}
        {data.previousYearsUnpaid > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>
              <strong>⚠ {t('previousYears.title')}</strong>{' '}
              {t('previousYears.hint', {
                amount: `${formatNumber(data.previousYearsUnpaid)} ${data.currency}`,
                count: data.previousYearsStudents,
              })}
            </span>
            <Link
              href={`/${locale}/admin/finance/unpaid`}
              className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
            >
              {t('unpaid.manageLink')} →
            </Link>
          </div>
        )}

        {/* Indicateurs impayés & recouvrement */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title={t('recouv.totalUnpaid')}
            tone="red"
            value={`${formatNumber(data.totalRemaining)} ${data.currency}`}
            foot={`${t('recouv.rateLabel')} ${data.unpaidRate.toFixed(1)}%`}
          />
          <StatCard
            title={t('recouv.collectionRate')}
            tone="amber"
            value={`${data.collectionRate.toFixed(1)}%`}
            foot={t('recouv.collectedOf', {
              paid: formatCompact(data.totalPaid),
              due: formatCompact(data.totalDue),
            })}
          />
          <StatCard
            title={t('recouv.inDunning')}
            tone="brand"
            value={t('recouv.families', { count: data.stillOwing })}
            foot={t('recouv.remindersSent', { count: data.remindersCount })}
          />
          <StatCard
            title={t('recouv.recovered')}
            tone="emerald"
            value={`${formatNumber(data.recoveredMonth)} ${data.currency}`}
            foot={t('recouv.recoveredHint')}
          />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Ancienneté des impayés */}
          <div className="rounded-2xl border border-brand-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">{t('recouv.agingTitle')}</h2>
            <AgingChart
              rows={data.aging.map((a) => ({ label: t(`recouv.aging.${a.key}`), amount: a.amount }))}
              currency={data.currency}
            />
          </div>

          {/* Taux de recouvrement : avant / après relance */}
          <div className="rounded-2xl border border-brand-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">{t('recouv.collectionRate')}</h2>
            <PercentGauge pct={data.rateOverall} na={t('recouv.noDunning')} />
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-center">
              <div>
                <div className="text-xs font-medium text-slate-500">{t('recouv.beforeDunning')}</div>
                <div className="text-xl font-bold tabular-nums text-orange-600">
                  {data.rateBefore === null ? '—' : `${data.rateBefore.toFixed(1)}%`}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500">{t('recouv.afterDunning')}</div>
                <div className="text-xl font-bold tabular-nums text-emerald-700">
                  {data.rateAfter === null ? '—' : `${data.rateAfter.toFixed(1)}%`}
                </div>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">{t('recouv.dunningHint')}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <h2 className="mb-3 text-base font-semibold text-slate-900">{t('unpaid.topTitle')}</h2>
            <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-start">{t('unpaid.family')}</th>
                    <th className="px-4 py-3 text-end">{t('unpaid.impaye')}</th>
                    <th className="px-4 py-3 text-end">{t('unpaid.daysLate')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.topFamilies.map((f) => (
                    <tr key={f.familyId}>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {f.familyName}
                        {f.studentCount > 1 && <span className="ms-1 text-xs text-slate-400">({f.studentCount})</span>}
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums font-semibold text-red-700">
                        {formatNumber(f.totalUnpaid)} {data.currency}
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums text-amber-700">
                        {t('unpaid.days', { count: f.daysLate })}
                      </td>
                    </tr>
                  ))}
                  {data.topFamilies.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-10 text-center text-slate-500">{t('noUnpaid')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <aside className="space-y-3">
            <Kpi label={t('kpi.totalRemaining')} value={`${formatNumber(data.totalRemaining)} ${data.currency}`} color="red" />
            <Kpi label={t('unpaid.familiesKpi')} value={String(data.unpaidFamiliesCount)} color="red" />
            <Link href={`/${locale}/admin/finance/unpaid`} className="block rounded-lg bg-red-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-red-700">
              {t('unpaid.manageLink')} →
            </Link>
            <Link href={`/${locale}/admin/finance/creances-annulees`} className="block rounded-lg bg-amber-500 px-3 py-2 text-center text-sm font-medium text-white hover:bg-amber-600">
              {t('waivedLink')} →
            </Link>
          </aside>
        </div>
        </>
      )}

      {section === 'depenses' && (
        <section className="mt-6 space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title={t('dep.monthTotal')}
              tone="amber"
              value={`${formatNumber(data.cashOutMonth)} ${data.currency}`}
              foot={<Variation pct={data.cashOutVar} good="down" hint={t('treso.vsPrevMonth')} />}
            />
            <StatCard
              title={t('dep.yearTotal')}
              tone="red"
              value={`${formatNumber(data.yearExpenses)} ${data.currency}`}
              foot={t('dep.yearHint')}
            />
            <StatCard
              title={t('dep.costPerStudent')}
              tone="brand"
              value={`${formatNumber(data.costPerStudent)} ${data.currency}`}
              foot={t('renta.students', { count: data.studentCount })}
            />
            <StatCard
              title={t('dep.netResult')}
              tone={data.netResult >= 0 ? 'emerald' : 'red'}
              value={`${formatNumber(data.netResult)} ${data.currency}`}
              foot={`${t('renta.netMargin')} ${data.netMargin.toFixed(1)}%`}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-brand-200 bg-white p-5">
              <h2 className="text-base font-semibold text-slate-900">{t('dep.breakdown')}</h2>
              <ExpenseDonut
                rows={data.expenseCats.map((c) => ({ label: t(`dep.cat.${c.category}`), amount: c.amount }))}
                currency={data.currency}
              />
            </div>
            <div className="rounded-2xl border border-brand-200 bg-white p-5">
              <h2 className="text-base font-semibold text-slate-900">{t('dep.trend')}</h2>
              <ExpenseTrend rows={data.cashFlow} currency={data.currency} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(['MAINTENANCE', 'SUPPLIES', 'OTHER'] as const).map((c) => (
              <div key={c} className="rounded-2xl border border-brand-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-700">{t(`dep.cat.${c}`)}</div>
                <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                  {formatNumber(data.expenseCats.find((x) => x.category === c)?.amount ?? 0)} {data.currency}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
            <Link href={`/${locale}/admin/finance/expenses`} className="text-sm font-medium text-brand-700 hover:underline">
              {t('expensesLink')} →
            </Link>
          </div>
        </section>
      )}

      {section === 'tresorerie' && (
        <section className="mt-6 space-y-5">
          {/* Indicateurs de trésorerie */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title={t('treso.balance')}
              tone="emerald"
              value={`${formatNumber(data.cashBalance)} ${data.currency}`}
              foot={
                data.autonomyDays !== null
                  ? `↗ ${t('treso.autonomyDays', { days: data.autonomyDays })}`
                  : t('treso.noExpense')
              }
            />
            <StatCard
              title={t('treso.cashIn')}
              tone="amber"
              value={`${formatNumber(data.cashInMonth)} ${data.currency}`}
              foot={<Variation pct={data.cashInVar} good="up" hint={t('treso.vsPrevMonth')} />}
            />
            <StatCard
              title={t('treso.cashOut')}
              tone="red"
              value={`${formatNumber(data.cashOutMonth)} ${data.currency}`}
              foot={<Variation pct={data.cashOutVar} good="down" hint={t('treso.vsPrevMonth')} />}
            />
            <StatCard
              title={t('treso.projection3')}
              tone="brand"
              value={
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-brand-700">{formatCompact(data.projectedIn)}</span>
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-500">{formatCompact(data.projectedOut)}</span>
                </span>
              }
              foot={
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <LegendDot className="bg-emerald-500" label={t('treso.flowIn')} />
                  <LegendDot className="bg-orange-500" label={t('treso.flowOut')} />
                </span>
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Flux de trésorerie (6 derniers mois) */}
            <div className="rounded-2xl border border-brand-200 bg-white p-5">
              <h2 className="text-base font-semibold text-slate-900">{t('treso.flow')}</h2>
              <CashFlowChart rows={data.cashFlow} currency={data.currency} />
              <div className="mt-2 flex flex-wrap items-center justify-end gap-3 text-xs text-slate-600">
                <LegendDot className="bg-emerald-500" label={t('treso.flowIn')} />
                <LegendDot className="bg-orange-500" label={t('treso.flowOut')} />
              </div>
            </div>

            {/* Ratio de couverture */}
            <div className="rounded-2xl border border-brand-200 bg-white p-5">
              <h2 className="text-base font-semibold text-slate-900">{t('treso.coverage')}</h2>
              <CoverageGauge months={data.coverageMonths} unit={t('treso.months')} na={t('treso.noExpense')} />
              <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-600">
                <LegendDot className="bg-red-500" label={t('treso.covCritical')} />
                <LegendDot className="bg-orange-500" label={t('treso.covMedium')} />
                <LegendDot className="bg-emerald-600" label={t('treso.covComfort')} />
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-400">{t('treso.hint')}</p>
        </section>
      )}
      {section === 'rentabilite' && (
        <section className="mt-6">
          {/* Indicateurs de rentabilité */}
          <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
            <StatCard
              title={t('renta.netResult')}
              tone={data.netResult >= 0 ? 'emerald' : 'red'}
              value={`${formatNumber(data.netResult)} ${data.currency}`}
              foot={
                <span className={data.netMargin >= 0 ? 'text-emerald-700' : 'text-red-700'}>
                  ▣ {t('renta.netMargin')} {data.netMargin.toFixed(1)}%
                </span>
              }
            />
            <StatCard
              title={t('renta.revenuePerStudent')}
              tone="amber"
              value={`${formatNumber(data.revenuePerStudent)} ${data.currency}`}
              foot={t('renta.students', { count: data.studentCount })}
            />
            <div className="rounded-2xl border border-brand-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-700">{t('renta.topActivities')}</div>
              <ul className="mt-2 space-y-1.5">
                {data.byActivity
                  .filter((a) => a.collected > 0)
                  .sort((a, b) => b.collected - a.collected)
                  .slice(0, 3)
                  .map((a) => (
                    <li key={a.label} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-slate-700">{a.label}</span>
                      <span className="shrink-0 tabular-nums text-emerald-700">
                        {formatCompact(a.collected)} {data.currency}
                      </span>
                    </li>
                  ))}
                {data.byActivity.every((a) => a.collected <= 0) && (
                  <li className="text-sm text-slate-400">{t('renta.noActivity')}</li>
                )}
              </ul>
            </div>
          </div>

          <h2 className="mb-3 text-base font-semibold text-slate-900">{t('rentabilite.title')}</h2>
          <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="px-4 py-3 text-start">{t('rentabilite.activity')}</th>
                  <th className="px-4 py-3 text-end">{t('kpi.totalDue')}</th>
                  <th className="px-4 py-3 text-end">{t('kpi.totalPaid')}</th>
                  <th className="px-4 py-3 text-end">{t('histo.unpaid')}</th>
                  <th className="px-4 py-3 text-end">{t('kpi.collectionRate')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.byActivity.map((a) => {
                  const unpaid = Math.max(0, a.due - a.collected);
                  const rate = a.due > 0 ? (a.collected / a.due) * 100 : 0;
                  return (
                    <tr key={a.label}>
                      <td className="px-4 py-3 font-medium text-slate-800">{a.label}</td>
                      <td className="px-4 py-3 text-end tabular-nums text-slate-700">{formatNumber(a.due)} {data.currency}</td>
                      <td className="px-4 py-3 text-end tabular-nums text-emerald-700">{formatNumber(a.collected)} {data.currency}</td>
                      <td className="px-4 py-3 text-end tabular-nums text-red-700">{formatNumber(unpaid)} {data.currency}</td>
                      <td className="px-4 py-3 text-end tabular-nums text-slate-600">{rate.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">{t('rentabilite.hint')}</p>
        </section>
      )}
      {section === 'suivi' && (
        <section className="mt-6 space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title={t('suivi.digital')}
              tone="brand"
              value={`${data.digitalRate.toFixed(0)}%`}
              foot={t('suivi.digitalHint')}
            />
            <StatCard
              title={t('suivi.avgDelay')}
              tone="amber"
              value={
                data.avgDunningDelay === null
                  ? '—'
                  : t('suivi.days', { count: data.avgDunningDelay })
              }
              foot={t('suivi.avgDelayHint')}
            />
            <StatCard
              title={t('suivi.overpaid')}
              tone="emerald"
              value={`${formatNumber(data.overpaid)} ${data.currency}`}
              foot={t('suivi.overpaidHint')}
            />
            <StatCard
              title={t('suivi.upcoming')}
              tone="red"
              value={t('suivi.invoices', { count: data.upcomingCount })}
              foot={t('suivi.upcomingHint')}
            />
          </div>

          <div className="rounded-2xl border border-brand-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">{t('suivi.delayTitle')}</h2>
            <DelayChart
              rows={data.delayDist.map((d) => ({ label: t(`suivi.delay.${d.key}`), count: d.count }))}
            />
            <p className="mt-2 text-[11px] text-slate-400">{t('suivi.delayHint')}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MiniStat label={t('suivi.enrolled')} value={t('suivi.students', { count: data.studentCount })} />
            <MiniStat label={t('suivi.transfers')} value={t('suivi.transferCount', { count: data.transfersCount })} />
            <MiniStat label={t('suivi.reminders')} value={t('recouv.remindersSent', { count: data.remindersCount })} />
          </div>
        </section>
      )}

    </div>
  );
}

function SectionLink({ href, title, desc, cta }: { href: string; title: string; desc: string; cta: string }) {
  return (
    <div className="mt-6 rounded-2xl border border-brand-200 bg-white p-8 text-center">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{desc}</p>
      <Link href={href} className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
        {cta} →
      </Link>
    </div>
  );
}

function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <h2 className="text-lg font-semibold text-slate-700">{title}</h2>
      <p className="mt-2 text-sm text-slate-400">📊 {note}</p>
    </div>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString('fr', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Montant abrégé (1 234 567 → 1.2M, 270 000 → 270k) pour les cartes compactes. */
function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)}k`;
  return n.toLocaleString('fr', { maximumFractionDigits: 0 });
}

const TONE_TITLE: Record<string, string> = {
  emerald: 'bg-emerald-600',
  amber: 'bg-amber-500',
  red: 'bg-red-600',
  brand: 'bg-brand-600',
};
const TONE_VALUE: Record<string, string> = {
  emerald: 'text-emerald-700',
  amber: 'text-amber-600',
  red: 'text-red-600',
  brand: 'text-brand-700',
};

/** Carte indicateur : bandeau de titre coloré, valeur, ligne de pied. */
function StatCard({
  title,
  value,
  foot,
  tone,
}: {
  title: string;
  value: React.ReactNode;
  foot?: React.ReactNode;
  tone: keyof typeof TONE_TITLE;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
      <div className={`px-4 py-2 text-sm font-semibold text-white ${TONE_TITLE[tone]}`}>{title}</div>
      <div className="px-4 py-3">
        <div className={`text-xl font-bold tabular-nums ${TONE_VALUE[tone]}`}>{value}</div>
        {foot && <div className="mt-1.5 border-t border-slate-100 pt-1.5 text-xs text-slate-500">{foot}</div>}
      </div>
    </div>
  );
}

/** Variation en % vs mois précédent. `good` indique le sens favorable. */
function Variation({ pct, good, hint }: { pct: number | null; good: 'up' | 'down'; hint: string }) {
  if (pct === null) return <span className="text-slate-400">{hint}</span>;
  const up = pct >= 0;
  const favorable = good === 'up' ? up : !up;
  return (
    <span className={favorable ? 'text-emerald-700' : 'text-red-600'}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}% <span className="text-slate-400">{hint}</span>
    </span>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${className}`} />
      {label}
    </span>
  );
}

/** Flux de trésorerie : encaissements vs dépenses, barres groupées par mois. */
function CashFlowChart({ rows, currency }: { rows: { label: string; in: number; out: number }[]; currency: string }) {
  const W = 320;
  const H = 120;
  const pad = 4;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.in, r.out)));
  const groupW = (W - pad * 2) / (rows.length || 1);
  const barW = Math.min(14, (groupW - 8) / 2);
  const hFor = (v: number) => (v / max) * (H - 24);

  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-32 w-full" role="img">
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1={0} x2={W} y1={(H - 20) * (1 - g)} y2={(H - 20) * (1 - g)} stroke="#eef1f6" strokeWidth={1} />
        ))}
        {rows.map((r, i) => {
          const cx = pad + i * groupW + groupW / 2;
          const base = H - 20;
          return (
            <g key={i}>
              <rect x={cx - barW - 2} y={base - hFor(r.in)} width={barW} height={hFor(r.in)} rx={2} fill="#10b981">
                <title>{`${r.label} — ${formatNumber(r.in)} ${currency}`}</title>
              </rect>
              <rect x={cx + 2} y={base - hFor(r.out)} width={barW} height={hFor(r.out)} rx={2} fill="#f97316">
                <title>{`${r.label} — ${formatNumber(r.out)} ${currency}`}</title>
              </rect>
            </g>
          );
        })}
        <line x1={0} x2={W} y1={H - 20} y2={H - 20} stroke="#cbd5e1" strokeWidth={1} />
      </svg>
      <div className="flex justify-between px-1 text-[11px] capitalize text-slate-500">
        {rows.map((r, i) => (
          <span key={i}>{r.label}</span>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-brand-200 bg-white p-4">
      <div className="text-sm font-semibold text-slate-700">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}

/** Ancienneté des impayés : barres verticales par tranche de retard. */
function AgingChart({ rows, currency }: { rows: { label: string; amount: number }[]; currency: string }) {
  const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#991b1b'];
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <div className="mt-4 flex items-end gap-4">
      {rows.map((r, i) => (
        <div key={r.label} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-xs font-semibold tabular-nums text-slate-700">
            {formatCompact(r.amount)} {currency}
          </span>
          <div
            className="w-full rounded-t"
            style={{ height: `${Math.max(4, (r.amount / max) * 130)}px`, backgroundColor: COLORS[i % COLORS.length] }}
          />
          <span className="text-xs font-medium text-slate-500">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Répartition des dépenses par catégorie : anneau + légende. */
function ExpenseDonut({ rows, currency }: { rows: { label: string; amount: number }[]; currency: string }) {
  const COLORS = ['#f97316', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6', '#eab308', '#14b8a6', '#64748b'];
  const total = rows.reduce((s, r) => s + r.amount, 0);
  if (total <= 0) return <p className="mt-4 text-sm text-slate-400">—</p>;
  const R = 60;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 160 160" className="h-40 w-40 shrink-0" role="img">
        <g transform="translate(80,80) rotate(-90)">
          {rows.map((r, i) => {
            const frac = r.amount / total;
            const dash = `${frac * C} ${C - frac * C}`;
            const el = (
              <circle
                key={r.label}
                r={R}
                fill="none"
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={28}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
              />
            );
            offset += frac * C;
            return el;
          })}
        </g>
      </svg>
      <ul className="min-w-[150px] flex-1 space-y-1 text-sm">
        {rows.map((r, i) => (
          <li key={r.label} className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-slate-700">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              {r.label}
            </span>
            <span className="shrink-0 tabular-nums text-slate-500">
              {((r.amount / total) * 100).toFixed(0)}% · {formatCompact(r.amount)} {currency}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Évolution des dépenses sur les 6 derniers mois. */
function ExpenseTrend({ rows, currency }: { rows: { label: string; out: number }[]; currency: string }) {
  const max = Math.max(1, ...rows.map((r) => r.out));
  return (
    <div className="mt-4 flex items-end gap-3">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[11px] font-semibold tabular-nums text-slate-600">{formatCompact(r.out)}</span>
          <div
            className="w-full rounded-t bg-orange-500"
            style={{ height: `${Math.max(4, (r.out / max) * 130)}px` }}
            title={`${r.label} — ${formatNumber(r.out)} ${currency}`}
          />
          <span className="text-xs capitalize text-slate-500">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Jauge de pourcentage 0–100 % (rouge < 33, orange 33–66, vert > 66). */
function PercentGauge({ pct, na }: { pct: number | null; na: string }) {
  const R = 70;
  const CX = 100;
  const CY = 88;
  const pt = (p: number) => {
    const f = Math.min(1, Math.max(0, p / 100));
    const a = Math.PI * (1 - f);
    return [CX + R * Math.cos(a), CY - R * Math.sin(a)] as const;
  };
  const arc = (p1: number, p2: number) => {
    const [x1, y1] = pt(p1);
    const [x2, y2] = pt(p2);
    return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`;
  };
  const val = pct === null ? null : Math.min(100, Math.max(0, pct));
  const [nx, ny] = val === null ? [CX, CY] : pt(val);
  return (
    <svg viewBox="0 0 200 104" className="mx-auto mt-2 h-32 w-full max-w-[260px]" role="img">
      <path d={arc(0, 33)} stroke="#ef4444" strokeWidth={16} fill="none" />
      <path d={arc(33, 66)} stroke="#f97316" strokeWidth={16} fill="none" />
      <path d={arc(66, 100)} stroke="#059669" strokeWidth={16} fill="none" />
      {val !== null && (
        <>
          <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="#0f172a" strokeWidth={2.5} strokeLinecap="round" />
          <circle cx={CX} cy={CY} r={4.5} fill="#0f172a" />
        </>
      )}
      <text x={CX} y={CY - 14} textAnchor="middle" className="fill-slate-900" style={{ fontSize: 24, fontWeight: 800 }}>
        {val === null ? '—' : `${val.toFixed(1)}%`}
      </text>
      {val === null && (
        <text x={CX} y={CY - 1} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 10 }}>
          {na}
        </text>
      )}
    </svg>
  );
}

/** Distribution des délais de relance (nombre de familles par tranche). */
function DelayChart({ rows }: { rows: { label: string; count: number }[] }) {
  const COLORS = ['#3b82f6', '#f97316', '#ef4444', '#8b5cf6'];
  const total = rows.reduce((s, r) => s + r.count, 0);
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="mt-4 flex items-end gap-4">
      {rows.map((r, i) => (
        <div key={r.label} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-xs font-semibold tabular-nums text-slate-700">
            {total > 0 ? `${Math.round((r.count / total) * 100)}%` : '0%'}
          </span>
          <div
            className="w-full rounded-t"
            style={{ height: `${Math.max(4, (r.count / max) * 120)}px`, backgroundColor: COLORS[i % COLORS.length] }}
          />
          <span className="text-xs font-medium text-slate-500">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Jauge « ratio de couverture » (mois de charges couverts par la trésorerie) :
 * bandes rouge (< 2), orange (2–4), verte (> 4), échelle plafonnée à 6 mois.
 */
function CoverageGauge({ months, unit, na }: { months: number | null; unit: string; na: string }) {
  const MAXM = 6;
  const R = 78;
  const CX = 100;
  const CY = 92;
  const pt = (m: number) => {
    const f = Math.min(1, Math.max(0, m / MAXM));
    const a = Math.PI * (1 - f);
    return [CX + R * Math.cos(a), CY - R * Math.sin(a)] as const;
  };
  const arc = (m1: number, m2: number) => {
    const [x1, y1] = pt(m1);
    const [x2, y2] = pt(m2);
    return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`;
  };
  const val = months === null ? null : Math.min(MAXM, Math.max(0, months));
  const [nx, ny] = val === null ? [CX, CY] : pt(val);

  return (
    <div className="mt-2">
      <svg viewBox="0 0 200 110" className="mx-auto h-36 w-full max-w-[280px]" role="img">
        <path d={arc(0, 2)} stroke="#ef4444" strokeWidth={18} fill="none" strokeLinecap="butt" />
        <path d={arc(2, 4)} stroke="#f97316" strokeWidth={18} fill="none" strokeLinecap="butt" />
        <path d={arc(4, 6)} stroke="#059669" strokeWidth={18} fill="none" strokeLinecap="butt" />
        {val !== null && (
          <>
            <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="#0f172a" strokeWidth={2.5} strokeLinecap="round" />
            <circle cx={CX} cy={CY} r={4.5} fill="#0f172a" />
          </>
        )}
        <text x={CX} y={CY - 16} textAnchor="middle" className="fill-slate-900" style={{ fontSize: 26, fontWeight: 800 }}>
          {val === null ? '—' : val.toFixed(1).replace('.', ',')}
        </text>
        <text x={CX} y={CY - 2} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 11 }}>
          {val === null ? na : unit}
        </text>
      </svg>
    </div>
  );
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

/**
 * Carte d'indicateur. `toneIndex` applique un fond pastel clair distinct par
 * carte (purement visuel) ; `color` continue de porter le signal (rouge =
 * reste dû, vert = soldé…) sur la valeur, donc rien n'est perdu.
 */
function Kpi({
  label,
  value,
  color,
  toneIndex,
}: {
  label: string;
  value: string;
  color?: 'emerald' | 'red' | 'amber';
  toneIndex?: number;
}) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-700',
    red: 'text-red-700',
    amber: 'text-amber-700',
  };
  const tone = toneIndex === undefined ? null : kpiTone(toneIndex);
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${tone ? tone.card : 'border-slate-200 bg-white'}`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={`mt-0.5 text-lg font-semibold tabular-nums ${
          color ? colors[color] : (tone?.value ?? 'text-slate-900')
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: 'emerald' | 'amber' | 'red' }) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
  };
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-700">{label}</span>
      <span className={`font-semibold tabular-nums ${color ? colors[color] : 'text-slate-900'}`}>{value}</span>
    </div>
  );
}
