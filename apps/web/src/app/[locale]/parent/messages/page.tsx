import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { listConversationsForParticipant } from '@/lib/messaging';
import { NewConversationForm } from './client';

export default async function ParentMessagesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('parent.messages');

  const conversations = await withTenant(session.user.tenantId, (tx) =>
    listConversationsForParticipant(tx, session.user.id),
  );

  return (
    <div className="px-3 py-3">
      <section className="mb-4 overflow-hidden rounded-3xl bg-gradient-to-r from-brand-100 to-brand-50 px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <ul className="divide-y divide-slate-100">
              {conversations.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/${locale}/parent/messages/${c.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {c.flag && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" />}
                        <span className={`truncate ${c.flag ? 'font-semibold text-slate-900' : 'text-slate-800'}`}>
                          {c.subject}
                        </span>
                      </div>
                      {c.last && <p className="mt-0.5 truncate text-xs text-slate-500">{c.last.body}</p>}
                    </div>
                    <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
                      {new Date(c.updatedAt).toLocaleDateString(locale)}
                    </span>
                  </Link>
                </li>
              ))}
              {conversations.length === 0 && (
                <li className="px-5 py-10 text-center text-sm text-slate-500">{t('empty')}</li>
              )}
            </ul>
          </div>
        </section>

        <aside>
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">{t('newTitle')}</h2>
            <p className="mt-1 text-xs text-slate-500">{t('newHint')}</p>
            <div className="mt-4">
              <NewConversationForm locale={locale} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
