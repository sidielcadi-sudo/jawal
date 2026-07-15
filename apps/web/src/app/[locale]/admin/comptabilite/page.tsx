import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { SeedChartButton, CreateForm, ManualEntryForm } from './comptabilite-client';
import { createAccountAction, createFiscalYearAction } from './actions';

const inputCls = 'rounded-lg border border-slate-300 px-3 py-2 text-sm';

export default async function ComptabilitePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.comptabilite');

  const { fiscalYears, accounts, entryCount } = await withTenant(session.user.tenantId, async (tx) => {
    const [fiscalYears, accounts, entryCount] = await Promise.all([
      tx.fiscalYear.findMany({ orderBy: { startDate: 'desc' } }),
      tx.account.findMany({ where: { active: true }, orderBy: { code: 'asc' } }),
      tx.journalEntry.count(),
    ]);
    return { fiscalYears, accounts, entryCount };
  });

  const hasOpenYear = fiscalYears.some((y) => y.status === 'OPEN');

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">📒 {t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-600">{t('subtitle')}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href={`/${locale}/admin/comptabilite/achats`} className="rounded-xl border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">{t('achats.title')}</Link>
          <Link href={`/${locale}/admin/comptabilite/journal`} className="rounded-xl border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">{t('journalLink')}</Link>
          <Link href={`/${locale}/admin/comptabilite/balance-agee`} className="rounded-xl border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">{t('agingLink')}</Link>
          <Link href={`/${locale}/admin/comptabilite/balance`} className="rounded-xl border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">{t('balanceLink')}</Link>
          <Link href={`/${locale}/admin/comptabilite/etats`} className="rounded-xl border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">{t('etats.title')}</Link>
          <Link href={`/${locale}/admin/comptabilite/cloture`} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">{t('cloture.title')}</Link>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Kpi label={t('accountsCount')} value={String(accounts.length)} />
        <Kpi label={t('entriesCount')} value={String(entryCount)} />
        <Kpi label={t('openYear')} value={fiscalYears.find((y) => y.status === 'OPEN')?.label ?? '—'} />
      </div>

      {/* Exercice */}
      {fiscalYears.length === 0 || !hasOpenYear ? (
        <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-amber-900">{t('createYearTitle')}</h2>
          <CreateForm action={createFiscalYearAction} className="flex flex-wrap items-end gap-2">
            <input name="label" required placeholder={t('yearLabel')} className={inputCls} />
            <input name="startDate" type="date" required className={inputCls} title={t('start')} />
            <input name="endDate" type="date" required className={inputCls} title={t('end')} />
            <button className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">{t('createYear')}</button>
          </CreateForm>
        </section>
      ) : null}

      {accounts.length === 0 ? (
        <section className="mb-4 rounded-2xl border border-dashed border-slate-300 p-8 text-center">
          <p className="mb-3 text-sm text-slate-600">{t('noChart')}</p>
          <SeedChartButton />
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Saisie d'écriture */}
          <section className="rounded-2xl border border-brand-200 bg-white p-4 lg:col-span-2">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">{t('manualTitle')}</h2>
            {hasOpenYear ? (
              <ManualEntryForm accounts={accounts.map((a) => ({ code: a.code, name: a.name }))} />
            ) : (
              <p className="text-sm text-slate-500">{t('needYear')}</p>
            )}
          </section>

          {/* Plan comptable */}
          <aside>
            <h2 className="mb-2 text-base font-semibold text-slate-900">{t('chartTitle')}</h2>
            <section className="rounded-2xl border border-brand-200 bg-white p-4">
              <CreateForm action={createAccountAction} className="mb-3 grid grid-cols-[auto_1fr_auto] gap-1.5">
                <input name="code" required placeholder={t('code')} className={`${inputCls} w-20`} />
                <input name="name" required placeholder={t('accountName')} className={inputCls} />
                <button className="rounded-lg bg-brand-600 px-2 text-sm font-medium text-white hover:bg-brand-700">+</button>
              </CreateForm>
              <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto text-sm">
                {accounts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-1.5">
                    <span><span className="font-mono text-xs text-slate-500">{a.code}</span> <span className="text-slate-700">{a.name}</span></span>
                    {a.reconcilable && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{t('reconcilable')}</span>}
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-brand-200 bg-white p-3">
      <div className="text-xl font-bold tabular-nums text-slate-800">{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}
