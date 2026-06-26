import { setRequestLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { loadParentChildContext } from '@/lib/parent';
import { getClassLessonBook, getClassUpcomingHomeworks } from '@/lib/lesson-book';
import { ChildTabs } from '../tabs';
import { SinceFilter } from '../since-filter';

const HW_BADGE: Record<string, string> = {
  EXERCICE: 'bg-blue-50 text-blue-700',
  LECTURE: 'bg-violet-50 text-violet-700',
  REVISION: 'bg-amber-50 text-amber-700',
  PROJET: 'bg-emerald-50 text-emerald-700',
  AUTRE: 'bg-slate-100 text-slate-600',
};

export default async function ParentChildCahierPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; childId: string }>;
  searchParams: Promise<{ tab?: string; since?: string }>;
}) {
  const { locale, childId } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('parent.child');
  const tab = sp.tab === 'travail' ? 'travail' : 'contenu';

  // Par défaut, on remonte à 1 mois avant aujourd'hui.
  const defaultSince = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const since = sp.since ?? defaultSince;

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const ctx = await loadParentChildContext(tx, session.user.id, childId);
    if (!ctx) return null;
    if (!ctx.classId) return { ctx, lessons: [], homeworks: [] };
    const lessons =
      tab === 'contenu' ? await getClassLessonBook(tx, ctx.classId, 30, since) : [];
    const homeworks =
      tab === 'travail' ? await getClassUpcomingHomeworks(tx, ctx.classId, since) : [];
    return { ctx, lessons, homeworks };
  });
  if (!data) notFound();

  const base = `/${locale}/parent/children/${childId}/cahier`;
  const q = `&since=${since}`;
  const fmt = (d: Date | string) =>
    new Date(typeof d === 'string' ? `${d}T00:00:00.000Z` : d).toLocaleDateString(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });

  return (
    <>
      <ChildTabs
        current={tab}
        tabs={[
          { key: 'contenu', label: t('cahier.tabContent'), href: `${base}?tab=contenu${q}` },
          { key: 'travail', label: t('cahier.tabHomework'), href: `${base}?tab=travail${q}` },
        ]}
      />

      <SinceFilter label={t('since')} value={since} basePath={base} tab={tab} />

      {!data.ctx.classId ? (
        <p className="mt-4 rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-500">
          {t('noClass')}
        </p>
      ) : tab === 'contenu' ? (
        <section className="mt-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          {data.lessons.length === 0 ? (
            <p className="text-sm text-slate-400">{t('cahier.noLesson')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.lessons.map((l) => (
                <li key={l.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {l.entry.subject?.label ?? '—'} — {l.title}
                    </span>
                    <span className="text-xs capitalize text-slate-400">{fmt(l.date)}</span>
                  </div>
                  {l.theme && (
                    <p className="mt-1 text-xs font-medium text-brand-700">
                      {t('cahier.theme')} : {l.theme}
                    </p>
                  )}
                  {l.summary && (
                    <p className="mt-1.5 whitespace-pre-line text-sm text-slate-600">{l.summary}</p>
                  )}
                  {l.resources.length > 0 && (
                    <div className="mt-2 border-t border-slate-100 pt-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                        {t('cahier.resources')}
                      </p>
                      <ul className="mt-1 flex flex-wrap gap-2">
                        {l.resources.map((r) => (
                          <li key={r.id}>
                            <a
                              href={r.kind === 'FILE' ? `/api/cahier/resource/${r.id}` : (r.url ?? '#')}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1 text-xs text-brand-700 hover:bg-slate-100"
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
      ) : (
        <section className="mt-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          {data.homeworks.length === 0 ? (
            <p className="text-sm text-slate-400">{t('cahier.noHomework')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.homeworks.map((h) => (
                <li key={h.id} className="py-3 text-sm first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-800">
                      {h.lessonEntry.entry.subject?.label ?? '—'}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${HW_BADGE[h.type]}`}>
                        {t(`cahier.homeworkTypes.${h.type}`)}
                      </span>
                      {h.dueDate && (
                        <span className="text-xs font-medium capitalize text-brand-700">
                          {t('cahier.due')} {fmt(h.dueDate)}
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
      )}
    </>
  );
}
