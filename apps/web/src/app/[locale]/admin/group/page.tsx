import Link from 'next/link';
import { redirect } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { computeHeadcount, computeAcademicOverview, computeAttendanceRate } from '@/lib/bi';
import { pickPeriodId } from '@/lib/periods';
import { yearInstallmentEnd } from '@/lib/school-year';
import { tenantDisplayName } from '@/lib/tenant-name';
import { siteColors } from './charts';
import { loadGroupFinance } from './finance-data';
import { GroupFinance } from './finance-client';
import { AttendanceTabs, type SiteAttendance, type TopRow } from './attendance-tabs';
import { EncaissementTabs, type RecoverySite } from './encaissement-tabs';
import { monthlyAttendance, topStudents } from '@/lib/attendance-stats';
import { teacherAttendanceStats } from '@/lib/teacher-attendance-stats';
import {
  TeacherAttendanceTabs,
  type SiteTeacherAttendance,
} from './teacher-attendance-tabs';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';
import { classifyRoom } from '@/lib/kpi-edt';
import {
  Card,
  BigKpi,
  SiteCard,
  BarList,
  Gauge,
  TrendStat,
  LogTile,
  rateTone,
} from './kpi-blocks';
import {
  consolidate,
  classFillCounts,
  roomOccupancy,
  transportPunctuality,
  pct,
  type SiteInput,
} from '@/lib/group-dashboard';

type Row = {
  name: string;
  students: number;
  teachers: number;
  classes: number;
  avg: number | null;
  /** Part des élèves ayant la moyenne — déjà calculée, jamais affichée jusqu'ici. */
  successRate: number | null;
  attendance: number | null;
  due: number;
  paid: number;
  remaining: number;
  collectionPct: number | null;
  currency: string;
  /** Encaissements du mois (non cumulés), sur les mois de l'année scolaire. */
  monthlyPaid: number[];
  /**
   * Taux de recouvrement **cumulé** à la fin de chaque mois : encaissé à date
   * / échu à date. Cumulé et non mensuel, car c'est la mesure qui a un sens
   * pour piloter (un mois isolé oscille au gré du calendrier des échéances).
   * `null` tant qu'aucune échéance n'est arrivée à terme.
   */
  monthlyCollectionPct: (number | null)[];
  /** Début de l'année scolaire du site — sert à étiqueter les mois. */
  yearStart: Date | null;
  /** Cumul encaissé et reste échu à la fin de chaque mois. */
  monthlyCollectedCumul: number[];
  monthlyRemainingCumul: number[];
  /** Assiduité mensuelle et palmarès élèves. */
  attendanceStats: {
    present: number[];
    absJustified: number[];
    absUnjustified: number[];
    lateJustified: number[];
    lateUnjustified: number[];
    absenceRate: (number | null)[];
  };
  topAbsences: TopRow[];
  topLates: TopRow[];
  /** Assiduité des enseignants (pointage journalier du personnel). */
  teacherStats: Awaited<ReturnType<typeof teacherAttendanceStats>>;
  /** Ce qu'exige le bandeau consolidé de tête (cf. lib/group-dashboard). */
  kpi: SiteInput;
  /** Occupation des salles par famille, et services logistiques. */
  infra: {
    rooms: Array<{ type: string; rooms: number; usedCells: number; capacityCells: number }>;
    transport: Record<string, number>;
    canteenStudents: number;
  };
  /** Incidents disciplinaires et retards, mois par mois. */
  climate: { incidents: number[]; lates: number[] };
  /** Élèves par code de cycle (primaire, college, lycee). */
  cycleCodes: Record<string, number>;
};

/** Mois de l'année scolaire (10 mois à partir du mois de démarrage). */
const MONTH_COUNT = 10;

/** Objectif de recouvrement du groupe, repère des barres par site. */
const COLLECTION_TARGET = 95;

/**
 * Occupation « laboratoires » : les salles de physique-chimie et de SVT
 * forment un même parc aux yeux d'une direction. On les fusionne en une
 * moyenne simple, faute de savoir laquelle sert de variable d'ajustement.
 */
function labRate(pc: number | null, svt: number | null): number | null {
  const vals = [pc, svt].filter((v): v is number => v !== null);
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

/** Trois chiffres côte à côte, dans le bloc pédagogique. */
function MiniStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-center">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-xl font-extrabold tabular-nums ${tone}`}>{value}</div>
      <div className="text-[10px] text-slate-400">{hint}</div>
    </div>
  );
}

