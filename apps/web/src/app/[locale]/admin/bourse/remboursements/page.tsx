import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { RefundControl, WithdrawForm } from '../refund-client';

const inputCls = 'rounded-lg border border-slate-300 px-3 py-2 text-sm';

export default async function RemboursementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ campaignId?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.bourse');
  const tr = await getTranslations('admin.bourse.refund');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const campaigns = await tx.bookExchangeCampaign.findMany({ orderBy: [{ year: 'desc' }] });
    const campaignId = sp.campaignId || campaigns[0]?.id || '';
    const tenant = await tx.tenant.findFirst({ select: { currency: true } });
    if (!campaignId) return { campaigns, campaignId, currency: tenant?.currency ?? 'MAD', toRefund: [], refunded: [], unsoldCount: 0, instBySeller: new Map() };

    const [sold, refundedCopies, unsoldCount] = await Promise.all([
      tx.bookCopy.findMany({ where: { campaignId, status: 'SOLD', sellerId: { not: null } }, select: { sellerId: true, salePrice: true, commission: true, seller: { select: { firstName: true, lastName: true } } } }),
      tx.bookCopy.findMany({ where: { campaignId, status: 'REFUNDED', sellerId: { not: null } }, select: { sellerId: true, seller: { select: { firstName: true, lastName: true } } } }),
      tx.bookCopy.count({ where: { campaignId, status: 'FOR_SALE' } }),
    ]);

    const map = new Map<string, { name: string; count: number; total: number }>();
    for (const c of sold) {
      const cur = map.get(c.sellerId!) ?? { name: `${c.seller!.lastName} ${c.seller!.firstName}`, count: 0, total: 0 };
      cur.count++;
      cur.total += (c.salePrice ?? 0) - (c.commission ?? 0);
      map.set(c.sellerId!, cur);
    }
    const toRefund = [...map.entries()].map(([sellerId, v]) => ({ sellerId, ...v, total: Math.round(v.total * 100) / 100 }));

    const refundedMap = new Map<string, string>();
    for (const c of refundedCopies) refundedMap.set(c.sellerId!, `${c.seller!.lastName} ${c.seller!.firstName}`);
    const refunded = [...refundedMap.entries()].map(([sellerId, name]) => ({ sellerId, name }));

    // Échéances à venir des vendeurs (pour l'avoir).
    const sellerIds = toRefund.map((r) => r.sellerId);
    const now = new Date();
    const installments = sellerIds.length
      ? await tx.installment.findMany({ where: { studentId: { in: sellerIds }, status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { gte: now } }, select: { id: true, studentId: true, label: true, dueDate: true }, orderBy: { dueDate: 'asc' } })
      : [];
    const instBySeller = new Map<string, { id: string; label: string }[]>();
    for (const i of installments) {
      const arr = instBySeller.get(i.studentId) ?? [];
      arr.push({ id: i.id, label: `${i.label} (${new Date(i.dueDate).toLocaleDateString(locale)})` });
      instBySeller.set(i.studentId, arr);
    }
    return { campaigns, campaignId, currency: tenant?.currency ?? 'MAD', toRefund, refunded, unsoldCount, instBySeller };
  });

  const { campaigns, campaignId, currency, toRefund, refunded, unsoldCount, instBySeller } = data;

  return (
    <div className="mx-auto max-w-4xl px-3 py-3">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/bourse`} className="hover:text-brand-700">📚 {t('title')}</Link>
        <span className="mx-1.5">›</span>
        <span>{tr('title')}</span>
      </nav>

      <form className="mb-4 flex items-end gap-2">
        <label className="text-xs font-medium text-slate-600"><span className="mb-1 block">{t('campaigns')}</span>
          <select name="campaignId" defaultValue={campaignId} className={inputCls}>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.label} {c.year}</option>)}
          </select>
        </label>
        <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">{tr('load')}</button>
      </form>

      {/* Remboursements vendeurs */}
      <h2 className="mb-2 text-base font-semibold text-slate-900">{tr('sellersTitle')}</h2>
      <div className="mb-6 overflow-hidden rounded-2xl border border-brand-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-[#A9EAFE] text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-3 py-2 text-start">{tr('seller')}</th>
              <th className="px-3 py-2 text-end">{tr('sold')}</th>
              <th className="px-3 py-2 text-end">{tr('due')}</th>
              <th className="px-3 py-2 text-end">{tr('action')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {toRefund.map((r) => (
              <tr key={r.sellerId}>
                <td className="px-3 py-2 font-medium text-slate-800">{r.name}</td>
                <td className="px-3 py-2 text-end tabular-nums text-slate-600">{r.count}</td>
                <td className="px-3 py-2 text-end tabular-nums font-semibold text-slate-900">{r.total.toFixed(2)} {currency}</td>
                <td className="px-3 py-2"><RefundControl sellerId={r.sellerId} campaignId={campaignId} installments={instBySeller.get(r.sellerId) ?? []} /></td>
              </tr>
            ))}
            {toRefund.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">{tr('noneToRefund')}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Retrait des invendus */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-900">{tr('withdrawTitle')}</h2>
          <p className="mb-3 text-xs text-slate-500">{tr('unsold', { n: unsoldCount })}</p>
          {campaignId && <WithdrawForm campaignId={campaignId} />}
        </section>

        {/* Déjà remboursés (reçus) */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">{tr('refundedTitle')}</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {refunded.map((r) => (
              <li key={r.sellerId} className="flex items-center justify-between py-1.5">
                <span className="text-slate-700">{r.name}</span>
                <a href={`/api/admin/bourse/seller/${r.sellerId}/refund.pdf?campaign=${campaignId}`} target="_blank" className="text-xs font-medium text-brand-600 hover:underline">{tr('receipt')}</a>
              </li>
            ))}
            {refunded.length === 0 && <li className="py-3 text-center text-xs text-slate-400">—</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
