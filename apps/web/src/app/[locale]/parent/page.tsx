import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { tallyAttendance } from '@/lib/attendance-category';
import { countUnreadCarnet } from '@/lib/carnet';
import { getParentChildren, getParentAnnouncements } from '@/lib/parent';

export default async function ParentHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const tenantId = session.user.tenantId;
  const t = await getTranslations('parent.home');

  const data = await withTenant(tenantId, async (tx) => {
    const children = await getParentChildren(tx, session.user.id);
    const activeYear = await tx.academicYear.findFirst({ where: { active: true } });

    const cards = await Promise.all(
      children.map(async (child) => {
        let attendanceRate: number | null = null;
        let absences = 0;
        if (activeYear) {
          const att = await tx.attendanceRecord.findMany({
            where: {
              studentId: child.id,
              session: {
                finalizedAt: { not: null },
                date: { gte: activeYear.startDate, lte: activeYear.endDate },
              },
            },
            select: { status: true, infirmary: true, punishment: true, exclusion: true },
          });
          if (att.length > 0) {
            const t = tallyAttendance(att);
            attendanceRate = t.rate;
            absences = t.counts.ABSENT + t.counts.EXCLUSION;
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

        return { child, attendanceRate, absences, remaining: Math.max(0, due - paid), carnetUnread };
      }),
    );

    const announcements = await getParentAnnouncements(tx, children, 4);
    return { cards, announcements };
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
      <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>

      {data.cards.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {t('noChild')}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {data.cards.map(({ child, attendanceRate, absences, remaining, carnetUnread }) => (
            <Link
              key={child.id}
              href={`/${locale}/parent/children/${child.id}`}
              className="rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-brand-300 hover:bg-brand-50/30"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-lg font-semibold text-slate-900">
                    {child.firstName} {child.lastName}
                  </div>
                  {child.className && (
                    <div className="text-xs text-slate-500">{child.className}</div>
                  )}
                </div>
                <span className="flex items-center gap-2">
                  {carnetUnread > 0 && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      {t('carnetUnread', { count: carnetUnread })}
                    </span>
                  )}
                  <span className="text-brand-600">→</span>
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <Stat
                  value={attendanceRate !== null ? `${attendanceRate.toFixed(0)}%` : '—'}
                  label={t('attendance')}
                  tone={attendanceRate !== null && attendanceRate < 90 ? 'red' : 'emerald'}
                />
                <Stat
                  value={String(absences)}
                  label={t('absences')}
                  tone={absences > 0 ? 'red' : 'slate'}
                />
                <Stat
                  value={remaining > 0 ? remaining.toLocaleString(locale) : '✓'}
                  label={remaining > 0 ? t('remaining') : t('upToDate')}
                  tone={remaining > 0 ? 'amber' : 'emerald'}
                />
              </div>
            </Link>
          ))}
        </div>
      )}

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">{t('latestAnnouncements')}</h2>
          <Link
            href={`/${locale}/parent/announcements`}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            {t('seeAll')} →
          </Link>
        </div>
        {data.announcements.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">{t('noAnnouncement')}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.announcements.map((a) => (
              <li key={a.id} className="rounded-xl border border-slate-200 bg-white p-4">
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
    <div className="rounded-lg border border-slate-100 px-2 py-2">
      <div className={`text-base font-semibold tabular-nums ${colors[tone]}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
