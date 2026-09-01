import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { tallyAttendance } from '@/lib/attendance-category';
import { countUnreadCarnet } from '@/lib/carnet';
import { getParentChildren, getParentAnnouncements } from '@/lib/parent';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';

export default async function ParentHomePage({
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
  const tenantId = session.user.tenantId;
  const t = await getTranslations('parent.home');

  const data = await withTenant(tenantId, async (tx) => {
    const children = await getParentChildren(tx, session.user.id);
    const activeYear = await tx.academicYear.findFirst({
      where: { active: true },
      include: { periods: { orderBy: { startDate: 'asc' } } },
    });
    const periods = activeYear?.periods ?? [];

    // Période sélectionnée : ?period=… sinon le trimestre/semestre courant. Hors
    // période (vacances/fin d'année) : dernier trimestre commencé, sinon le 1er.
    const now = new Date();
    const current = periods.find((p) => p.startDate <= now && now <= p.endDate);
    const started = periods.filter((p) => p.startDate <= now);
    const fallback = started[started.length - 1] ?? periods[0] ?? null;
    const selectedPeriod =
      periods.find((p) => p.id === sp.period) ?? current ?? fallback;

    // Fenêtre de calcul des KPI : période choisie, sinon l'année entière.
    const winStart = selectedPeriod?.startDate ?? activeYear?.startDate ?? null;
    const winEnd = selectedPeriod?.endDate ?? activeYear?.endDate ?? null;

    const cards = await Promise.all(
      children.map(async (child) => {
        let attendanceRate: number | null = null;
        let absences = 0;
        let retards = 0;
        if (winStart && winEnd) {
          const att = await tx.attendanceRecord.findMany({
            where: {
              studentId: child.id,
              session: { finalizedAt: { not: null }, date: { gte: winStart, lte: winEnd } },
            },
            select: { status: true, infirmary: true, punishment: true, exclusion: true },
          });
          if (att.length > 0) {
            const tally = tallyAttendance(att);
            attendanceRate = tally.rate;
            absences = tally.counts.ABSENT + tally.counts.EXCLUSION;
            retards = tally.counts.LATE;
          }
        }

        const installments = await tx.installment.findMany({
          where: { studentId: child.id, status: { not: 'CANCELLED' } },
          include: { payments: { select: { amount: true } } },
          orderBy: { dueDate: 'asc' },
        });
        const due = installments.reduce((s, i) => s + Number(i.amount), 0);
        const paid = installments.reduce(
          (s, i) => s + i.payments.reduce((ps, p) => ps + Number(p.amount), 0),
          0,
        );

        // Échéances non soldées : c'est le reste à payer ligne à ligne qui
        // compte, pas le statut — un règlement partiel laisse la ligne ouverte.
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const pending = installments
          .map((i) => ({
            label: i.label,
            dueDate: i.dueDate,
            rest: Number(i.amount) - i.payments.reduce((ps, p) => ps + Number(p.amount), 0),
          }))
          .filter((i) => i.rest > 0.005);
        const overdueCount = pending.filter((i) => i.dueDate < today).length;
        const nextDue = pending[0] ?? null;

        const carnetUnread = await countUnreadCarnet(tx, child.id);

        return {
          child,
          attendanceRate,
          absences,
          retards,
          remaining: Math.max(0, due - paid),
          carnetUnread,
          pendingCount: pending.length,
          overdueCount,
          next: nextDue
            ? {
                label: nextDue.label,
                rest: nextDue.rest,
                days: Math.round((nextDue.dueDate.getTime() - today.getTime()) / 86400000),
              }
            : null,
        };
      }),
    );

    // 5 dernières notes (toutes les notes des enfants, plus récentes d'abord).
    const childIds = children.map((c) => c.id);
    const nameById = new Map(children.map((c) => [c.id, personDisplayName(locale, c, 'first-last')]));
    const latestGrades =
      childIds.length > 0 && activeYear
        ? await tx.grade.findMany({
            where: {
              studentId: { in: childIds },
              value: { not: null },
              evaluation: { date: { gte: activeYear.startDate, lte: activeYear.endDate } },
            },
            orderBy: { evaluation: { date: 'desc' } },
            take: 5,
            include: { evaluation: { include: { subject: { select: { label: true, labelAr: true } } } } },
          })
        : [];
    const latestNotes = latestGrades.map((g) => ({
      id: g.id,
      childName: nameById.get(g.studentId) ?? '',
      subject: localizedLabel(locale, g.evaluation.subject.label, g.evaluation.subject.labelAr),
      label: g.evaluation.label,
      value: g.value as number,
      max: g.evaluation.maxValue,
      date: g.evaluation.date,
    }));

    const announcements = await getParentAnnouncements(tx, children, 4);
    return {
      cards,
      announcements,
      latestNotes,
      periods: periods.map((p) => ({ id: p.id, label: p.label, labelAr: p.labelAr })),
      selectedPeriodId: selectedPeriod?.id ?? null,
    };
  });

  // Libellé de la fenêtre de calcul des KPI (trimestre courant, ou année).
  const windowLabel =
    data.periods.find((p) => p.id === data.selectedPeriodId)?.label ?? null;

  return (
    <div className="px-3 py-3">
      {/* Hero */}
      <section className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('subtitle')}</p>
        </div>
        {data.periods.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-slate-500">{t('period')}</span>
            {data.periods.map((p) => (
              <Link
                key={p.id}
                href={`/${locale}/parent?period=${p.id}`}
                className={`whitespace-nowrap rounded-lg px-3 py-1 text-xs font-medium ${
                  data.selectedPeriodId === p.id
                    ? 'bg-brand-600 text-white'
                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {p.label}
              </Link>
            ))}
          </div>
        )}
      </section>

      {data.cards.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {t('noChild')}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {data.cards.map(({ child, attendanceRate, absences, retards, remaining, carnetUnread, pendingCount, overdueCount, next }) => (
            <Link
              key={child.id}
              href={`/${locale}/parent/children/${child.id}`}
              className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-indigo-100 text-sm font-semibold text-brand-600">
                    {(child.firstName[0] ?? '') + (child.lastName[0] ?? '')}
                  </span>
                  <div>
                    <div className="text-base font-semibold text-slate-900">
                      {personDisplayName(locale, child, 'first-last')}
                    </div>
                    {child.className && <div className="text-xs text-slate-400">{child.className}</div>}
                  </div>
                </div>
                <span className="flex items-center gap-2">
                  {pendingCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-2 py-0.5 text-xs font-medium text-red-700">
                      {'⚠'} {t('pendingPayments', { count: pendingCount })}
                    </span>
                  )}
                  {carnetUnread > 0 && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      {t('carnetUnread', { count: carnetUnread })}
                    </span>
                  )}
                  <span className="text-brand-600">→</span>
                </span>
              </div>

              <div className="mt-4 flex items-center gap-4">
                <Donut
                  pct={attendanceRate ?? 0}
                  color={attendanceRate === null ? '#cbd5e1' : attendanceRate < 90 ? '#d97706' : '#059669'}
                  center={attendanceRate !== null ? `${attendanceRate.toFixed(1)}%` : '—'}
                  label={
                    // Le taux porte sur la période sélectionnée, pas sur
                    // l'année : sans ce repère, il semble contredire l'admin.
                    windowLabel ? `${t('attendance')} · ${windowLabel}` : t('attendance')
                  }
                />
                <div className="grid flex-1 grid-cols-3 gap-2 text-center text-xs">
                  <Stat value={String(absences)} label={t('absences')} tone={absences > 0 ? 'red' : 'slate'} />
                  <Stat value={String(retards)} label={t('retards')} tone={retards > 0 ? 'amber' : 'slate'} />
                  <Stat
                    value={remaining > 0 ? remaining.toLocaleString(locale) : '✓'}
                    label={remaining > 0 ? t('remaining') : t('upToDate')}
                    tone={remaining > 0 ? 'amber' : 'emerald'}
                  />
                </div>
              </div>

              {/* Échéances — l'alerte de dépassement passe en premier : c'est
                  la seule information qui appelle une action immédiate. */}
              {overdueCount > 0 && (
                <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  {'❗'} {t('overdueAlert', { count: overdueCount })}
                </p>
              )}
              {next && (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2">
                  <span className="min-w-0 truncate text-xs text-slate-600">{next.label}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums text-slate-900">
                      {next.rest.toLocaleString(locale, { maximumFractionDigits: 0 })}
                    </span>
                    <span
                      className={
                        next.days < 0
                          ? 'rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700'
                          : 'rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800'
                      }
                    >
                      {next.days < 0
                        ? t('lateBy', { days: -next.days })
                        : t('dueIn', { days: next.days })}
                    </span>
                  </span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {data.latestNotes.length > 0 && (
        <section className="mt-6 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-slate-800">{t('latestNotes')}</h2>
          <ul className="divide-y divide-slate-100">
            {data.latestNotes.map((n) => (
              <li key={n.id} className="flex items-center justify-between gap-3 py-2.5">
                {/* Filet coloré : repère la matière d'un coup d'œil. */}
                <span
                  aria-hidden
                  className="h-8 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: subjectColor(n.subject) }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800">
                    {n.subject}
                    <span className="ms-1.5 text-xs font-normal text-slate-400">{n.label}</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    <span className="font-semibold text-slate-600">{n.childName}</span> ·{' '}
                    {new Date(n.date).toLocaleDateString(locale)}
                  </div>
                </div>
                <span
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    n.value < n.max / 2 ? 'text-red-700' : 'text-emerald-700'
                  }`}
                >
                  {n.value}
                  <span className="text-[10px] font-normal text-slate-400">/{n.max}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">{t('latestAnnouncements')}</h2>
          <Link
            href={`/${locale}/parent/announcements`}
            className="text-xs font-medium text-brand-600 hover:underline"
          >
            {t('seeAll')} →
          </Link>
        </div>
        {data.announcements.length === 0 ? (
          <p className="text-xs text-slate-400">{t('noAnnouncement')}</p>
        ) : (
          <ul className="space-y-2">
            {data.announcements.map((a) => (
              <li key={a.id} className="rounded-2xl border border-slate-100 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-900">{a.title}</span>
                  <span className="shrink-0 text-sm font-semibold text-brand-600">
                    {a.publishedAt ? new Date(a.publishedAt).toLocaleDateString(locale) : ''}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{a.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Couleur de matière dérivée du libellé : stable d'un rendu à l'autre, et
 * sans table à tenir à jour quand une matière est ajoutée.
 */
const SUBJECT_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7', '#0ea5e9', '#84cc16'];
function subjectColor(label: string): string {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return SUBJECT_COLORS[h % SUBJECT_COLORS.length]!;
}

function Donut({ pct, color, center, label }: { pct: number; color: string; center: string; label: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <div
        className="grid h-[72px] w-[72px] place-items-center rounded-full"
        style={{ background: `conic-gradient(${color} ${Math.max(0, Math.min(100, pct)) * 3.6}deg, #e6e9f5 0deg)` }}
      >
        <div className="grid h-[52px] w-[52px] place-items-center rounded-full bg-white text-xs font-bold text-slate-800">
          {center}
        </div>
      </div>
      <span className="text-[10px] uppercase tracking-wide text-slate-400">{label}</span>
    </div>
  );
}

function Stat({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone: 'emerald' | 'red' | 'amber' | 'slate';
}) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-700',
    red: 'text-red-700',
    amber: 'text-amber-700',
    slate: 'text-slate-600',
  };
  return (
    <div className="rounded-xl bg-slate-50 px-2 py-2.5">
      <div className={`text-base font-semibold tabular-nums ${colors[tone]}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