export default async function GroupDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  // Réservé aux comptes multi-établissements.
  if (session.user.sites.length <= 1) redirect(`/${locale}/admin`);
  const t = await getTranslations('admin.group');
  const tab = (await searchParams).tab === 'finance' ? 'finance' : 'general';

  // Deux onglets : Général (la vue consolidée historique) et Finance.
  const nav = (
    <nav className="folder-tabs mb-4">
      <Link href={`/${locale}/admin/group`} className={`folder-tab ${tab === 'general' ? 'is-active' : ''}`}>
        {t('tabs.general')}
      </Link>
      <Link
        href={`/${locale}/admin/group?tab=finance`}
        className={`folder-tab ${tab === 'finance' ? 'is-active' : ''}`}
      >
        {t('tabs.finance')}
      </Link>
    </nav>
  );

  if (tab === 'finance') {
    const finance = await loadGroupFinance(session.user.sites, session.user.tenantId, locale);
    return (
      <div className="px-3 py-3">
        <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
          <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-600">{t('subtitle', { count: session.user.sites.length })}</p>
        </header>
        {nav}
        <GroupFinance data={finance} locale={locale} target={COLLECTION_TARGET} />
      </div>
    );
  }

  const rows: Row[] = await Promise.all(
    session.user.sites.map((site) =>
      withTenant(site.tenantId, async (tx): Promise<Row> => {
        const year = await tx.academicYear.findFirst({
          where: { active: true },
          include: { periods: { orderBy: { startDate: 'asc' } } },
        });
        const periods = year?.periods ?? [];
        const periodId = pickPeriodId(periods);

        // Même borne que le tableau de bord d'un site : comparer des sites
        // sur des périmètres différents ne comparerait rien.
        const headcount = await computeHeadcount(tx, year?.id ?? null);
        const academic = periodId ? await computeAcademicOverview(tx, periodId) : null;
        const attendance = periodId ? await computeAttendanceRate(tx, periodId) : null;

        // Périmètre : l'ANNÉE SCOLAIRE active du site, pas l'historique. Sans
        // cette borne, les créances des exercices antérieurs s'ajoutaient au
        // « dû » de chaque site et faussaient la comparaison entre sites.
        const yearWindow = year
          ? { gte: year.startDate, lt: yearInstallmentEnd(year) }
          : undefined;
        const installments = await tx.installment.findMany({
          where: { status: { not: 'CANCELLED' }, ...(yearWindow ? { dueDate: yearWindow } : {}) },
          select: { amount: true, dueDate: true },
        });
        const payments = await tx.payment.findMany({
          ...(yearWindow ? { where: { installment: { dueDate: yearWindow } } } : {}),
          select: { amount: true, paidAt: true },
        });
        const due = installments.reduce((s, i) => s + Number(i.amount), 0);
        const paid = payments.reduce((s, p) => s + Number(p.amount), 0);
        const tenant = await tx.tenant.findFirst({ select: { currency: true, name: true, nameAr: true } });

        // ── Séries mensuelles, calées sur le début de l'année scolaire ─────
        const start = year ? new Date(year.startDate) : new Date();
        const y0 = start.getUTCFullYear();
        const m0 = start.getUTCMonth();
        /** Borne haute (exclue) du mois k. */
        const endOfMonth = (k: number) => Date.UTC(y0, m0 + k + 1, 1);
        const startOfMonth = (k: number) => Date.UTC(y0, m0 + k, 1);

        const monthlyPaid = Array.from({ length: MONTH_COUNT }, (_, k) =>
          payments
            .filter((p) => {
              const t = p.paidAt.getTime();
              return t >= startOfMonth(k) && t < endOfMonth(k);
            })
            .reduce((s, p) => s + Number(p.amount), 0),
        );

        const monthlyCollectionPct = Array.from({ length: MONTH_COUNT }, (_, k) => {
          const limit = endOfMonth(k);
          const dueToDate = installments
            .filter((i) => i.dueDate.getTime() < limit)
            .reduce((s, i) => s + Number(i.amount), 0);
          if (dueToDate <= 0) return null;
          const paidToDate = payments
            .filter((p) => p.paidAt.getTime() < limit)
            .reduce((s, p) => s + Number(p.amount), 0);
          return (paidToDate / dueToDate) * 100;
        });

        // Cumuls de fin de mois : c'est la lecture qui a du sens pour un
        // recouvrement (un mois isolé oscille au gré du calendrier d'échéances).
        const monthlyCollectedCumul = Array.from({ length: MONTH_COUNT }, (_, k) =>
          payments
            .filter((p) => p.paidAt.getTime() < endOfMonth(k))
            .reduce((s, p) => s + Number(p.amount), 0),
        );
        const monthlyRemainingCumul = Array.from({ length: MONTH_COUNT }, (_, k) => {
          const limit = endOfMonth(k);
          const dueToDate = installments
            .filter((i) => i.dueDate.getTime() < limit)
            .reduce((s, i) => s + Number(i.amount), 0);
          return Math.max(0, dueToDate - monthlyCollectedCumul[k]!);
        });

        const siteName = tenantDisplayName(locale, tenant?.name ?? site.name, tenant?.nameAr);

        /* ── Données du bandeau consolidé ───────────────────────────────── */

        // Effectifs par cycle : la maquette veut Primaire / Collège / Lycée
        // sous l'effectif total, et c'est aussi l'axe du graphe plus bas.
        const classRows = year
          ? await tx.class.findMany({
              where: { academicYearId: year.id, deletedAt: null },
              select: {
                capacity: true,
                level: { select: { cycle: { select: { code: true, label: true, labelAr: true, order: true } } } },
                _count: { select: { students: { where: { unenrolledAt: null } } } },
              },
            })
          : [];
        const cycleMap = new Map<string, { students: number; order: number }>();
        for (const c of classRows) {
          const key = localizedLabel(locale, c.level.cycle.label, c.level.cycle.labelAr);
          const cur = cycleMap.get(key) ?? { students: 0, order: c.level.cycle.order };
          cur.students += c._count.students;
          cycleMap.set(key, cur);
        }
        const cycleCodes: Record<string, number> = {};
        for (const c of classRows) {
          cycleCodes[c.level.cycle.code] = (cycleCodes[c.level.cycle.code] ?? 0) + c._count.students;
        }
        const fill = classFillCounts(
          classRows.map((c) => ({ capacity: c.capacity, enrolled: c._count.students })),
        );

        // Familles en impayé : on compte les foyers, pas les élèves — deux
        // frères et sœurs en retard ne font qu'un appel téléphonique.
        const unpaidRows = await tx.installment.findMany({
          where: {
            status: { not: 'CANCELLED' },
            ...(yearWindow ? { dueDate: yearWindow } : {}),
          },
          select: {
            amount: true,
            studentId: true,
            payments: { select: { amount: true } },
            student: { select: { relationsAsChild: { select: { parentId: true } } } },
          },
        });
        const unpaidHouseholds = new Set<string>();
        for (const i of unpaidRows) {
          const paidOn = i.payments.reduce((n, x) => n + Number(x.amount), 0);
          if (Number(i.amount) - paidOn <= 0.01) continue;
          const parents = i.student.relationsAsChild.map((r) => r.parentId);
          // Sans parent rattaché, l'élève fait foyer à lui seul.
          if (parents.length === 0) unpaidHouseholds.add(`s:${i.studentId}`);
          else for (const pid of parents) unpaidHouseholds.add(`p:${pid}`);
        }

        // Charge d'enseignement : ce que l'emploi du temps doit placer.
        const teachingAgg = year
          ? await tx.teacherAssignment.aggregate({
              _sum: { hoursPerWeek: true },
              where: { academicYearId: year.id },
            })
          : null;
        const teacherKeyRows = await tx.person.findMany({
          where: { type: 'TEACHER', deletedAt: null },
          select: { massarId: true },
        });

        // Période précédente : sert à mesurer la progression pédagogique.
        const previousPeriodId = (() => {
          const i = periods.findIndex((x) => x.id === periodId);
          return i > 0 ? periods[i - 1]!.id : null;
        })();
        const previousAcademic = previousPeriodId
          ? await computeAcademicOverview(tx, previousPeriodId)
          : null;

        /* ── Infrastructures et services ────────────────────────────────── */

        const [roomRows, slotRows, entryRows] = await Promise.all([
          tx.room.findMany({ select: { code: true, label: true, equipment: true } }),
          tx.timetableSlot.count({ where: { isBreak: false } }),
          year
            ? tx.timetableEntry.groupBy({
                by: ['roomId'],
                where: { academicYearId: year.id, roomId: { not: null } },
                _count: { _all: true },
              })
            : Promise.resolve([] as Array<{ roomId: string | null; _count: { _all: number } }>),
        ]);
        // 6 jours ouvrés : c'est la semaine scolaire marocaine, et la même
        // base que celle utilisée par le générateur d'emploi du temps.
        const WEEK_DAYS = 6;
        const usedByRoom = new Map(entryRows.map((e) => [e.roomId ?? '', e._count._all]));
        const roomsByType = new Map<string, { rooms: number; usedCells: number }>();
        const allRooms = await tx.room.findMany({
          select: { id: true, code: true, label: true, equipment: true },
        });
        for (const r of allRooms) {
          const type = classifyRoom(r.code, r.label, r.equipment);
          const cur = roomsByType.get(type) ?? { rooms: 0, usedCells: 0 };
          cur.rooms += 1;
          cur.usedCells += usedByRoom.get(r.id) ?? 0;
          roomsByType.set(type, cur);
        }
        void roomRows;
        const infraRooms = [...roomsByType.entries()].map(([type, v]) => ({
          type,
          rooms: v.rooms,
          usedCells: v.usedCells,
          capacityCells: v.rooms * slotRows * WEEK_DAYS,
        }));

        const transportRows = await tx.transportAttendanceRecord.groupBy({
          by: ['status'],
          _count: { _all: true },
        });
        const transport: Record<string, number> = {};
        for (const r of transportRows) transport[r.status] = r._count._all;

        // Cantine : aucun module dédié, mais un frais de catégorie CANTEEN
        // dit qui y mange. C'est la souscription, pas le passage au plateau.
        // L'échéance ne porte que l'identifiant de sa grille : on récupère
        // d'abord les grilles « cantine », puis les élèves qui en ont une.
        const canteenSchedules = await tx.feeScheduleItem.findMany({
          where: { category: 'CANTEEN' },
          select: { id: true },
        });
        const canteenStudents =
          year && canteenSchedules.length > 0
            ? (
                await tx.installment.findMany({
                  where: {
                    status: { not: 'CANCELLED' },
                    ...(yearWindow ? { dueDate: yearWindow } : {}),
                    feeScheduleItemId: { in: canteenSchedules.map((f: { id: string }) => f.id) },
                  },
                  select: { studentId: true },
                  distinct: ['studentId'],
                })
              ).length
            : 0;

        /* ── Climat scolaire : incidents et retards par mois ─────────────── */
        const incidentRows = await tx.carnetEntry.findMany({
          where: {
            type: { in: ['REMARQUE_DISCIPLINAIRE', 'AVERTISSEMENT', 'EXCLUSION'] },
            ...(year ? { occurredAt: { gte: year.startDate } } : {}),
          },
          select: { occurredAt: true },
        });
        const incidents = Array.from({ length: MONTH_COUNT }, (_, k) =>
          incidentRows.filter((r) => {
            const t = r.occurredAt.getTime();
            return t >= startOfMonth(k) && t < endOfMonth(k);
          }).length,
        );
        const attendanceStats = await monthlyAttendance(tx, MONTH_COUNT, year ? new Date(year.startDate) : null);
        const nameOf = (pp: {
          firstName: string;
          lastName: string;
          firstNameAr: string | null;
          lastNameAr: string | null;
        }) => personDisplayName(locale, pp);
        const labelOf = (l: string, la: string | null) => localizedLabel(locale, l, la);
        const teacherStats = await teacherAttendanceStats(
          tx,
          MONTH_COUNT,
          year ? new Date(year.startDate) : null,
          nameOf,
          (r) => (locale === 'ar' ? (r.labelAr ?? r.label) : r.label),
        );
        const [topAbs, topLate] = await Promise.all([
          topStudents(tx, 'ABSENCE', 10, locale, nameOf, labelOf),
          topStudents(tx, 'LATE', 10, locale, nameOf, labelOf),
        ]);

        return {
          // Nom localisé : en arabe on affiche `nameAr` quand il est saisi.
          name: siteName,
          students: headcount.students,
          teachers: headcount.teachers,
          classes: headcount.classes,
          avg: academic?.averageGeneral ?? null,
          successRate: academic?.successRate ?? null,
          attendance: attendance?.rate ?? null,
          due,
          paid,
          remaining: Math.max(0, due - paid),
          collectionPct: due > 0 ? (paid / due) * 100 : null,
          currency: tenant?.currency ?? 'MAD',
          monthlyPaid,
          monthlyCollectionPct,
          yearStart: year ? new Date(year.startDate) : null,
          monthlyCollectedCumul,
          monthlyRemainingCumul,
          attendanceStats,
          topAbsences: topAbs.map((r) => ({ ...r, siteName })),
          topLates: topLate.map((r) => ({ ...r, siteName })),
          teacherStats,
          kpi: {
            name: siteName,
            students: headcount.students,
            teachers: headcount.teachers,
            classes: headcount.classes,
            byCycle: [...cycleMap.entries()]
              .sort((a, b) => a[1].order - b[1].order)
              .map(([cycle, v]) => ({ cycle, students: v.students })),
            due,
            paid,
            unpaidFamilies: unpaidHouseholds.size,
            teachingHours: Number(teachingAgg?._sum.hoursPerWeek ?? 0),
            teacherKeys: teacherKeyRows.map((t) => t.massarId ?? ''),
            capacity: headcount.totalCapacity,
            enrolled: headcount.totalEnrolled,
            underfilledClasses: fill.underfilled,
            overfilledClasses: fill.overfilled,
            attendanceRate: attendance?.rate ?? null,
            attendanceBase: attendance?.totalRecords ?? 0,
            successRate: academic?.successRate ?? null,
            averageGeneral: academic?.averageGeneral ?? null,
            previousAverage: previousAcademic?.averageGeneral ?? null,
            ratedStudents: academic?.studentsRated ?? 0,
          },
          infra: { rooms: infraRooms, transport, canteenStudents },
          cycleCodes,
          climate: {
            incidents,
            lates: attendanceStats.lateJustified.map(
              (v, i) => v + (attendanceStats.lateUnjustified[i] ?? 0),
            ),
          },
        };
      }),
    ),
  );

  const totals = rows.reduce(
    (a, r) => ({
      students: a.students + r.students,
      teachers: a.teachers + r.teachers,
      classes: a.classes + r.classes,
      due: a.due + r.due,
      paid: a.paid + r.paid,
      remaining: a.remaining + r.remaining,
    }),
    { students: 0, teachers: 0, classes: 0, due: 0, paid: 0, remaining: 0 },
  );
  const currency = rows[0]?.currency ?? 'MAD';
  const fmt = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 0 });

  // ── Préparation des graphiques ────────────────────────────────────────────
  // Une couleur par établissement, réutilisée dans tous les graphiques : elle
  // identifie le site, elle ne dépend ni de son rang ni de sa performance.
  const colors = siteColors(rows.map((r) => r.name));

  const yearStart = rows.find((r) => r.yearStart)?.yearStart ?? null;
  const monthLabels = Array.from({ length: MONTH_COUNT }, (_, k) => {
    const base = yearStart ?? new Date();
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + k, 1));
    return d.toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' });
  });


  const attendanceSites: SiteAttendance[] = rows.map((r) => ({
    name: r.name,
    color: colors[r.name]!,
    ...r.attendanceStats,
  }));
  // Palmarès inter-établissements : on refusionne puis on retronque à 10.
  const topAbsences = rows
    .flatMap((r) => r.topAbsences)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const topLates = rows
    .flatMap((r) => r.topLates)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const teacherSites: SiteTeacherAttendance[] = rows.map((r) => ({
    name: r.name,
    color: colors[r.name]!,
    presenceRate: r.teacherStats.presenceRate,
    absenceRate: r.teacherStats.absenceRate,
    absentDays: r.teacherStats.absentDays,
    longAbsenceDays: r.teacherStats.longAbsenceDays,
    shortAbsenceDays: r.teacherStats.shortAbsenceDays,
    monthly: r.teacherStats.monthly,
    byReason: r.teacherStats.byReason,
    byWeekday: r.teacherStats.byWeekday,
    atRisk: r.teacherStats.atRisk,
  }));
  // Libellés de jours, dans la langue de l'interface (dimanche = index 0).
  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2024, 8, 1 + i)).toLocaleDateString(locale, {
      weekday: 'short',
      timeZone: 'UTC',
    }),
  );

  const recoverySites: RecoverySite[] = rows.map((r) => ({
    name: r.name,
    color: colors[r.name]!,
    collected: r.monthlyCollectedCumul,
    remaining: r.monthlyRemainingCumul,
    rate: r.monthlyCollectionPct,
  }));
  const recoveryTotal = {
    collected: monthLabels.map((_, i) =>
      rows.reduce((s, r) => s + (r.monthlyCollectedCumul[i] ?? 0), 0),
    ),
    remaining: monthLabels.map((_, i) =>
      rows.reduce((s, r) => s + (r.monthlyRemainingCumul[i] ?? 0), 0),
    ),
  };
  const recoveryRate = monthLabels.map((_, i) => {
    const c = recoveryTotal.collected[i]!;
    const r = recoveryTotal.remaining[i]!;
    return c + r > 0 ? (c / (c + r)) * 100 : null;
  });


  /* ── Bandeau consolidé ────────────────────────────────────────────────── */
  const g = consolidate(rows.map((r) => r.kpi));

  // Infrastructures : les parcs des sites se cumulent famille par famille.
  const infraByType = new Map<string, { rooms: number; usedCells: number; capacityCells: number }>();
  for (const r of rows) {
    for (const u of r.infra.rooms) {
      const cur = infraByType.get(u.type) ?? { rooms: 0, usedCells: 0, capacityCells: 0 };
      cur.rooms += u.rooms;
      cur.usedCells += u.usedCells;
      cur.capacityCells += u.capacityCells;
      infraByType.set(u.type, cur);
    }
  }
  const occupancy = new Map(
    roomOccupancy([...infraByType.entries()].map(([type, v]) => ({ type, ...v }))).map((o) => [
      o.type,
      o,
    ]),
  );
  const transportCounts: Record<string, number> = {};
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.infra.transport)) {
      transportCounts[k] = (transportCounts[k] ?? 0) + v;
    }
  }
  const canteenRate = pct(
    rows.reduce((n, r) => n + r.infra.canteenStudents, 0),
    g.students,
  );

  const incidentsByMonth = monthLabels.map((_, i) =>
    rows.reduce((n, r) => n + (r.climate.incidents[i] ?? 0), 0),
  );
  const latesByMonth = monthLabels.map((_, i) =>
    rows.reduce((n, r) => n + (r.climate.lates[i] ?? 0), 0),
  );
  /** Dernier mois renseigné : un mois à venir vaut 0 et ne dit rien. */
  const lastFilled = (arr: number[]) => {
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i]! > 0) return arr[i]!;
    return 0;
  };

  const show = (v: number | null, suffix = '%') => (v === null ? '—' : `${v}${suffix}`);
  const yearLabel = rows.find((r) => r.yearStart)?.yearStart
    ? `${rows.find((r) => r.yearStart)!.yearStart!.getUTCFullYear()}-${
        rows.find((r) => r.yearStart)!.yearStart!.getUTCFullYear() + 1
      }`
    : '';

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-0.5 text-sm text-slate-600">
          {t('subtitle', { count: rows.length })}
          {yearLabel && ` · ${yearLabel}`}
        </p>
      </header>
      {nav}

      {/* ── Bloc 1 : indicateurs de groupe ─────────────────────────────── */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <BigKpi
          title={t('kpi.headcount')}
          icon="🎓"
          value={fmt(g.students)}
          subs={g.byCycle.map((c) => (
            <span key={c.cycle}>
              {c.cycle} : <strong className="text-slate-700">{fmt(c.students)}</strong>
            </span>
          ))}
        />
        <BigKpi
          title={t('kpi.collection')}
          icon="💰"
          value={show(g.collectionRate)}
          tone={rateTone(g.collectionRate, 90, 75) === 'good' ? 'emerald' : 'amber'}
          subs={
            <>
              <span>{t('kpi.unpaidShare', { pct: show(g.unpaidRate) })}</span>
              <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700">
                {t('kpi.unpaidFamilies', { count: g.unpaidFamilies })}
              </span>
            </>
          }
        />
        <BigKpi
          title={t('kpi.teacherLoad')}
          icon="🕒"
          value={g.hoursPerTeacher === null ? '—' : String(g.hoursPerTeacher)}
          unit={t('kpi.perTeacher')}
          subs={
            <>
              <span>{t('kpi.teacherCount', { count: g.teachers })}</span>
              <span>{t('kpi.multiSite', { count: g.multiSiteTeachers })}</span>
            </>
          }
        />
        <BigKpi
          title={t('kpi.occupancy')}
          icon="🏫"
          value={show(g.occupancyRate)}
          tone="amber"
          subs={
            <>
              <span className="text-red-600">
                {t('kpi.underfilled', { count: g.underfilledClasses })}
              </span>
              <span className="text-amber-600">
                {t('kpi.overfilled', { count: g.overfilledClasses })}
              </span>
            </>
          }
        />
      </div>

      {/* ── Bloc 2 : performance par établissement ─────────────────────── */}
      <Card title={t('blocks.bySite')} icon="🏙" className="mb-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <SiteCard
              key={r.name}
              name={r.name}
              headcount={t('kpi.studentsShort', { count: r.kpi.students })}
              color={colors[r.name]!}
              stats={[
                {
                  label: t('collection'),
                  value: show(r.collectionPct === null ? null : Math.round(r.collectionPct * 10) / 10),
                  tone: rateTone(r.collectionPct, 90, 75) === 'good' ? 'good' : 'warn',
                },
                {
                  label: t('attendance'),
                  value: show(r.attendance === null ? null : Math.round(r.attendance * 10) / 10),
                },
                {
                  label: t('successRate'),
                  value: show(r.successRate === null ? null : Math.round(r.successRate * 10) / 10),
                  tone: rateTone(r.successRate, 80, 60) === 'good' ? 'good' : undefined,
                },
                {
                  label: t('blocks.structure'),
                  value: show(pct(r.kpi.enrolled, r.kpi.capacity)),
                },
              ]}
            />
          ))}
        </div>
      </Card>

      {/* ── Blocs 3 et 4 : effectifs et encaissement ───────────────────── */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={t('blocks.byCycle')} icon="📊">
          <BarList
            rows={g.byCycle.map((c, i) => ({
              label: c.cycle,
              value: c.students,
              display: t('kpi.studentsShort', { count: c.students }),
              color: ['#1e3a8a', '#2563eb', '#60a5fa', '#93c5fd'][i % 4]!,
            }))}
          />
        </Card>
        <Card title={t('blocks.siteStructure')} icon="🏫">
          <table className="w-full table-fixed text-[11px]">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-1.5 py-1.5 text-start">{t('site')}</th>
                  <th className="px-1.5 py-1.5 text-end">{t('classes')}</th>
                  <th className="px-1.5 py-1.5 text-end">{t('teachers')}</th>
                  <th className="px-1.5 py-1.5 text-end">{t('students')}</th>
                  <th className="px-1.5 py-1.5 text-end">{t('blocks.cycles.primaire')}</th>
                  <th className="px-1.5 py-1.5 text-end">{t('blocks.cycles.college')}</th>
                  <th className="px-1.5 py-1.5 text-end">{t('blocks.cycles.lycee')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.name}>
                    <td className="truncate px-1.5 py-1.5 font-medium text-slate-900">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors[r.name] }} />
                        {r.name}
                      </span>
                    </td>
                    <td className="px-1.5 py-1.5 text-end tabular-nums">{fmt(r.classes)}</td>
                    <td className="px-1.5 py-1.5 text-end tabular-nums">{fmt(r.teachers)}</td>
                    <td className="px-1.5 py-1.5 text-end font-semibold tabular-nums">{fmt(r.students)}</td>
                    {(['primaire', 'college', 'lycee'] as const).map((code) => (
                      <td key={code} className="px-1.5 py-1.5 text-end tabular-nums text-slate-600">
                        {r.cycleCodes[code] ? fmt(r.cycleCodes[code]!) : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {rows.length > 1 && (
                <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
                  <tr>
                    <td className="px-1.5 py-1.5">{t('total')}</td>
                    <td className="px-1.5 py-1.5 text-end tabular-nums">{fmt(totals.classes)}</td>
                    <td className="px-1.5 py-1.5 text-end tabular-nums">{fmt(totals.teachers)}</td>
                    <td className="px-1.5 py-1.5 text-end tabular-nums">{fmt(totals.students)}</td>
                    {(['primaire', 'college', 'lycee'] as const).map((code) => (
                      <td key={code} className="px-1.5 py-1.5 text-end tabular-nums">
                        {fmt(rows.reduce((n, r) => n + (r.cycleCodes[code] ?? 0), 0))}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
          </table>
        </Card>
      </div>

      {/* ── Blocs 5 et 6 : climat et pédagogie ─────────────────────────── */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={t('blocks.climate')} icon="💗">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <Gauge
              value={g.attendanceRate}
              label={t('blocks.globalPresence')}
              hint={t('blocks.globalPresenceHint')}
            />
            <TrendStat
              label={t('blocks.latesPerMonth')}
              value={fmt(lastFilled(latesByMonth))}
              values={latesByMonth}
              color="#60a5fa"
            />
            <TrendStat
              label={t('blocks.incidentsPerMonth')}
              value={fmt(lastFilled(incidentsByMonth))}
              values={incidentsByMonth}
              color="#ef4444"
              tone="text-red-700"
            />
          </div>
        </Card>
        <Card title={t('blocks.pedagogy')} icon="🏅">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <MiniStat
              label={t('successRate')}
              value={show(g.successRate)}
              hint={t('blocks.successHint')}
              tone="text-brand-800"
            />
            <MiniStat
              label={t('blocks.progression')}
              value={
                g.progression === null
                  ? '—'
                  : `${g.progression > 0 ? '+' : ''}${g.progression} ${t('blocks.points')}`
              }
              hint={t('blocks.progressionHint')}
              tone={
                g.progression === null
                  ? 'text-slate-400'
                  : g.progression >= 0
                    ? 'text-emerald-700'
                    : 'text-red-700'
              }
            />
            <MiniStat
              label={t('average')}
              value={g.averageGeneral === null ? '—' : `${g.averageGeneral} /20`}
              hint={t('blocks.averageHint')}
              tone="text-slate-900"
            />
          </div>
        </Card>
      </div>

      {/* ── Bloc 7 : infrastructures et services ───────────────────────── */}
      <Card title={t('blocks.infrastructure')} icon="🏗" className="mb-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <LogTile
            icon="🏢"
            value={show(occupancy.get('STD')?.rate ?? null)}
            label={t('infra.classrooms')}
            tone={rateTone(occupancy.get('STD')?.rate ?? null, 70, 40)}
          />
          <LogTile
            icon="🧪"
            value={show(
              labRate(occupancy.get('LABO_PC')?.rate ?? null, occupancy.get('LABO_SVT')?.rate ?? null),
            )}
            label={t('infra.labs')}
            tone={rateTone(
              labRate(occupancy.get('LABO_PC')?.rate ?? null, occupancy.get('LABO_SVT')?.rate ?? null),
              70,
              40,
            )}
          />
          <LogTile
            icon="💻"
            value={show(occupancy.get('INFO')?.rate ?? null)}
            label={t('infra.computerRooms')}
            tone={rateTone(occupancy.get('INFO')?.rate ?? null, 70, 40)}
          />
          <LogTile
            icon="🤸"
            value={show(occupancy.get('EPS')?.rate ?? null)}
            label={t('infra.gym')}
            tone={rateTone(occupancy.get('EPS')?.rate ?? null, 70, 40)}
          />
          <LogTile
            icon="🚍"
            value={show(transportPunctuality(transportCounts))}
            label={t('infra.transport')}
            tone={rateTone(transportPunctuality(transportCounts), 90, 75)}
          />
          <LogTile
            icon="🍽"
            value={show(canteenRate)}
            label={t('infra.canteen')}
            tone={canteenRate === null ? 'none' : 'good'}
          />
        </div>
        <p className="mt-2 text-[11px] text-slate-400">{t('infra.note')}</p>
      </Card>


      {/* Évolutions mensuelles */}
      <div className="grid grid-cols-1 gap-4">
        <EncaissementTabs
          labels={monthLabels}
          total={recoveryTotal}
          sites={recoverySites}
          totalRate={recoveryRate}
          currency={currency}
          locale={locale}
        />
      </div>

      <AttendanceTabs
        labels={monthLabels}
        sites={attendanceSites}
        topAbsences={topAbsences}
        topLates={topLates}
      />

      <TeacherAttendanceTabs
        labels={monthLabels}
        sites={teacherSites}
        weekdayLabels={weekdayLabels}
      />
    </div>
  );
}
