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
        <div className="mt-4">
          <div className="text-xs text-slate-500">{t('eval.distribution')}</div>
          <div className="mt-2 flex items-end gap-3" style={{ height: '90px' }}>
            <HistoBar label={t('eval.below10')} value={dash.distribution.below10} max={distMax} color="bg-red-400" />
            <HistoBar label={t('eval.mid')} value={dash.distribution.mid} max={distMax} color="bg-amber-400" />
            <HistoBar label={t('eval.above14')} value={dash.distribution.above14} max={distMax} color="bg-emerald-400" />
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
