import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { BourseExportButton } from '../bourse-export';
import { BourseNav } from '../bourse-nav';

const inputCls = 'rounded-lg border border-slate-300 px-3 py-2 text-sm';
const METHOD: Record<string, string> = { CASH: 'Espèces', CHEQUE: 'Chèque', TRANSFER: 'Virement', CMI: 'Carte', CREDIT: 'Avoir' };

export default async function BourseFinancePage({
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
  const tf = await getTranslations('admin.bourse.finance');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const campaigns = await tx.bookExchangeCampaign.findMany({ orderBy: [{ year: 'desc' }] });
    const campaignId = sp.campaignId || campaigns[0]?.id || '';
    const tenant = await tx.tenant.findFirst({ select: { currency: true } });
    if (!campaignId) return { campaigns, campaignId, currency: tenant?.currency ?? 'MAD', copies: [], txns: [] };
    const [copies, txns] = await Promise.all([
      tx.bookCopy.findMany({ where: { campaignId }, select: { status: true, salePrice: true, commission: true, bookId: true, book: { select: { title: true } } } }),
      tx.bookTransaction.findMany({ where: { campaignId }, include: { copy: { select: { code: true, book: { select: { title: true } } } } }, orderBy: { createdAt: 'desc' }, take: 1000 }),
    ]);
    return { campaigns, campaignId, currency: tenant?.currency ?? 'MAD', copies, txns };
  });

  const { campaigns, campaignId, currency, copies, txns } = data;
  const fmt = (n: number) => Math.round(n).toLocaleString(locale);

  const deposited = copies.length;
  const soldCount = copies.filter((c) => c.status === 'SOLD' || c.status === 'REFUNDED').length;
  const sellRate = deposited ? Math.round((soldCount / deposited) * 100) : 0;
  const montantVendu = txns.filter((x) => x.type === 'SALE').reduce((s, x) => s + x.amount, 0);
  const rembourse = txns.filter((x) => x.type === 'REFUND').reduce((s, x) => s + x.amount, 0);
  const rembourseCash = txns.filter((x) => x.type === 'REFUND' && x.method === 'CASH').reduce((s, x) => s + x.amount, 0);
  const avoirs = txns.filter((x) => x.type === 'REFUND' && x.method === 'CREDIT').reduce((s, x) => s + x.amount, 0);
  const commission = copies.filter((c) => c.status === 'SOLD' || c.status === 'REFUNDED').reduce((s, c) => s + (c.commission ?? 0), 0);
  const soldeCaisse = montantVendu - rembourseCash;

  // Top / flop titres.
  const byBook = new Map<string, { title: string; sold: number; total: number }>();
  for (const c of copies) {
    const cur = byBook.get(c.bookId) ?? { title: c.book.title, sold: 0, total: 0 };
    cur.total++;
    if (c.status === 'SOLD' || c.status === 'REFUNDED') cur.sold++;
    byBook.set(c.bookId, cur);
  }
  const ranked = [...byBook.values()];
  const top = [...ranked].sort((a, b) => b.sold - a.sold).slice(0, 8);
  const flop = [...ranked].filter((b) => b.sold === 0 && b.total > 0).slice(0, 8);

  const csvRows = txns.map((x) => [new Date(x.createdAt).toISOString().slice(0, 10), x.type, x.copy.code, x.copy.book.title, x.amount.toFixed(2), x.method ? METHOD[x.method] ?? x.method : '']);

  return (
    <div className="px-3 py-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <nav className="text-xs text-slate-500">
          <Link href={`/${locale}/admin/bourse`} className="hover:text-brand-700">📚 {t('title')}</Link>
          <span className="mx-1.5">›</span>
          <span>{tf('title')}</span>
        </nav>
        <BourseNav locale={locale} />
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <form className="flex items-end gap-2">
          <label className="text-xs font-medium text-slate-600"><span className="mb-1 block">{t('campaigns')}</span>
            <select name="campaignId" defaultValue={campaignId} className={inputCls}>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.label} {c.year}</option>)}
            </select>
          </label>
          <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">{tf('load')}</button>
        </form>
        <BourseExportButton rows={csvRows} filename={`bourse-journal-${campaignId.slice(0, 8)}`} />
      </div>

      {/* KPI */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label={tf('deposited')} value={String(deposited)} />
        <Kpi label={tf('sold')} value={String(soldCount)} />
        <Kpi label={tf('sellRate')} value={`${sellRate}%`} tone="emerald" />
        <Kpi label={tf('totalSold')} value={fmt(montantVendu)} />
        <Kpi label={tf('refunded')} value={fmt(rembourse)} />
        <Kpi label={tf('commission')} value={fmt(commission)} tone="brand" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Journal de caisse */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-1">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">{tf('cashTitle')}</h2>
          <dl className="space-y-1.5 text-sm">
            <Line label={tf('inflow')} value={`${fmt(montantVendu)} ${currency}`} />
            <Line label={tf('outflowCash')} value={`−${fmt(rembourseCash)} ${currency}`} />
            <Line label={tf('credits')} value={`${fmt(avoirs)} ${currency}`} muted />
            <div className="mt-1 border-t border-slate-200 pt-1.5">
              <Line label={tf('balance')} value={`${fmt(soldeCaisse)} ${currency}`} strong />
            </div>
            <Line label={tf('commission')} value={`${fmt(commission)} ${currency}`} muted />
          </dl>
        </section>

        {/* Top titres */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">{tf('topTitle')}</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {top.map((b) => (
              <li key={b.title} className="flex items-center justify-between py-1.5">
                <span className="min-w-0 flex-1 truncate text-slate-700">{b.title}</span>
                <span className="tabular-nums text-emerald-700">{b.sold}/{b.total}</span>
              </li>
            ))}
            {top.length === 0 && <li className="py-3 text-center text-xs text-slate-400">—</li>}
          </ul>
        </section>

        {/* Flop titres */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">{tf('flopTitle')}</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {flop.map((b) => (
              <li key={b.title} className="flex items-center justify-between py-1.5">
                <span className="min-w-0 flex-1 truncate text-slate-700">{b.title}</span>
                <span className="tabular-nums text-slate-400">0/{b.total}</span>
              </li>
            ))}
            {flop.length === 0 && <li className="py-3 text-center text-xs text-slate-400">{tf('noFlop')}</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const c = tone === 'emerald' ? 'text-emerald-700' : tone === 'brand' ? 'text-brand-700' : 'text-slate-800';
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className={`text-xl font-bold tabular-nums ${c}`}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}
function Line({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className={muted ? 'text-slate-400' : 'text-slate-500'}>{label}</dt>
      <dd className={`tabular-nums ${strong ? 'font-bold text-slate-900' : muted ? 'text-slate-400' : 'text-slate-700'}`}>{value}</dd>
    </div>
  );
}
