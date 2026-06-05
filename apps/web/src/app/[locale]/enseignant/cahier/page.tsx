import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import {
  getTeacherWeekSessions,
  getUnfilledSessionsForTeacher,
  mondayOf,
  addDays,
  type TeacherSession,
  type UnfilledSession,
} from '@/lib/lesson-book';

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

  const byDay = new Map<string, TeacherSession[]>();
  for (const s of data.sessions) {
    const arr = byDay.get(s.date) ?? [];
    arr.push(s);
    byDay.set(s.date, arr);
  }

  const base = `/${locale}/enseignant/cahier`;
  const prevWeek = addDays(monday, -7);
  const nextWeek = addDays(monday, 7);
  const fmtDay = (iso: string) =>
    new Date(`${iso}T00:00:00.000Z`).toLocaleDateString(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            href={`${base}?week=${prevWeek}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            ‹ {t('prevWeek')}
          </Link>
          <Link
            href={base}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            {t('thisWeek')}
          </Link>
          <Link
            href={`${base}?week=${nextWeek}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            {t('nextWeek')} ›
          </Link>
        </div>
      </header>

      {data.unfilled.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
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
      )}

      {data.sessions.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          {t('emptyWeek')}
        </p>
      ) : (
        <div className="space-y-6">
          {data.days.map((day) => {
            const sessions = byDay.get(day.date) ?? [];
            if (sessions.length === 0) return null;
            return (
              <section key={day.date}>
                <h2 className="mb-2 text-sm font-semibold capitalize text-slate-700">
                  {fmtDay(day.date)}
                </h2>
                <ul className="space-y-2">
                  {sessions.map((s) => (
                    <li key={`${s.entryId}-${s.date}`}>
                      <Link
                        href={`${base}/${s.entryId}/${s.date}`}
                        className="hover:border-brand-300 hover:bg-brand-50/40 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-colors"
                      >
                        <span className="w-24 shrink-0 text-xs tabular-nums text-slate-500">
                          {s.slotStart}–{s.slotEnd}
                        </span>
                        <span className="flex-1">
                          <span className="block text-sm font-medium text-slate-900">
                            {s.subject ?? '—'}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {s.className}
                            {s.room ? ` · ${s.room}` : ''}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            s.filled
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {s.filled ? t('filled') : t('toFill')}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
