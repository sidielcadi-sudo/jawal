import { getTranslations } from 'next-intl/server';
import type { TeacherDashboard } from '@/lib/kpi-teacher';
import type { KpiStatus } from '@/lib/kpi-pilotage';

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

/** Corps du tableau de bord enseignant — partagé admin + portail enseignant. */
export async function TeacherDashboardView({ dash }: { dash: TeacherDashboard }) {
  const t = await getTranslations('admin.teacherDashboard');
  const distMax = Math.max(1, dash.distribution.below10, dash.distribution.mid, dash.distribution.above14);

  // Progression : moyenne sélectionnée vs chaque période antérieure (T2/T1 ; T3/T2 ; T3/T1).
  const selIdx = dash.periodStats.findIndex((p) => p.id === dash.selectedPeriodId);
  const sel = selIdx >= 0 ? dash.periodStats[selIdx] : undefined;
  const progressions: { label: string; pct: number }[] = [];
  if (sel && sel.average !== null) {
    for (let j = selIdx - 1; j >= 0; j--) {
      const prev = dash.periodStats[j]!;
      if (prev.average !== null && prev.average !== 0) {
        progressions.push({
          label: `${sel.label} / ${prev.label}`,
          pct: ((sel.average - prev.average) / prev.average) * 100,
        });
      }
    }
  }

  // Variation de la distribution : période sélectionnée vs période précédente.
  let distVariation: number | null = null;
  const prevP = selIdx > 0 ? dash.periodStats[selIdx - 1] : undefined;
  if (
    sel &&
    prevP &&
    sel.abovePct !== null &&
    sel.belowPct !== null &&
    prevP.abovePct !== null &&
    prevP.belowPct !== null
  ) {
    distVariation = ((sel.abovePct - prevP.abovePct) + (prevP.belowPct - sel.belowPct)) / 2;
  }

  const fmtSigned = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
  const trendColor = (v: number) => (v > 0 ? 'text-emerald-600' : v < 0 ? 'text-red-600' : 'text-slate-500');

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Progression du programme — N/A */}
      <Section title={`🔸 ${t('program.title')}`}>
        <Field label={t('program.progress')}>
          <div className="mt-1">
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full ${BAR.na}`} style={{ width: '0%' }} />
            </div>
            <span className="mt-1 block text-xs italic text-slate-400">{t('na')}</span>
          </div>
        </Field>
        <Field label={t('program.chapters')}>
          <span className="text-slate-400">{t('na')}</span>
        </Field>
      </Section>

      {/* Évaluation & notes */}
      <Section title={`🔸 ${t('eval.title')}`}>
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex items-center gap-5">
            <Gauge value={dash.subjectAverage} max={20} status={dash.averageStatus} />
            <div>
              <div className="text-xs text-slate-500">{t('eval.average')}</div>
              <div className={`text-3xl font-bold tabular-nums ${TEXT[dash.averageStatus]}`}>
                {dash.subjectAverage !== null ? dash.subjectAverage.toFixed(1) : '—'}
                <span className="text-base font-normal text-slate-400"> / 20</span>
              </div>
            </div>
          </div>
          {/* Progression : Tn vs périodes antérieures */}
          <div className="border-s border-slate-100 ps-5">
            <div className="text-xs text-slate-500">{t('eval.progression')}</div>
            {progressions.length === 0 ? (
              <span className="mt-1 block text-xs italic text-slate-400">{t('eval.progressionNone')}</span>
            ) : (
              <div className="mt-1 space-y-0.5">
                {progressions.map((p) => (
                  <div key={p.label} className="flex items-center gap-1.5 text-sm">
                    <span className={`font-semibold tabular-nums ${trendColor(p.pct)}`}>
                      {p.pct >= 0 ? '▲' : '▼'} {fmtSigned(p.pct)} %
                    </span>
                    <span className="text-[11px] text-slate-400">{p.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="mt-4">
          <div className="text-xs text-slate-500">{t('eval.distribution')}</div>
          <div className="mt-2 flex items-end gap-3" style={{ height: '90px' }}>
            <HistoBar label={t('eval.below10')} value={dash.distribution.below10} max={distMax} color="bg-red-400" />
            <HistoBar label={t('eval.mid')} value={dash.distribution.mid} max={distMax} color="bg-amber-400" />
            <HistoBar label={t('eval.above14')} value={dash.distribution.above14} max={distMax} color="bg-emerald-400" />
          </div>
          {/* Variation de la distribution vs période précédente */}
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
            <span className="text-xs text-slate-500">{t('eval.distributionVariation')}</span>
            {distVariation === null ? (
              <span className="text-xs italic text-slate-400">{t('eval.progressionNone')}</span>
            ) : (
              <span className={`text-sm font-semibold tabular-nums ${trendColor(distVariation)}`}>
                {distVariation >= 0 ? '▲' : '▼'} {fmtSigned(distVariation)} pts
              </span>
            )}
          </div>
        </div>
      </Section>

      {/* Présence & discipline */}
      <Section title={`🔸 ${t('attendance.title')}`}>
        <Field label={t('attendance.rate')}>
          <span className={`text-2xl font-bold tabular-nums ${TEXT[dash.attendanceStatus]}`}>
            {dash.attendanceRate !== null ? `${dash.attendanceRate.toFixed(0)} %` : '—'}
          </span>
        </Field>
        <Field label={t('attendance.discipline')}>
          <span className="text-sm">
            <span className="font-semibold text-slate-400">{t('na')}</span>
            <span className="text-slate-400"> {t('attendance.incidents')}</span>
            <span className="mx-2 text-slate-300">·</span>
            <span className={`font-semibold ${dash.lateCount > 0 ? 'text-amber-600' : 'text-slate-700'}`}>
              {dash.lateCount}
            </span>
            <span className="text-slate-500"> {t('attendance.lates')}</span>
          </span>
        </Field>
      </Section>

      {/* Charge horaire & planning */}
      <Section title={`🔸 ${t('load.title')}`}>
        <Field label={t('load.weekly')}>
          <span className="text-2xl font-bold tabular-nums text-slate-800">
            {dash.weeklyHours.toFixed(0)}
            <span className="text-base font-normal text-slate-400"> {t('load.hoursPerWeek')}</span>
          </span>
        </Field>
        <Field label={t('load.quota')}>
          {dash.quotaPct !== null ? (
            <div className="mt-1">
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full ${BAR[dash.quotaStatus]}`} style={{ width: `${Math.min(100, dash.quotaPct)}%` }} />
              </div>
              <span className={`mt-1 block text-xs font-medium ${TEXT[dash.quotaStatus]}`}>
                {dash.quotaPct.toFixed(0)} % {t('load.quotaUsed')}
                {dash.contractualHours !== null && (
                  <span className="text-slate-400"> ({dash.weeklyHours.toFixed(0)}/{dash.contractualHours} h)</span>
                )}
              </span>
            </div>
          ) : (
            <span className="text-xs italic text-slate-400">{t('load.noContract')}</span>
          )}
        </Field>
      </Section>

      {/* Communication & feedback */}
      <Section title={`🔸 ${t('comm.title')}`}>
        <Field label={t('comm.feedback')}>
          <span className="text-slate-400">⭐ {t('na')}</span>
        </Field>
        <Field label={t('comm.unread')}>
          {dash.unreadMessages !== null ? (
            <span className="text-2xl font-bold tabular-nums text-slate-800">✉️ {dash.unreadMessages}</span>
          ) : (
            <span className="text-xs italic text-slate-400">{t('comm.noAccount')}</span>
          )}
        </Field>
      </Section>

      {/* Suivi des appels */}
      <Section title={`🔸 ${t('appel.title')}`}>
        <div className="grid grid-cols-2 gap-3">
          <MiniKpi
            label={t('appel.onTime')}
            value={dash.appel.onTimePct !== null ? `${dash.appel.onTimePct.toFixed(0)} %` : '—'}
            tone={dash.appel.onTimePct === null ? 'slate' : dash.appel.onTimePct >= 90 ? 'emerald' : dash.appel.onTimePct >= 75 ? 'amber' : 'red'}
            hint={t('appel.onTimeHint', { done: dash.appel.onTime, total: dash.appel.expected })}
          />
          <MiniKpi label={t('appel.late')} value={String(dash.appel.late)} tone={dash.appel.late > 0 ? 'amber' : 'slate'} />
          <MiniKpi label={t('appel.notDone')} value={String(dash.appel.notDone)} tone={dash.appel.notDone > 0 ? 'red' : 'slate'} />
          <MiniKpi label={t('appel.reminders')} value={String(dash.appel.reminders)} tone={dash.appel.reminders > 0 ? 'amber' : 'slate'} />
        </div>
      </Section>

      {/* Moyenne des classes : graphique à barres verticales (axes X/Y), tri croissant */}
      <Section title={`🔸 ${t('classAvg.title')}`}>
        {dash.classAverages.length === 0 ? (
          <p className="text-xs italic text-slate-400">{t('classAvg.empty')}</p>
        ) : (
          <ClassAvgChart data={dash.classAverages} />
        )}
      </Section>
    </div>
  );
}

