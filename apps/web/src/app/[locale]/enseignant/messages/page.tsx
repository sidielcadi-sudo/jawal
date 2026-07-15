import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { listConversationsForParticipant } from '@/lib/messaging';

export default async function TeacherMessagesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('enseignant.messages');

  const conversations = await withTenant(session.user.tenantId, (tx) =>
    listConversationsForParticipant(tx, session.user.id),
  );

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-0.5 text-xs text-slate-600">{t('hint')}</p>
      </header>

      <div className="mt-6 overflow-hidden rounded-2xl border border-brand-200 bg-white">
        <ul className="divide-y divide-slate-100">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/${locale}/enseignant/messages/${c.id}`}
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
    </div>
  );
}
