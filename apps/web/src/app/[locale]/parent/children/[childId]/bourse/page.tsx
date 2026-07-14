import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { parentCanAccessChild } from '@/lib/parent';
import { ReserveButton } from './reserve-button';

const COND: Record<string, string> = { NEW: 'condition.NEW', VERY_GOOD: 'condition.VERY_GOOD', GOOD: 'condition.GOOD', FAIR: 'condition.FAIR' };

export default async function ParentBoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; childId: string }>;
  searchParams: Promise<{ levelId?: string }>;
}) {
  const { locale, childId } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('parent.child.bourse');
  const tc = await getTranslations('admin.bourse');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    if (!(await parentCanAccessChild(tx, session.user.id, childId))) return null;
    const [levels, available, myDeposits, myPurchases, tenant] = await Promise.all([
      tx.level.findMany({ orderBy: { order: 'asc' }, select: { id: true, code: true } }),
      tx.bookCopy.findMany({
        where: {
          campaign: { status: 'OPEN' },
          OR: [{ status: 'FOR_SALE' }, { status: 'RESERVED', buyerId: childId }],
          ...(sp.levelId ? { book: { levelId: sp.levelId } } : {}),
        },
        include: { book: { select: { title: true, level: { select: { code: true } }, subject: { select: { label: true } } } } },
        orderBy: { code: 'asc' },
        take: 300,
      }),
      tx.bookCopy.findMany({ where: { sellerId: childId }, include: { book: { select: { title: true } } }, orderBy: { createdAt: 'desc' }, take: 50 }),
      tx.bookCopy.findMany({ where: { buyerId: childId, status: { in: ['SOLD', 'REFUNDED'] } }, include: { book: { select: { title: true } } }, orderBy: { soldAt: 'desc' }, take: 50 }),
      tx.tenant.findFirst({ select: { currency: true } }),
    ]);
    return { levels, available, myDeposits, myPurchases, currency: tenant?.currency ?? 'MAD' };
  });
  if (!data) notFound();
  const { levels, available, myDeposits, myPurchases, currency } = data;

  return (
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
                const mine = c.status === 'RESERVED' && c.buyerId === childId;
                return (
                  <tr key={c.id} className={mine ? 'bg-amber-50/40' : ''}>
                    <td className="px-3 py-2 text-slate-800">{c.book.title}{c.book.subject && <span className="ms-1 text-xs text-slate-400">· {c.book.subject.label}</span>}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{c.book.level?.code ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{tc(COND[c.condition])}{mine && <span className="ms-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">{t('reservedByYou')}</span>}</td>
                    <td className="px-3 py-2 text-end tabular-nums font-medium text-slate-900">{c.askPrice.toFixed(2)} {currency}</td>
                    <td className="px-3 py-2"><div className="flex justify-end"><ReserveButton copyId={c.id} childId={childId} reserved={mine} /></div></td>
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
        {/* Mes dépôts */}
        <section>
          <h2 className="mb-2 text-base font-semibold text-slate-900">{t('myDeposits')}</h2>
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white text-sm">
            {myDeposits.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-slate-700"><span className="font-mono text-xs text-slate-400">{c.code}</span> · {c.book.title}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{tc(`copyStatus.${c.status}`)}</span>
              </li>
            ))}
            {myDeposits.length === 0 && <li className="px-3 py-6 text-center text-xs text-slate-400">{t('noDeposit')}</li>}
          </ul>
        </section>

        {/* Mes achats */}
        <section>
          <h2 className="mb-2 text-base font-semibold text-slate-900">{t('myPurchases')}</h2>
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white text-sm">
            {myPurchases.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-slate-700"><span className="font-mono text-xs text-slate-400">{c.code}</span> · {c.book.title}</span>
                <span className="tabular-nums text-slate-500">{(c.salePrice ?? c.askPrice).toFixed(2)} {currency}</span>
              </li>
            ))}
            {myPurchases.length === 0 && <li className="px-3 py-6 text-center text-xs text-slate-400">{t('noPurchase')}</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
