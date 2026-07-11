import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { CloseYearButton, ReopenYearButton } from '../cloture-client';

export default async function CloturePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.comptabilite');
  const tc = await getTranslations('admin.comptabilite.cloture');

  const years = await withTenant(session.user.tenantId, (tx) =>
    tx.fiscalYear.findMany({ orderBy: { startDate: 'desc' }, include: { _count: { select: { entries: true } } } }),
  );

  return (
    <div className="mx-auto max-w-3xl px-3 py-3">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/comptabilite`} className="hover:text-brand-700">📒 {t('title')}</Link>
        <span className="mx-1.5">›</span>
        <span>{tc('title')}</span>
      </nav>

      <h1 className="mb-1 text-base font-bold text-slate-900">{tc('title')}</h1>
      <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{tc('hint')}</p>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 text-start">{tc('year')}</th>
              <th className="px-4 py-2.5 text-start">{tc('period')}</th>
              <th className="px-4 py-2.5 text-end">{tc('entries')}</th>
              <th className="px-4 py-2.5 text-center">{tc('status')}</th>
              <th className="px-4 py-2.5 text-end">{tc('action')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {years.map((y) => (
              <tr key={y.id}>
                <td className="px-4 py-2.5 font-medium text-slate-800">{y.label}</td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{new Date(y.startDate).toLocaleDateString(locale)} → {new Date(y.endDate).toLocaleDateString(locale)}</td>
                <td className="px-4 py-2.5 text-end tabular-nums text-slate-600">{y._count.entries}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${y.status === 'OPEN' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{tc(`statusLabel.${y.status}`)}</span>
                </td>
                <td className="px-4 py-2.5 text-end">
                  {y.status === 'OPEN' ? <CloseYearButton yearId={y.id} /> : <ReopenYearButton yearId={y.id} />}
                </td>
              </tr>
            ))}
            {years.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">{tc('noYears')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
