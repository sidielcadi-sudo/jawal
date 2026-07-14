import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { CreateForm, DeleteButton, SeedConfigButton, ConfigForm, CampaignStatusButton } from './bourse-client';
import { createCampaignAction, createBookAction, deleteBookAction } from './actions';

const inputCls = 'rounded-lg border border-slate-300 px-3 py-2 text-sm';

export default async function BoursePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.bourse');

  const { config, campaigns, books, subjects, levels, currency } = await withTenant(session.user.tenantId, async (tx) => {
    const [config, campaigns, books, subjects, levels, tenant] = await Promise.all([
      tx.bookExchangeConfig.findFirst(),
      tx.bookExchangeCampaign.findMany({ orderBy: [{ year: 'desc' }, { createdAt: 'desc' }], include: { _count: { select: { copies: true } } } }),
      tx.book.findMany({ orderBy: { title: 'asc' }, include: { subject: { select: { label: true } }, level: { select: { code: true } }, _count: { select: { copies: true } } }, take: 300 }),
      tx.subject.findMany({ orderBy: { label: 'asc' }, select: { id: true, label: true } }),
      tx.level.findMany({ orderBy: { order: 'asc' }, select: { id: true, code: true, label: true } }),
      tx.tenant.findFirst({ select: { currency: true } }),
    ]);
    return { config, campaigns, books, subjects, levels, currency: tenant?.currency ?? 'MAD' };
  });

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-100 to-brand-50 shadow-sm px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">📚 {t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-600">{t('subtitle')}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <a href={`/${locale}/admin/bourse/depot`} className="rounded-xl border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
            {t('depot.cta')}
          </a>
          <a href={`/${locale}/admin/bourse/vente`} className="rounded-xl border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
            {t('vente.cta')}
          </a>
          <a href={`/${locale}/admin/bourse/remboursements`} className="rounded-xl border border-brand-300 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
            {t('refund.cta')}
          </a>
          <a href={`/${locale}/admin/bourse/finance`} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            {t('finance.cta')}
          </a>
        </div>
      </header>

      {/* Paramétrage */}
      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">{t('configTitle')}</h2>
        {config ? <ConfigForm config={{ id: config.id, commissionMode: config.commissionMode, commissionValue: config.commissionValue, labelPrefix: config.labelPrefix, pricingByCondition: config.pricingByCondition as Record<string, number> }} /> : (
          <div className="py-3 text-center"><p className="mb-3 text-sm text-slate-600">{t('noConfig')}</p><SeedConfigButton /></div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Catalogue */}
        <section className="lg:col-span-2">
          <h2 className="mb-2 text-base font-semibold text-slate-900">{t('catalogTitle')}</h2>
          <CreateForm action={createBookAction} className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <input name="title" required placeholder={t('bookTitle')} className={`${inputCls} col-span-2`} />
            <select name="levelId" defaultValue="" className={inputCls}>
              <option value="">{t('level')}</option>
              {levels.map((l) => <option key={l.id} value={l.id}>{l.code}</option>)}
            </select>
            <select name="subjectId" defaultValue="" className={inputCls}>
              <option value="">{t('subject')}</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <input name="editor" placeholder={t('editor')} className={inputCls} />
            <input name="isbn" placeholder="ISBN" className={inputCls} />
            <input name="editionYear" type="number" placeholder={t('editionYear')} className={inputCls} />
            <input name="priceNew" type="number" step="any" placeholder={t('priceNew')} className={inputCls} />
            <button className="col-span-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 md:col-span-4">{t('addBook')}</button>
          </CreateForm>
          <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-[#A9EAFE] text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-start">{t('bookTitle')}</th>
                  <th className="px-3 py-2 text-start">{t('level')}</th>
                  <th className="px-3 py-2 text-start">{t('subject')}</th>
                  <th className="px-3 py-2 text-end">{t('priceNew')}</th>
                  <th className="px-3 py-2 text-end">{t('copies')}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {books.map((b) => (
                  <tr key={b.id}>
                    <td className="px-3 py-2 font-medium text-slate-800">{b.title}{b.editor && <span className="ms-1 text-xs text-slate-400">· {b.editor}</span>}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{b.level?.code ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{b.subject?.label ?? '—'}</td>
                    <td className="px-3 py-2 text-end tabular-nums text-slate-600">{b.priceNew ? `${b.priceNew} ${currency}` : '—'}</td>
                    <td className="px-3 py-2 text-end tabular-nums text-slate-500">{b._count.copies}</td>
                    <td className="px-3 py-2 text-end"><DeleteButton onDelete={deleteBookAction.bind(null, b.id)} confirmText={t('deleteBookConfirm')} /></td>
                  </tr>
                ))}
                {books.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">{t('noBooks')}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        {/* Campagnes */}
        <aside>
          <h2 className="mb-2 text-base font-semibold text-slate-900">{t('campaigns')}</h2>
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <CreateForm action={createCampaignAction} className="mb-3 grid grid-cols-[1fr_auto_auto] gap-1.5">
              <input name="label" required placeholder={t('campaignLabel')} className={inputCls} />
              <input name="year" type="number" defaultValue={new Date().getUTCFullYear()} className={`${inputCls} w-20`} />
              <button className="rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700">+</button>
            </CreateForm>
            <ul className="divide-y divide-slate-100 text-sm">
              {campaigns.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-1.5">
                  <span className="text-slate-700">
                    {c.label} <span className="text-xs text-slate-400">{c.year}</span>
                    <span className={`ms-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${c.status === 'OPEN' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{t(`status.${c.status}`)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">{c._count.copies}</span>
                    <CampaignStatusButton id={c.id} status={c.status} />
                  </span>
                </li>
              ))}
              {campaigns.length === 0 && <li className="py-3 text-center text-xs text-slate-400">{t('noCampaigns')}</li>}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
