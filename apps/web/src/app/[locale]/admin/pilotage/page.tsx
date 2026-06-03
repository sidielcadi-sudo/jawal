import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { computePilotage, type Kpi, type KpiStatus } from '@/lib/kpi-pilotage';

// Bornes affichées sous chaque carte (numériques, indépendantes de la langue).
const THRESHOLDS: Record<string, { green: string; orange: string; red: string }> = {
  successRate: { green: '> 80 %', orange: '60–80 %', red: '< 60 %' },
  absenteeism: { green: '< 5 %', orange: '5–10 %', red: '> 10 %' },
  collection: { green: '> 90 %', orange: '80–90 %', red: '< 80 %' },
  teacherLoad: { green: '< 15 h', orange: '15–20 h', red: '> 20 h' },
  levelAverage: { green: '> 12', orange: '10–12', red: '< 10' },
};

const STATUS_CARD: Record<KpiStatus, string> = {
  green: 'border-emerald-200 bg-emerald-50',
  orange: 'border-amber-200 bg-amber-50',
  red: 'border-red-200 bg-red-50',
  na: 'border-slate-200 bg-slate-50',
};
const STATUS_VALUE: Record<KpiStatus, string> = {
  green: 'text-emerald-700',
  orange: 'text-amber-700',
  red: 'text-red-700',
  na: 'text-slate-400',
};
const STATUS_DOT: Record<KpiStatus, string> = {
  green: 'bg-emerald-500',
  orange: 'bg-amber-500',
  red: 'bg-red-500',
  na: 'bg-slate-300',
};

function formatValue(kpi: Kpi): string {
  if (kpi.value === null) return '—';
  switch (kpi.unit) {
    case '%':
      return `${kpi.value.toFixed(1)} %`;
    case 'h':
      return `${kpi.value.toFixed(1)} h`;
    case '/20':
      return `${kpi.value.toFixed(2)}/20`;
    case '/5':
      return `${kpi.value.toFixed(1)}/5`;
    default:
      return String(kpi.value);
  }
}

export default async function PilotagePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.pilotage');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const activeYear = await tx.academicYear.findFirst({
      where: { active: true },
      include: { periods: { orderBy: { startDate: 'asc' } } },
    });
    const periods = activeYear?.periods ?? [];
    const selectedPeriodId = sp.period ?? periods[0]?.id ?? null;
    const kpis = await computePilotage(tx, selectedPeriodId);
    return {
      yearLabel: activeYear?.label ?? '—',
      periods: periods.map((p) => ({ id: p.id, label: p.label })),
      selectedPeriodId,
      kpis,
    };
  });

  const { kpis } = data;
  const cards: Array<{ kpi: Kpi; thresholdKey: keyof typeof THRESHOLDS | null }> = [
    { kpi: kpis.successRate, thresholdKey: 'successRate' },
    { kpi: kpis.absenteeism, thresholdKey: 'absenteeism' },
    { kpi: kpis.collection, thresholdKey: 'collection' },
    { kpi: kpis.teacherLoad, thresholdKey: 'teacherLoad' },
    { kpi: kpis.satisfaction, thresholdKey: null },
    { kpi: kpis.conformiteMassar, thresholdKey: null },
  ];

  const maxLevel = Math.max(1, ...kpis.levelAverages.map((l) => l.average ?? 0), 20);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('subtitle')} · {data.yearLabel}</p>
        </div>
        {data.periods.length > 0 && (
          <form method="get" className="flex items-end gap-2">
            <label className="block">
              <span className="block text-xs text-slate-500">{t('period')}</span>
              <select
                name="period"
                defaultValue={data.selectedPeriodId ?? ''}
                className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm"
              >
                {data.periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              {t('apply')}
            </button>
          </form>
        )}
      </header>

      {/* Cartes KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ kpi, thresholdKey }) => (
          <div key={kpi.key} className={`rounded-2xl border p-5 ${STATUS_CARD[kpi.status]}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {t(`kpi.${kpi.key}`)}
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase text-slate-500">
                <span className={`h-2 w-2 rounded-full ${STATUS_DOT[kpi.status]}`} />
                {t(`status.${kpi.status}`)}
              </span>
            </div>
            <div className={`mt-2 text-3xl font-semibold tabular-nums ${STATUS_VALUE[kpi.status]}`}>
              {formatValue(kpi)}
            </div>
            {thresholdKey ? (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
                <span>🟢 {THRESHOLDS[thresholdKey]!.green}</span>
                <span>🟠 {THRESHOLDS[thresholdKey]!.orange}</span>
                <span>🔴 {THRESHOLDS[thresholdKey]!.red}</span>
              </div>
            ) : (
              <div className="mt-2 text-[10px] italic text-slate-400">{t('noData')}</div>
            )}
          </div>
        ))}
      </div>

      {/* Moyennes par niveau */}
      <section className="mt-8">
        <h2 className="mb-1 text-base font-semibold text-slate-900">{t('kpi.levelAverages')}</h2>
        <p className="mb-3 text-[11px] text-slate-500">
          🟢 {THRESHOLDS.levelAverage!.green} · 🟠 {THRESHOLDS.levelAverage!.orange} · 🔴{' '}
          {THRESHOLDS.levelAverage!.red}
        </p>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          {kpis.levelAverages.length === 0 ? (
            <p className="text-sm text-slate-500">{t('empty')}</p>
          ) : (
            <ul className="space-y-2.5">
              {kpis.levelAverages.map((l) => (
                <li key={l.levelId} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-sm text-slate-700">{l.label}</span>
                  <div className="relative h-5 flex-1 overflow-hidden rounded bg-slate-100">
                    <div
                      className={`h-full ${STATUS_DOT[l.status]}`}
                      style={{ width: `${l.average !== null ? (l.average / maxLevel) * 100 : 0}%` }}
                    />
                  </div>
                  <span className={`w-16 shrink-0 text-end text-sm font-semibold tabular-nums ${STATUS_VALUE[l.status]}`}>
                    {l.average !== null ? `${l.average.toFixed(2)}` : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Légende couleurs */}
      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold text-slate-900">{t('legend.title')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(['green', 'orange', 'red'] as const).map((s) => (
            <div key={s} className={`rounded-xl border p-4 ${STATUS_CARD[s]}`}>
              <div className="flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full ${STATUS_DOT[s]}`} />
                <span className="text-sm font-semibold text-slate-800">{t(`status.${s}`)}</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-600">{t(`legend.${s}`)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
