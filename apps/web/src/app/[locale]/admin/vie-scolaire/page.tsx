import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { computeVieScolaire } from '@/lib/kpi-vie-scolaire';
import type { KpiStatus } from '@/lib/kpi-pilotage';
import { VieScolaireTabs } from './tabs';

const TEXT: Record<KpiStatus, string> = {
  green: 'text-emerald-600',
  orange: 'text-amber-600',
  red: 'text-red-600',
  na: 'text-slate-400',
};
const BAR: Record<KpiStatus, string> = {
  green: 'bg-emerald-500',
  orange: 'bg-amber-500',
  red: 'bg-red-500',
  na: 'bg-slate-300',
};
const STROKE: Record<KpiStatus, string> = {
  green: '#10b981',
  orange: '#f59e0b',
  red: '#ef4444',
  na: '#cbd5e1',
};

export default async function VieScolairePage({
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
  const t = await getTranslations('admin.vieScolaire');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const activeYear = await tx.academicYear.findFirst({
      where: { active: true },
      include: { periods: { orderBy: { startDate: 'asc' } } },
    });
    const periods = activeYear?.periods ?? [];
    const selectedPeriodId = sp.period ?? periods[0]?.id ?? null;
    const vs = await computeVieScolaire(tx, selectedPeriodId);
    return {
      periods: periods.map((p) => ({ id: p.id, label: p.label })),
      selectedPeriodId,
      vs,
    };
  });

  const { vs } = data;
  const today = new Date().toLocaleDateString(locale, { dateStyle: 'long' });

  return (
    <div className="px-3 py-3">
      <div className="mb-4">
        <VieScolaireTabs locale={locale} />
      </div>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-3xl bg-gradient-to-r from-brand-100 to-brand-50 px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-600">{today}</p>
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
            <button type="submit" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              {t('apply')}
            </button>
          </form>
        )}
      </header>

      {/* Bloc 1 — Présence & absences */}
      <Block title={`🔹 ${t('block1')}`}>
        <Card>
          <div className="flex items-center gap-4">
            <Gauge value={vs.presenceTodayRate} status={vs.presenceTodayStatus} suffix="%" />
            <div>
              <div className="text-xs text-slate-500">{t('presence')}</div>
              <div className="text-[11px] text-slate-400">
                {t('presenceCount', { count: vs.presenceTodayTotal })}
              </div>
            </div>
          </div>
        </Card>
        <Card>
          <Counter
            value={vs.unjustifiedAbsences}
            status={vs.unjustifiedAbsences > 0 ? 'red' : 'green'}
            label={t('unjustified')}
            sub={t('unjustifiedLabel')}
          />
        </Card>
      </Block>

      {/* Bloc 2 — Discipline */}
      <Block title={`🔹 ${t('block2')}`}>
        <Card>
          <NaKpi label={t('incidents')} sub={t('incidentsLabel')} t={t} />
        </Card>
        <Card>
          <div className="text-xs text-slate-500">{t('lates')}</div>
          <div className="mt-1 flex items-end justify-between gap-3">
            <span className="text-3xl font-bold tabular-nums text-amber-600">{vs.lateCumulative}</span>
            <Sparkline values={vs.lateTrend} />
          </div>
          <div className="mt-1 text-[11px] text-slate-400">{t('latesLabel')} · {t('trend6w')}</div>
        </Card>
      </Block>

      {/* Bloc 3 — Communication */}
      <Block title={`🔹 ${t('block3')}`}>
        <Card>
          <NaKpi label={t('notifications')} sub={t('notificationsLabel')} t={t} donut />
        </Card>
        <div />
      </Block>

      {/* Bloc 4 — Administration */}
      <Block title={`🔹 ${t('block4')}`}>
        <Card>
          <div className="text-xs text-slate-500">{t('records')}</div>
          {vs.recordsComplete !== null ? (
            <>
              <div className={`mt-1 text-3xl font-bold tabular-nums ${TEXT[vs.recordsCompleteStatus]}`}>
                {vs.recordsComplete.toFixed(0)} %
              </div>
              <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full ${BAR[vs.recordsCompleteStatus]}`} style={{ width: `${vs.recordsComplete}%` }} />
              </div>
            </>
          ) : (
            <div className="mt-1 text-sm italic text-slate-400">{t('na')}</div>
          )}
          <div className="mt-1 text-[11px] text-slate-400">{t('recordsLabel')}</div>
        </Card>
        <div />
      </Block>

      {/* Bloc 5 — Sécurité & bien-être */}
      <Block title={`🔹 ${t('block5')}`}>
        <Card>
          <NaKpi label={t('medical')} sub={t('medicalLabel')} t={t} />
        </Card>
        <Card>
          <div className="mb-2 text-xs text-slate-500">
            {t('atRisk')} <span className="text-slate-400">· {t('atRiskLabel')}</span>
          </div>
          {vs.atRisk.length === 0 ? (
            <p className="text-sm text-emerald-700">✓ {t('atRiskEmpty')}</p>
          ) : (
            <ul className="space-y-1.5">
              {vs.atRisk.map((s) => (
                <li key={s.studentId} className="flex items-center justify-between gap-2 text-sm">
                  <Link
                    href={`/${locale}/admin/persons/${s.studentId}`}
                    className="truncate font-medium text-slate-800 hover:text-brand-700 hover:underline"
                  >
                    {s.lastName} {s.firstName}
                    {s.className && <span className="ms-1 text-xs text-slate-400">· {s.className}</span>}
                  </Link>
                  <span className="flex shrink-0 gap-1">
                    {s.reasons.includes('absence') && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">{t('reasonAbsence')}</span>
                    )}
                    {s.reasons.includes('grade') && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">{t('reasonGrade')}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Block>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-slate-700">{title}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5">{children}</div>;
}

function Counter({ value, status, label, sub }: { value: number; status: KpiStatus; label: string; sub: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-bold tabular-nums ${TEXT[status]}`}>{value}</div>
      <div className="mt-1 text-[11px] text-slate-400">{sub}</div>
    </div>
  );
}

function NaKpi({
  label,
  sub,
  t,
  donut,
}: {
  label: string;
  sub: string;
  t: (k: string) => string;
  donut?: boolean;
}) {
  return (
    <div className="flex items-center gap-4">
      {donut ? (
        <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0">
          <circle cx="32" cy="32" r="26" fill="none" stroke="#e2e8f0" strokeWidth="9" />
        </svg>
      ) : null}
      <div>
        <div className="text-xs text-slate-500">{label}</div>
        <div className="mt-1 text-lg font-semibold italic text-slate-400">{t('na')}</div>
        <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>
      </div>
    </div>
  );
}

function Gauge({ value, status, suffix }: { value: number | null; status: KpiStatus; suffix: string }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const frac = value !== null ? Math.max(0, Math.min(1, value / 100)) : 0;
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" className="shrink-0">
      <circle cx="38" cy="38" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
      <circle
        cx="38"
        cy="38"
        r={r}
        fill="none"
        stroke={STROKE[status]}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${c * frac} ${c}`}
        transform="rotate(-90 38 38)"
      />
      <text x="38" y="43" textAnchor="middle" className="fill-slate-700 text-[15px] font-bold">
        {value !== null ? `${value.toFixed(0)}${suffix}` : '—'}
      </text>
    </svg>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 120;
  const h = 36;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 4) - 2).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline points={pts} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {values.map((v, i) => (
        <circle key={i} cx={(i * step).toFixed(1)} cy={(h - (v / max) * (h - 4) - 2).toFixed(1)} r="1.8" fill="#f59e0b" />
      ))}
    </svg>
  );
}
