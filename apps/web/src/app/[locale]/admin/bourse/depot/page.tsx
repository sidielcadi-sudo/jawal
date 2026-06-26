import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { DeleteButton } from '../bourse-client';
import { AddCopyForm } from '../deposit-client';
import { removeCopyAction } from '../deposit-actions';

const inputCls = 'rounded-lg border border-slate-300 px-3 py-2 text-sm';
const STATUS_BADGE: Record<string, string> = {
  FOR_SALE: 'bg-emerald-100 text-emerald-700',
  RESERVED: 'bg-amber-100 text-amber-700',
  SOLD: 'bg-sky-100 text-sky-700',
  WITHDRAWN: 'bg-slate-100 text-slate-500',
  REFUNDED: 'bg-indigo-100 text-indigo-700',
};

export default async function DepotPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ campaignId?: string; sellerId?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.bourse');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const [campaigns, students, books, config, tenant] = await Promise.all([
      tx.bookExchangeCampaign.findMany({ where: { status: 'OPEN' }, orderBy: [{ year: 'desc' }] }),
      tx.person.findMany({ where: { type: 'STUDENT', deletedAt: null }, orderBy: [{ lastName: 'asc' }], select: { id: true, firstName: true, lastName: true } }),
      tx.book.findMany({ orderBy: { title: 'asc' }, select: { id: true, title: true, priceNew: true, priceBourseDefault: true }, take: 500 }),
      tx.bookExchangeConfig.findFirst({ select: { pricingByCondition: true } }),
      tx.tenant.findFirst({ select: { currency: true } }),
    ]);
    const campaignId = sp.campaignId || campaigns[0]?.id || '';
    const sellerId = sp.sellerId || '';
    const copies = campaignId && sellerId
      ? await tx.bookCopy.findMany({ where: { campaignId, sellerId }, include: { book: { select: { title: true } } }, orderBy: { code: 'asc' } })
      : [];
    return { campaigns, students, books, config, currency: tenant?.currency ?? 'MAD', campaignId, sellerId, copies };
  });

  const { campaigns, students, books, config, currency, campaignId, sellerId, copies } = data;
  const factors = (config?.pricingByCondition as Record<string, number>) ?? {};
  const total = copies.reduce((s, c) => s + c.askPrice, 0);

  return (
    <div className="mx-auto max-w-4xl px-3 py-3">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/bourse`} className="hover:text-brand-700">📚 {t('title')}</Link>
        <span className="mx-1.5">›</span>
        <span>{t('depot.title')}</span>
      </nav>

      <h1 className="mb-3 text-base font-bold text-slate-900">{t('depot.title')}</h1>

      {/* Sélecteurs */}
      <form className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        <label className="text-xs font-medium text-slate-600"><span className="mb-1 block">{t('campaigns')}</span>
          <select name="campaignId" defaultValue={campaignId} className={inputCls}>
            {campaigns.length === 0 && <option value="">—</option>}
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.label} {c.year}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600"><span className="mb-1 block">{t('depot.seller')}</span>
          <select name="sellerId" defaultValue={sellerId} className={inputCls}>
            <option value="">—</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.lastName} {s.firstName}</option>)}
          </select>
        </label>
        <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">{t('depot.load')}</button>
      </form>

      {campaignId && sellerId ? (
        <>
          <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">{t('depot.addTitle')}</h2>
            <AddCopyForm campaignId={campaignId} sellerId={sellerId} books={books} factors={factors} />
          </section>

          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">{t('depot.copies')} ({copies.length})</h2>
            {copies.length > 0 && (
              <a href={`/api/admin/bourse/seller/${sellerId}/receipt.pdf?campaign=${campaignId}`} target="_blank" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">{t('depot.receipt')}</a>
            )}
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-start">{t('depot.code')}</th>
                  <th className="px-3 py-2 text-start">{t('bookTitle')}</th>
                  <th className="px-3 py-2 text-start">{t('depot.state')}</th>
                  <th className="px-3 py-2 text-end">{t('price')}</th>
                  <th className="px-3 py-2 text-center">{t('depot.statusCol')}</th>
                  <th className="px-3 py-2 text-center">{t('depot.label')}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {copies.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2 font-mono text-xs text-slate-700">{c.code}</td>
                    <td className="px-3 py-2 text-slate-800">{c.book.title}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{t(`condition.${c.condition}`)}</td>
                    <td className="px-3 py-2 text-end tabular-nums text-slate-700">{c.askPrice.toFixed(2)} {currency}</td>
                    <td className="px-3 py-2 text-center"><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE[c.status]}`}>{t(`copyStatus.${c.status}`)}</span></td>
                    <td className="px-3 py-2 text-center"><a href={`/api/admin/bourse/copy/${c.id}/label.pdf`} target="_blank" className="text-xs text-brand-600 hover:underline">🏷️</a></td>
                    <td className="px-3 py-2 text-end">{c.status === 'FOR_SALE' && <DeleteButton onDelete={removeCopyAction.bind(null, c.id)} confirmText={t('depot.removeConfirm')} />}</td>
                  </tr>
                ))}
                {copies.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">{t('depot.empty')}</td></tr>}
              </tbody>
              {copies.length > 0 && (
                <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                  <tr><td className="px-3 py-2" colSpan={3}>{t('depot.total')}</td><td className="px-3 py-2 text-end tabular-nums">{total.toFixed(2)} {currency}</td><td colSpan={3} /></tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{t('depot.pick')}</p>
      )}
    </div>
  );
}
