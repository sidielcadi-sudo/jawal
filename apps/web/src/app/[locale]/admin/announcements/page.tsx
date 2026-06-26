import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { AnnouncementCreateForm, AnnouncementRowActions } from './client';

export default async function AnnouncementsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.announcements');

  const session = (await auth())!;
  const { announcements, classes, levels } = await withTenant(session.user.tenantId, async (tx) => {
    const [announcements, classes, levels] = await Promise.all([
      tx.announcement.findMany({
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        take: 50,
      }),
      tx.class.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      tx.level.findMany({
        select: { id: true, label: true },
        orderBy: { order: 'asc' },
      }),
    ]);
    return { announcements, classes, levels };
  });

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-3xl bg-gradient-to-r from-[#e8edff] to-[#eef0ff] px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-600">{t('count', { count: announcements.length })}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="space-y-3">
            {announcements.map((a) => (
              <article
                key={a.id}
                className={`rounded-2xl border bg-white p-5 ${a.publishedAt ? 'border-slate-200' : 'border-amber-200 bg-amber-50/30'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold text-slate-900">{a.title}</h2>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                      <AudienceBadge audience={a.audience} />
                      {a.publishedAt ? (
                        <span className="text-emerald-700">
                          {t('publishedAt', { date: new Date(a.publishedAt).toLocaleString(locale) })}
                        </span>
                      ) : (
                        <span className="text-amber-700">{t('draft')}</span>
                      )}
                    </div>
                  </div>
                  <AnnouncementRowActions
                    id={a.id}
                    isPublished={!!a.publishedAt}
                  />
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{a.body}</p>
              </article>
            ))}
            {announcements.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
                {t('empty')}
              </div>
            )}
          </div>
        </section>

        <aside>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">{t('create')}</h2>
            <p className="mt-1 text-xs text-slate-500">{t('createHint')}</p>
            <div className="mt-4">
              <AnnouncementCreateForm classes={classes} levels={levels} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function AudienceBadge({ audience }: { audience: string }) {
  const styles: Record<string, string> = {
    ALL: 'bg-purple-100 text-purple-700',
    PARENTS: 'bg-emerald-100 text-emerald-700',
    TEACHERS: 'bg-blue-100 text-blue-700',
    STAFF: 'bg-amber-100 text-amber-700',
    CLASS: 'bg-slate-200 text-slate-700',
    LEVEL: 'bg-slate-200 text-slate-700',
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${styles[audience] ?? 'bg-slate-100'}`}>
      {audience}
    </span>
  );
}
