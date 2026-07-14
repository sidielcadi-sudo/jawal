import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { activeDriver } from '@/lib/notify-providers';
import { ProcessQueueButton, RetryButton } from './notifications-client';

const STATUS_BADGE: Record<string, string> = {
  SENT: 'bg-emerald-100 text-emerald-700',
  PENDING: 'bg-amber-100 text-amber-700',
  SKIPPED: 'bg-slate-100 text-slate-500',
  FAILED: 'bg-red-100 text-red-700',
};

export default async function TransportNotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.transport');

  const { logs, pending } = await withTenant(session.user.tenantId, async (tx) => {
    const [logs, pending] = await Promise.all([
      tx.notificationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
      tx.notificationLog.count({ where: { status: { in: ['PENDING', 'FAILED'] } } }),
    ]);
    return { logs, pending };
  });
  const driver = activeDriver();

  return (
    <div className="mx-auto max-w-4xl px-3 py-3">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/transport`} className="hover:text-brand-700">🚍 {t('title')}</Link>
        <span className="mx-1.5">›</span>
        <span>{t('notifications.title')}</span>
      </nav>

      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="mb-1 text-base font-bold text-slate-900">{t('notifications.title')}</h1>
          <p className="text-xs text-slate-500">
            {driver === 'log' ? t('notifications.driverHint') : t('notifications.driverActive', { driver })}
          </p>
        </div>
        <ProcessQueueButton pending={pending} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-[#A9EAFE] text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-4 py-2.5 text-start">{t('notifications.when')}</th>
              <th className="px-4 py-2.5 text-start">{t('notifications.recipient')}</th>
              <th className="px-4 py-2.5 text-start">{t('notifications.message')}</th>
              <th className="px-4 py-2.5 text-center">{t('notifications.channel')}</th>
              <th className="px-4 py-2.5 text-center">{t('notifications.status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">
                  {new Date(l.createdAt).toLocaleString(locale)}
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-700">
                  {l.recipientName ?? '—'}
                  {l.recipient && <span className="block text-slate-400">{l.recipient}</span>}
                </td>
                <td className="px-4 py-2.5 text-slate-700">{l.body}</td>
                <td className="px-4 py-2.5 text-center text-xs text-slate-500">{l.channel}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE[l.status]}`} title={l.error ?? undefined}>
                    {t(`notifications.statusLabel.${l.status}`)}
                  </span>
                  {(l.status === 'FAILED' || l.status === 'PENDING') && (
                    <div className="mt-1"><RetryButton id={l.id} /></div>
                  )}
                  {l.status === 'FAILED' && l.error && <div className="mt-0.5 max-w-[160px] truncate text-[10px] text-red-500" title={l.error}>{l.error}</div>}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">{t('notifications.empty')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
