import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getParentChildren } from '@/lib/parent';
import { getClassLessonBook, getClassUpcomingHomeworks, toDateStr } from '@/lib/lesson-book';

const HW_BADGE: Record<string, string> = {
  EXERCICE: 'bg-blue-50 text-blue-700',
  LECTURE: 'bg-violet-50 text-violet-700',
  REVISION: 'bg-amber-50 text-amber-700',
  PROJET: 'bg-emerald-50 text-emerald-700',
  AUTRE: 'bg-slate-100 text-slate-600',
};

export default async function ParentCahierPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ child?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('parent.cahier');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const children = await getParentChildren(tx, session.user.id);
    const selected = children.find((c) => c.id === sp.child) ?? children[0] ?? null;
    if (!selected?.classId) return { children, selected, lessons: [], homeworks: [] };
    const [lessons, homeworks] = await Promise.all([
      getClassLessonBook(tx, selected.classId),
      getClassUpcomingHomeworks(tx, selected.classId),
    ]);
    return { children, selected, lessons, homeworks };
  });

  const base = `/${locale}/parent/cahier`;
  const fmtDate = (d: Date | string) =>
    new Date(typeof d === 'string' ? `${d}T00:00:00.000Z` : d).toLocaleDateString(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      </header>

      {data.children.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {data.children.map((c) => {
            const active = c.id === data.selected?.id;
            return (
              <Link
                key={c.id}
                href={`${base}?child=${c.id}`}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  active
                    ? 'bg-brand-600 text-white'
                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {c.firstName}
              </Link>
            );
          })}
        </div>
      )}

      {!data.selected?.classId ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          {t('noClass')}
        </p>
      ) : (
        <div className="space-y-8">
          {/* Devoirs à venir */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('upcomingHomework')}</h2>
            {data.homeworks.length === 0 ? (
              <p className="text-sm text-slate-400">{t('noHomework')}</p>
            ) : (
              <ul className="space-y-2">
                {data.homeworks.map((h) => (
                  <li
                    key={h.id}
                    className="rounded-xl border border-slate-200 bg-white p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-800">
                        {h.lessonEntry.entry.subject?.label ?? '—'}
                      </span>
                      <span className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${HW_BADGE[h.type]}`}
                        >
                          {t(`homeworkTypes.${h.type}`)}
                        </span>
                        {h.dueDate && (
                          <span className="text-brand-700 text-xs font-medium capitalize">
                            {t('due')} {fmtDate(h.dueDate)}
                          </span>
                        )}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-slate-600">{h.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Leçons récentes */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('recentLessons')}</h2>
            {data.lessons.length === 0 ? (
              <p className="text-sm text-slate-400">{t('noLesson')}</p>
            ) : (
              <ul className="space-y-3">
                {data.lessons.map((l) => (
                  <li key={l.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {l.entry.subject?.label ?? '—'} — {l.title}
                      </span>
                      <span className="text-xs capitalize text-slate-400">{fmtDate(l.date)}</span>
                    </div>
                    {l.summary && (
                      <p className="mt-1.5 whitespace-pre-line text-sm text-slate-600">
                        {l.summary}
                      </p>
                    )}
                    {l.homeworks.length > 0 && (
                      <div className="mt-2 border-t border-slate-100 pt-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                          {t('homework')}
                        </p>
                        <ul className="mt-1 space-y-1">
                          {l.homeworks.map((h) => (
                            <li key={h.id} className="text-sm text-slate-600">
                              • {h.description}
                              {h.dueDate && (
                                <span className="text-brand-700"> ({fmtDate(h.dueDate)})</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {l.resources.length > 0 && (
                      <div className="mt-2 border-t border-slate-100 pt-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                          {t('resources')}
                        </p>
                        <ul className="mt-1 flex flex-wrap gap-2">
                          {l.resources.map((r) => (
                            <li key={r.id}>
                              <a
                                href={
                                  r.kind === 'FILE'
                                    ? `/api/cahier/resource/${r.id}`
                                    : (r.url ?? '#')
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand-700 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs hover:bg-slate-100"
                              >
                                {r.kind === 'FILE' ? '📎' : '🔗'} {r.label}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
