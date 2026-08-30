import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { SellButton } from '../sell-client';
import { personDisplayName } from '@/lib/localized-name';

const inputCls = 'rounded-lg border border-slate-300 px-3 py-2 text-sm';

export default async function VentePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ campaignId?: string; levelId?: string; q?: string; buyerId?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.bourse');
  const tv = await getTranslations('admin.bourse.vente');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const [campaigns, levels, students, tenant] = await Promise.all([
      tx.bookExchangeCampaign.findMany({ where: { status: 'OPEN' }, orderBy: [{ year: 'desc' }] }),
      tx.level.findMany({ orderBy: { order: 'asc' }, select: { id: true, code: true } }),
      tx.person.findMany({ where: { type: 'STUDENT', deletedAt: null }, orderBy: [{ lastName: 'asc' }], select: { id: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } }),
      tx.tenant.findFirst({ select: { currency: true } }),
    ]);
    const campaignId = sp.campaignId || campaigns[0]?.id || '';
    const q = (sp.q ?? '').trim();
    const copies = campaignId
      ? await tx.bookCopy.findMany({
          where: {
            campaignId,
            status: 'FOR_SALE',
            ...(sp.levelId ? { book: { levelId: sp.levelId } } : {}),
            ...(q ? { OR: [{ code: { contains: q, mode: 'insensitive' } }, { book: { title: { contains: q, mode: 'insensitive' } } }] } : {}),
          },
          include: { book: { select: { title: true, level: { select: { code: true } } } }, seller: { select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } } },
          orderBy: { code: 'asc' },
          take: 200,
        })
      : [];
    const recentSales = campaignId
      ? await tx.bookTransaction.findMany({
          where: { campaignId, type: 'SALE' },
          include: { copy: { select: { id: true, code: true, book: { select: { title: true } } } } },
          orderBy: { createdAt: 'desc' },
          take: 15,
        })
      : [];
    return { campaigns, levels, students, currency: tenant?.currency ?? 'MAD', campaignId, copies, recentSales };
  });

  const { campaigns, levels, students, currency, campaignId, copies, recentSales } = data;

  return (
    <div className="mx-auto max-w-4xl px-3 py-3">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/bourse`} className="hover:text-brand-700">📚 {t('title')}</Link>
        <span className="mx-1.5">›</span>
        <span>{tv('title')}</span>
      </nav>

      <h1 className="mb-3 text-base font-bold text-slate-900">{tv('title')}</h1>

      {/* Recherche */}
      <form className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        <label className="text-xs font-medium text-slate-600"><span className="mb-1 block">{t('campaigns')}</span>
          <select name="campaignId" defaultValue={campaignId} className={inputCls}>
            {campaigns.length === 0 && <option value="">—</option>}
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.label} {c.year}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600"><span className="mb-1 block">{t('level')}</span>
          <select name="levelId" defaultValue={sp.levelId ?? ''} className={inputCls}>
            <option value="">{tv('allLevels')}</option>
            {levels.map((l) => <option key={l.id} value={l.id}>{l.code}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600"><span className="mb-1 block">{tv('search')}</span>
          <input name="q" defaultValue={sp.q ?? ''} placeholder={tv('searchHint')} className={inputCls} />
        </label>
        <label className="text-xs font-medium text-slate-600"><span className="mb-1 block">{tv('buyer')}</span>
          <select name="buyerId" defaultValue={sp.buyerId ?? ''} className={inputCls}>
            <option value="">{tv('anonymous')}</option>
            {students.map((s) => <option key={s.id} value={s.id}>{personDisplayName(locale, s)}</option>)}
          </select>
        </label>
        <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">{tv('searchBtn')}</button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-3 py-2 text-start">{t('depot.code')}</th>
              <th className="px-3 py-2 text-start">{t('bookTitle')}</th>
              <th className="px-3 py-2 text-start">{t('level')}</th>
              <th className="px-3 py-2 text-start">{t('depot.state')}</th>
              <th className="px-3 py-2 text-end">{t('price')}</th>
              <th className="px-3 py-2 text-end">{tv('action')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {copies.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2 font-mono text-xs text-slate-700">{c.code}</td>
                <td className="px-3 py-2 text-slate-800">{c.book.title}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{c.book.level?.code ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{t(`condition.${c.condition}`)}</td>
                <td className="px-3 py-2 text-end tabular-nums font-medium text-slate-900">{c.askPrice.toFixed(2)} {currency}</td>
                <td className="px-3 py-2"><SellButton copyId={c.id} buyerId={sp.buyerId || undefined} /></td>
              </tr>
            ))}
            {copies.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">{tv('empty')}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Ventes récentes (reçus) */}
      {recentSales.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">{tv('recent')}</h2>
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white text-sm">
            {recentSales.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-3 py-2">
                <span className="text-slate-700">
                  <span className="font-mono text-xs text-slate-500">{s.copy.code}</span> · {s.copy.book.title}
                  <span className="ms-2 tabular-nums text-slate-500">{s.amount.toFixed(2)} {currency}</span>
                </span>
                <a href={`/api/admin/bourse/copy/${s.copy.id}/receipt.pdf`} target="_blank" className="text-xs font-medium text-brand-600 hover:underline">{tv('receipt')}</a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
