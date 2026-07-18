import type { ReactNode } from 'react';
import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { isVieScolaireOnly } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { computeVieScolaire } from '@/lib/kpi-vie-scolaire';
import type { KpiStatus } from '@/lib/kpi-pilotage';
import { pickPeriodId } from '@/lib/periods';
import { DashboardTabs } from '../dashboard-tabs';

const TEXT: Record<KpiStatus, string> = {
  green: 'text-emerald-600',
  orange: 'text-amber-600',
  red: 'text-red-600',
  na: 'text-slate-400',
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
  // Onglet Pilotage visible seulement pour admin/direction (pas pour le CPE).
  const showPilotage = !(await isVieScolaireOnly());

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const activeYear = await tx.academicYear.findFirst({
      where: { active: true },
      include: { periods: { orderBy: { startDate: 'asc' } } },
    });
    const periods = activeYear?.periods ?? [];
    const selectedPeriodId = pickPeriodId(periods, sp.period);
    const vs = await computeVieScolaire(tx, selectedPeriodId, session.user.id);
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
        <DashboardTabs locale={locale} showPilotage={showPilotage} />
      </div>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
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
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              {t('apply')}
            </button>
          </form>
        )}
      </header>

      {/* ── Bloc 1 — Présence & assiduité ───────────────────────────────── */}
      <Block title={t('block1')} cols={4} defaultOpen>
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
          <div className="text-xs text-slate-500">{t('absences')}</div>
          <div className="mt-2 flex items-end gap-4">
            <div>
              <div className="text-2xl font-bold tabular-nums text-emerald-600">
                {vs.absJustified}
              </div>
              <div className="text-[11px] text-slate-400">{t('absJustified')}</div>
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums text-red-600">{vs.absUnjustified}</div>
              <div className="text-[11px] text-slate-400">{t('absUnjustified')}</div>
            </div>
          </div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">{t('lates')}</div>
          <div className="mt-1 flex items-end justify-between gap-3">
            <span className="text-3xl font-bold tabular-nums text-amber-600">{vs.lateToday}</span>
            <Sparkline values={vs.lateTrend} />
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {t('latesToday')} · {t('latesCumul', { count: vs.lateCumulative })} · {t('trend6w')}
          </div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">{t('absHistory')}</div>
          <div className="mt-2 flex items-end gap-4">
            <div>
              <div className="text-2xl font-bold tabular-nums text-slate-700">{vs.abs7}</div>
              <div className="text-[11px] text-slate-400">{t('days7')}</div>
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums text-slate-700">{vs.abs30}</div>
              <div className="text-[11px] text-slate-400">{t('days30')}</div>
            </div>
          </div>
        </Card>
      </Block>

      {/* ── Bloc 2 — Discipline & comportement ──────────────────────────── */}
      <Block title={t('block2')} cols={3}>
        <Card>
          <div className="text-xs text-slate-500">{t('incidents')}</div>
          <div className={`mt-1 text-3xl font-bold tabular-nums ${vs.incidents.total > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {vs.incidents.total}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Sev label={t('sevSevere')} value={vs.incidents.severe} cls="bg-red-100 text-red-700" />
            <Sev label={t('sevMedium')} value={vs.incidents.medium} cls="bg-orange-100 text-orange-700" />
            <Sev label={t('sevLight')} value={vs.incidents.light} cls="bg-amber-100 text-amber-800" />
          </div>
          <div className="mt-1.5 text-[11px] text-slate-400">{t('incidentsLabel')}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">{t('positives')}</div>
          <div className="mt-1 text-3xl font-bold tabular-nums text-emerald-600">
            {vs.positives.total}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Sev
              label={t('encouragements')}
              value={vs.positives.encouragements}
              cls="bg-emerald-100 text-emerald-700"
            />
            <Sev
              label={t('felicitations')}
              value={vs.positives.felicitations}
              cls="bg-sky-100 text-sky-700"
            />
          </div>
          <div className="mt-1.5 text-[11px] text-slate-400">{t('positivesLabel')}</div>
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
                    {s.className && (
                      <span className="ms-1 text-xs text-slate-400">· {s.className}</span>
                    )}
                  </Link>
                  <span className="flex shrink-0 gap-1">
                    {s.reasons.includes('absence') && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">
                        {t('reasonAbsence')}
                      </span>
                    )}
                    {s.reasons.includes('grade') && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                        {t('reasonGrade')}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Block>

      {/* ── Bloc 3 — Organisation scolaire ──────────────────────────────── */}
      <Block title={t('block3')} cols={3}>
        <Card>
          <div className="text-xs text-slate-500">{t('sessions')}</div>
          <div className="mt-1 flex items-end gap-4">
            <div>
              <div className="text-3xl font-bold tabular-nums text-slate-700">
                {vs.sessionsPlanned}
              </div>
              <div className="text-[11px] text-slate-400">{t('sessionsPlanned')}</div>
            </div>
            <div>
              <div
                className={`text-3xl font-bold tabular-nums ${vs.sessionsCancelled > 0 ? 'text-red-600' : 'text-slate-300'}`}
              >
                {vs.sessionsCancelled}
              </div>
              <div className="text-[11px] text-slate-400">{t('sessionsCancelled')}</div>
            </div>
          </div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">{t('substitutions')}</div>
          <div
            className={`mt-1 text-3xl font-bold tabular-nums ${vs.substitutions > 0 ? 'text-amber-600' : 'text-slate-300'}`}
          >
            {vs.substitutions}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">{t('substitutionsLabel')}</div>
        </Card>
        <Card>
          <NaKpi label={t('extracurricular')} sub={t('extracurricularLabel')} t={t} />
        </Card>
      </Block>

      {/* ── Bloc 4 — Vie pratique ───────────────────────────────────────── */}
      <Block title={t('block4')} cols={3}>
        <Card>
          <div className="text-xs text-slate-500">{t('canteen')}</div>
          <div className="mt-1 text-3xl font-bold tabular-nums text-slate-700">
            {vs.canteenExpected}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">{t('canteenExpected')}</div>
          <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
            <NaLine label={t('canteenMenu')} t={t} />
            <NaLine label={t('canteenBadge')} t={t} />
          </div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">{t('transport')}</div>
          {vs.transportToday ? (
            <>
              <div className="mt-1 flex items-end gap-4">
                <div>
                  <div className="text-2xl font-bold tabular-nums text-slate-700">
                    {vs.transportToday.morning}
                  </div>
                  <div className="text-[11px] text-slate-400">{t('transportMorning')}</div>
                </div>
                <div>
                  <div className="text-2xl font-bold tabular-nums text-slate-700">
                    {vs.transportToday.evening}
                  </div>
                  <div className="text-[11px] text-slate-400">{t('transportEvening')}</div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Sev
                  label={t('transportLate')}
                  value={vs.transportToday.late}
                  cls="bg-amber-100 text-amber-800"
                />
                <Sev
                  label={t('transportIncidents')}
                  value={vs.transportToday.incidents}
                  cls="bg-red-100 text-red-700"
                />
              </div>
            </>
          ) : (
            <div className="mt-1 text-sm italic text-slate-400">{t('transportEmpty')}</div>
          )}
        </Card>
        <Card>
          <div className="text-xs text-slate-500">{t('boarding')}</div>
          <div className="mt-1 text-3xl font-bold tabular-nums text-slate-700">
            {vs.boardingExpected}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">{t('boardingExpected')}</div>
          <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
            <NaLine label={t('boardingIncidents')} t={t} />
          </div>
        </Card>
      </Block>

      {/* ── Bloc 5 — Communication ──────────────────────────────────────── */}
      <Block title={t('block5')} cols={3}>
        <Card>
          <div className="text-xs text-slate-500">{t('messages')}</div>
          <div
            className={`mt-1 text-3xl font-bold tabular-nums ${vs.unreadMessages ? 'text-brand-700' : 'text-slate-300'}`}
          >
            {vs.unreadMessages ?? '—'}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">{t('messagesLabel')}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500">{t('announcements')}</div>
          <div className="mt-1 text-3xl font-bold tabular-nums text-slate-700">
            {vs.announcements7}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">{t('announcementsLabel')}</div>
        </Card>
        <Card>
          <NaKpi label={t('meetings')} sub={t('meetingsLabel')} t={t} />
        </Card>
      </Block>
    </div>
  );
}

/**
 * Bloc du cockpit — même design que les catégories du tableau de bord Pilotage
 * (« Vue d'ensemble », « Réussite scolaire »…) : `<details>` natif, filet brand
 * à gauche, chevron pivotant. Le 1er bloc est déplié, les autres pliés.
 */
function Block({
  title,
  cols,
  defaultOpen = false,
  children,
}: {
  title: string;
  cols: 3 | 4;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group mt-8 first:mt-0">
      <summary className="mb-3 flex cursor-pointer list-none items-center gap-2 border-s-4 border-brand-500 ps-3 text-lg font-bold text-slate-900 [&::-webkit-details-marker]:hidden">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-slate-400 transition-transform group-open:rotate-90"
          aria-hidden="true"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        {title}
      </summary>
      <div
        className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${cols === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}
      >
        {children}
      </div>
    </details>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-brand-200 bg-white p-5">{children}</div>;
}

/** Petite pastille « libellé + compteur » (gravité, ventilation…). */
function Sev({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {label} <span className="tabular-nums">{value}</span>
    </span>
  );
}

/** Indicateur sans modèle en base → « N/A · à venir ». */
function NaKpi({ label, sub, t }: { label: string; sub: string; t: (k: string) => string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium uppercase text-slate-400">
          {t('soon')}
        </span>
      </div>
      <div className="mt-1 text-lg font-semibold italic text-slate-400">{t('na')}</div>
      <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>
    </div>
  );
}

/** Ligne « N/A » compacte à l'intérieur d'une carte. */
function NaLine({ label, t }: { label: string; t: (k: string) => string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-slate-400">{label}</span>
      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium uppercase text-slate-400">
        {t('soon')}
      </span>
    </div>
  );
}

function Gauge({
  value,
  status,
  suffix,
}: {
  value: number | null;
  status: KpiStatus;
  suffix: string;
}) {
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
      <text x="38" y="43" textAnchor="middle" className={`text-[15px] font-bold ${TEXT[status]}`} fill="currentColor">
        {value !== null ? `${value.toFixed(0)}${suffix}` : '—'}
      </text>
    </svg>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 100;
  const h = 34;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 4) - 2).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline
        points={pts}
        fill="none"
        stroke="#f59e0b"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {values.map((v, i) => (
        <circle
          key={i}
          cx={(i * step).toFixed(1)}
          cy={(h - (v / max) * (h - 4) - 2).toFixed(1)}
          r="1.8"
          fill="#f59e0b"
        />
      ))}
    </svg>
  );
}
