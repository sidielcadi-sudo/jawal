import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import {
  getTeacherWeekSessions,
  getUnfilledSessionsForTeacher,
  mondayOf,
  type TeacherSession,
  type UnfilledSession,
} from '@/lib/lesson-book';
import { CahierFrame } from './cahier-frame';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function TeacherCahierPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('enseignant.cahier');

  const monday = mondayOf(sp.week && ISO_DATE.test(sp.week) ? sp.week : undefined);

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, session.user.id);
    if (!teacherId)
      return { days: [], sessions: [] as TeacherSession[], unfilled: [] as UnfilledSession[] };
    const [week, unfilled] = await Promise.all([
      getTeacherWeekSessions(tx, teacherId, monday),
      getUnfilledSessionsForTeacher(tx, teacherId, 14),
    ]);
    return { ...week, unfilled };
  });

  const base = `/${locale}/enseignant/cahier`;
  const fmtDay = (iso: string) =>
    new Date(`${iso}T00:00:00.000Z`).toLocaleDateString(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });

  const banner =
    data.unfilled.length > 0 ? (
      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-medium text-amber-800">
          ⚠️ {t('reminder.title', { count: data.unfilled.length })}
        </p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {data.unfilled.slice(0, 6).map((s) => (
            <li key={`${s.entryId}-${s.date}`}>
              <Link
                href={`${base}/${s.entryId}/${s.date}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs text-amber-800 hover:bg-amber-100"
              >
                <span className="font-medium">{s.subject ?? '—'}</span>
                <span className="text-amber-600">
                  {s.className} · {fmtDay(s.date)}
                </span>
              </Link>
            </li>
          ))}
          {data.unfilled.length > 6 && (
            <li className="self-center text-xs text-amber-700">
              {t('reminder.more', { count: data.unfilled.length - 6 })}
            </li>
          )}
        </ul>
      </div>
    ) : null;

  return (
    <CahierFrame locale={locale} monday={monday} days={data.days} sessions={data.sessions} banner={banner}>
      <div className="flex h-full min-h-[18rem] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center">
        <p className="text-sm text-slate-500">{t('selectSession')}</p>
      </div>
    </CahierFrame>
  );
}