function ClassAvgChart({ data }: { data: { className: string; average: number }[] }) {
  // Repère : Y = moyennes /20, X = classes (déjà triées croissant).
  const W = Math.max(320, data.length * 64);
  const H = 240;
  const padL = 30;
  const padR = 8;
  const padT = 14;
  const padB = 44;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const yMax = 20;
  const y = (v: number) => padT + plotH * (1 - v / yMax);
  const groupW = plotW / data.length;
  const barW = Math.min(38, groupW * 0.6);
  const ticks = [0, 5, 10, 15, 20];

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[240px] w-full min-w-[320px]" role="img">
        {/* Grille + axe Y */}
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={padL} y1={y(tk)} x2={W - padR} y2={y(tk)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={padL - 6} y={y(tk) + 3} textAnchor="end" className="fill-slate-400 text-[9px]">
              {tk}
            </text>
          </g>
        ))}
        {/* Axe X */}
        <line x1={padL} y1={y(0)} x2={W - padR} y2={y(0)} stroke="#94a3b8" strokeWidth="1" />

        {data.map((c, i) => {
          const cx = padL + groupW * i + groupW / 2;
          const h = plotH * (c.average / yMax);
          return (
            <g key={c.className}>
              <rect
                x={cx - barW / 2}
                y={y(c.average)}
                width={barW}
                height={h}
                rx="2"
                className="fill-amber-500"
              />
              <text x={cx} y={y(c.average) - 4} textAnchor="middle" className="fill-slate-700 text-[10px] font-semibold">
                {c.average.toFixed(1)}
              </text>
              <text x={cx} y={H - padB + 14} textAnchor="middle" className="fill-slate-500 text-[9px]">
                {c.className.length > 8 ? `${c.className.slice(0, 8)}…` : c.className}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MiniKpi({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: 'emerald' | 'amber' | 'red' | 'slate';
  hint?: string;
}) {
  const color: Record<string, string> = {
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
    slate: 'text-slate-700',
  };
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`mt-0.5 text-2xl font-bold tabular-nums ${color[tone]}`}>{value}</div>
      {hint && <div className="text-[10px] text-slate-400">{hint}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function Gauge({ value, max, status }: { value: number | null; max: number; status: KpiStatus }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const frac = value !== null ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" className="shrink-0">
      <circle cx="42" cy="42" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
      <circle
        cx="42"
        cy="42"
        r={r}
        fill="none"
        stroke={STROKE[status]}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${c * frac} ${c}`}
        transform="rotate(-90 42 42)"
      />
      <text x="42" y="47" textAnchor="middle" className="fill-slate-700 text-[16px] font-bold">
        {value !== null ? value.toFixed(1) : '—'}
      </text>
    </svg>
  );
}

function HistoBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const h = max > 0 ? Math.round((value / max) * 70) : 0;
  return (
    <div className="flex flex-1 flex-col items-center justify-end gap-1">
      <span className="text-xs font-semibold tabular-nums text-slate-700">{value}</span>
      <div className={`w-full rounded-t ${color}`} style={{ height: `${h}px` }} />
      <span className="text-[10px] text-slate-500">{label}</span>
    </div>
  );
}
