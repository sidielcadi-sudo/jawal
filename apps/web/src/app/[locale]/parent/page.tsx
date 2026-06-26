import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { tallyAttendance } from '@/lib/attendance-category';
import { countUnreadCarnet } from '@/lib/carnet';
import { getParentChildren, getParentAnnouncements } from '@/lib/parent';

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

    // Période sélectionnée : ?period=… sinon le trimestre/semestre courant, sinon le 1er.
    const now = new Date();
    const current = periods.find((p) => p.startDate <= now && now <= p.endDate);
    const selectedPeriod =
      periods.find((p) => p.id === sp.period) ?? current ?? periods[0] ?? null;

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
        });
        const due = installments.reduce((s, i) => s + Number(i.amount), 0);
        const paid = installments.reduce(
          (s, i) => s + i.payments.reduce((ps, p) => ps + Number(p.amount), 0),
          0,
        );

        const carnetUnread = await countUnreadCarnet(tx, child.id);

        return { child, attendanceRate, absences, retards, remaining: Math.max(0, due - paid), carnetUnread };
      }),
    );

    // 5 dernières notes (toutes les notes des enfants, plus récentes d'abord).
    const childIds = children.map((c) => c.id);
    const nameById = new Map(children.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));
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
            include: { evaluation: { include: { subject: { select: { label: true } } } } },
          })
        : [];
    const latestNotes = latestGrades.map((g) => ({
      id: g.id,
      childName: nameById.get(g.studentId) ?? '',
      subject: g.evaluation.subject.label,
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
      periods: periods.map((p) => ({ id: p.id, label: p.label })),
      selectedPeriodId: selectedPeriod?.id ?? null,
    };
  });

  return (
    <div className="px-3 py-3">
      {/* Hero */}
      <section className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-3xl bg-gradient-to-r from-[#e8edff] to-[#eef0ff] px-4 py-2.5">
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
                className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${
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
          {data.cards.map(({ child, attendanceRate, absences, retards, remaining, carnetUnread }) => (
            <Link
              key={child.id}
              href={`/${locale}/parent/children/${child.id}`}
              className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-indigo-100 text-sm font-semibold text-[#1A56DB]">
                    {(child.firstName[0] ?? '') + (child.lastName[0] ?? '')}
                  </span>
                  <div>
                    <div className="text-base font-semibold text-slate-900">
                      {child.firstName} {child.lastName}
                    </div>
                    {child.className && <div className="text-xs text-slate-400">{child.className}</div>}
                  </div>
                </div>
                <span className="flex items-center gap-2">
                  {carnetUnread > 0 && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      {t('carnetUnread', { count: carnetUnread })}
                    </span>
                  )}
                  <span className="text-[#1A56DB]">→</span>
                </span>
              </div>

              <div className="mt-4 flex items-center gap-4">
                <Donut
                  pct={attendanceRate ?? 0}
                  color={attendanceRate === null ? '#cbd5e1' : attendanceRate < 90 ? '#d97706' : '#059669'}
                  center={attendanceRate !== null ? `${attendanceRate.toFixed(0)}%` : '—'}
                  label={t('attendance')}
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
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-800">
                    {n.subject}
                    <span className="ms-1.5 text-xs font-normal text-slate-400">{n.label}</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {n.childName} · {new Date(n.date).toLocaleDateString(locale)}
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
            className="text-xs font-medium text-[#1A56DB] hover:underline"
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
                  <span className="text-[11px] text-slate-400">
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
