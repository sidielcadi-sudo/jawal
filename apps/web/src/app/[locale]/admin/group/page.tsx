import { redirect } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { computeHeadcount, computeAcademicOverview, computeAttendanceRate } from '@/lib/bi';
import { pickPeriodId } from '@/lib/periods';
import { tenantDisplayName } from '@/lib/tenant-name';
import { BarChart, LineChart, siteColors, type Series } from './charts';

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
};

/** Mois de l'année scolaire (10 mois à partir du mois de démarrage). */
const MONTH_COUNT = 10;

export default async function GroupDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  // Réservé aux comptes multi-établissements.
  if (session.user.sites.length <= 1) redirect(`/${locale}/admin`);
  const t = await getTranslations('admin.group');

  const rows: Row[] = await Promise.all(
    session.user.sites.map((site) =>
      withTenant(site.tenantId, async (tx): Promise<Row> => {
        const year = await tx.academicYear.findFirst({
          where: { active: true },
          include: { periods: { orderBy: { startDate: 'asc' } } },
        });
        const periods = year?.periods ?? [];
        const periodId = pickPeriodId(periods);

        const headcount = await computeHeadcount(tx);
        const academic = periodId ? await computeAcademicOverview(tx, periodId) : null;
        const attendance = periodId ? await computeAttendanceRate(tx, periodId) : null;

        const installments = await tx.installment.findMany({
          where: { status: { not: 'CANCELLED' } },
          select: { amount: true, dueDate: true },
        });
        const payments = await tx.payment.findMany({ select: { amount: true, paidAt: true } });
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

        return {
          // Nom localisé : en arabe on affiche `nameAr` quand il est saisi.
          name: tenantDisplayName(locale, tenant?.name ?? site.name, tenant?.nameAr),
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
  const totalCollection = totals.due > 0 ? (totals.paid / totals.due) * 100 : null;

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

  const paidSeries: Series[] = rows.map((r) => ({ name: r.name, values: r.monthlyPaid }));
  const collectionSeries: Series[] = rows.map((r) => ({
    name: r.name,
    values: r.monthlyCollectionPct,
  }));

  /** Montants en milliers : un axe à 6 chiffres est illisible. */
  const fmtK = (n: number) =>
    n >= 1000 ? `${(n / 1000).toLocaleString(locale, { maximumFractionDigits: 0 })}k` : String(Math.round(n));
  const fmtPct = (n: number) => `${n.toFixed(0)}%`;

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-0.5 text-sm text-slate-600">{t('subtitle', { count: rows.length })}</p>
      </header>

      {/* Comparaison entre sites — deux échelles distinctes, donc deux
          graphiques : mélanger un taux et des montants sur un axe commun
          rendrait la lecture fausse. */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChart
          title={t('charts.collectionByCite')}
          rows={rows.map((r) => ({ name: r.name, value: r.collectionPct }))}
          colors={colors}
          format={(n) => `${n.toFixed(1)}%`}
          max={100}
          emptyLabel={t('charts.empty')}
        />
        <BarChart
          title={t('charts.paidBySite', { currency })}
          rows={rows.map((r) => ({ name: r.name, value: r.paid }))}
          colors={colors}
          format={(n) => `${fmt(n)} ${currency}`}
          emptyLabel={t('charts.empty')}
        />
      </div>

      {/* Tableau consolidé — placé entre les comparaisons et les évolutions :
          il donne les chiffres exacts que les graphiques ne font que situer. */}
      <div className="mb-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-4 py-3 text-start">{t('site')}</th>
              <th className="px-4 py-3 text-end">{t('students')}</th>
              <th className="px-4 py-3 text-end">{t('teachers')}</th>
              <th className="px-4 py-3 text-end">{t('classes')}</th>
              <th className="px-4 py-3 text-end">{t('average')}</th>
              <th className="px-4 py-3 text-end">{t('successRate')}</th>
              <th className="px-4 py-3 text-end">{t('attendance')}</th>
              <th className="px-4 py-3 text-end">{t('collection')}</th>
              <th className="px-4 py-3 text-end">{t('remaining')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="px-4 py-3 font-medium text-slate-900">{r.name}</td>
                <td className="px-4 py-3 text-end tabular-nums">{r.students}</td>
                <td className="px-4 py-3 text-end tabular-nums">{r.teachers}</td>
                <td className="px-4 py-3 text-end tabular-nums">{r.classes}</td>
                <td className="px-4 py-3 text-end tabular-nums">{r.avg !== null ? r.avg.toFixed(2) : '—'}</td>
                <td className="px-4 py-3 text-end tabular-nums">
                  {r.successRate !== null ? `${r.successRate.toFixed(1)}%` : '—'}
                </td>
                <td className="px-4 py-3 text-end tabular-nums">
                  {r.attendance !== null ? `${r.attendance.toFixed(1)}%` : '—'}
                </td>
                <td className="px-4 py-3 text-end tabular-nums">
                  {r.collectionPct !== null ? `${r.collectionPct.toFixed(1)}%` : '—'}
                </td>
                <td className="px-4 py-3 text-end tabular-nums text-amber-700">
                  {fmt(r.remaining)} {r.currency}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
            <tr>
              <td className="px-4 py-3">{t('total')}</td>
              <td className="px-4 py-3 text-end tabular-nums">{totals.students}</td>
              <td className="px-4 py-3 text-end tabular-nums">{totals.teachers}</td>
              <td className="px-4 py-3 text-end tabular-nums">{totals.classes}</td>
              {/* Moyenne, réussite et présence ne s'additionnent pas entre
                  sites : on laisse la colonne vide plutôt que d'afficher un
                  total qui n'aurait pas de sens (cf. note sous le tableau). */}
              <td className="px-4 py-3 text-end text-slate-400">—</td>
              <td className="px-4 py-3 text-end text-slate-400">—</td>
              <td className="px-4 py-3 text-end text-slate-400">—</td>
              <td className="px-4 py-3 text-end tabular-nums">
                {totalCollection !== null ? `${totalCollection.toFixed(1)}%` : '—'}
              </td>
              <td className="px-4 py-3 text-end tabular-nums text-amber-700">
                {fmt(totals.remaining)} {currency}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mb-4 text-xs text-slate-400">{t('note')}</p>

      {/* Évolutions mensuelles */}
      <div className="grid grid-cols-1 gap-4">
        <LineChart
          title={t('charts.paidTrend', { currency })}
          labels={monthLabels}
          series={paidSeries}
          colors={colors}
          format={fmtK}
          emptyLabel={t('charts.empty')}
        />
        <LineChart
          title={t('charts.collectionTrend')}
          labels={monthLabels}
          series={collectionSeries}
          colors={colors}
          format={fmtPct}
          yMax={100}
          emptyLabel={t('charts.empty')}
        />
      </div>
    </div>
  );
}
