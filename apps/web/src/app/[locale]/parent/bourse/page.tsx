import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getParentChildren } from '@/lib/parent';
import { AggregatedReserve } from './aggregated-reserve';

const COND: Record<string, string> = { NEW: 'condition.NEW', VERY_GOOD: 'condition.VERY_GOOD', GOOD: 'condition.GOOD', FAIR: 'condition.FAIR' };

/**
 * Bourse aux livres agrégée pour le parent : une seule page regroupant les
 * exemplaires disponibles + les dépôts / achats de tous ses enfants.
 */
export default async function ParentBourseAggregatedPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ levelId?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('parent.child.bourse');
  const tc = await getTranslations('admin.bourse');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const kids = await getParentChildren(tx, session.user.id);
    const childIds = kids.map((k) => k.id);
    if (childIds.length === 0) return { kids, levels: [], available: [], deposits: [], purchases: [], currency: 'MAD' };
    const [levels, available, deposits, purchases, tenant] = await Promise.all([
      tx.level.findMany({ orderBy: { order: 'asc' }, select: { id: true, code: true } }),
      tx.bookCopy.findMany({
        where: {
          campaign: { status: 'OPEN' },
          OR: [{ status: 'FOR_SALE' }, { status: 'RESERVED', buyerId: { in: childIds } }],
          ...(sp.levelId ? { book: { levelId: sp.levelId } } : {}),
        },
        include: { book: { select: { title: true, level: { select: { code: true } }, subject: { select: { label: true } } } } },
        orderBy: { code: 'asc' },
        take: 300,
      }),
      tx.bookCopy.findMany({ where: { sellerId: { in: childIds } }, include: { book: { select: { title: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }),
      tx.bookCopy.findMany({ where: { buyerId: { in: childIds }, status: { in: ['SOLD', 'REFUNDED'] } }, include: { book: { select: { title: true } } }, orderBy: { soldAt: 'desc' }, take: 100 }),
      tx.tenant.findFirst({ select: { currency: true } }),
    ]);
    return { kids, levels, available, deposits, purchases, currency: tenant?.currency ?? 'MAD' };
  });

  const { kids, levels, available, deposits, purchases, currency } = data;
  const kidList = kids.map((k) => ({ id: k.id, name: `${k.firstName} ${k.lastName}` }));
  const nameById = new Map(kidList.map((k) => [k.id, k.name]));

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-100 to-brand-50 shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('navTitle')}</h1>
      </header>

      {kidList.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">{t('noChild')}</p>
      ) : (
        <div className="space-y-6">
          {/* Disponibles */}
          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">{t('available')}</h2>
              <form>
                <select name="levelId" defaultValue={sp.levelId ?? ''} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
                  <option value="">{t('allLevels')}</option>
                  {levels.map((l) => <option key={l.id} value={l.id}>{l.code}</option>)}
                </select>
                <button className="ms-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">{t('filter')}</button>
              </form>
            </div>
            <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-[#A9EAFE] text-xs uppercase tracking-wide text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-start">{t('book')}</th>
                    <th className="px-3 py-2 text-start">{tc('level')}</th>
                    <th className="px-3 py-2 text-start">{t('state')}</th>
                    <th className="px-3 py-2 text-end">{tc('price')}</th>
                    <th className="px-3 py-2 text-end">{t('action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {available.map((c) => {
                    const reservedChildId = c.status === 'RESERVED' ? c.buyerId : null;
                    return (
                      <tr key={c.id} className={reservedChildId ? 'bg-amber-50/40' : ''}>
                        <td className="px-3 py-2 text-slate-800">{c.book.title}{c.book.subject && <span className="ms-1 text-xs text-slate-400">· {c.book.subject.label}</span>}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{c.book.level?.code ?? '—'}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{tc(COND[c.condition])}</td>
                        <td className="px-3 py-2 text-end tabular-nums font-medium text-slate-900">{c.askPrice.toFixed(2)} {currency}</td>
                        <td className="px-3 py-2"><AggregatedReserve copyId={c.id} kids={kidList} reservedChildId={reservedChildId} /></td>
                      </tr>
                    );
                  })}
                  {available.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">{t('noneAvailable')}</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">{t('reserveHint')}</p>
          </section>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Dépôts (tous enfants) */}
            <section>
              <h2 className="mb-2 text-base font-semibold text-slate-900">{t('myDeposits')}</h2>
              <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white text-sm">
                {deposits.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-slate-700"><span className="font-mono text-xs text-slate-400">{c.code}</span> · {c.book.title}<span className="ms-1 text-[11px] text-slate-400">— {nameById.get(c.sellerId ?? '') ?? ''}</span></span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{tc(`copyStatus.${c.status}`)}</span>
                  </li>
                ))}
                {deposits.length === 0 && <li className="px-3 py-6 text-center text-xs text-slate-400">{t('noDeposit')}</li>}
              </ul>
            </section>

            {/* Achats (tous enfants) */}
            <section>
              <h2 className="mb-2 text-base font-semibold text-slate-900">{t('myPurchases')}</h2>
              <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white text-sm">
                {purchases.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-slate-700"><span className="font-mono text-xs text-slate-400">{c.code}</span> · {c.book.title}<span className="ms-1 text-[11px] text-slate-400">— {nameById.get(c.buyerId ?? '') ?? ''}</span></span>
                    <span className="tabular-nums text-slate-500">{(c.salePrice ?? c.askPrice).toFixed(2)} {currency}</span>
                  </li>
                ))}
                {purchases.length === 0 && <li className="px-3 py-6 text-center text-xs text-slate-400">{t('noPurchase')}</li>}
              </ul>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
