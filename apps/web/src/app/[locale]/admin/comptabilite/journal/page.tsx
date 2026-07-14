import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { DeleteEntryButton, ReverseEntryButton, ExportButton } from '../comptabilite-client';

const inputCls = 'rounded-lg border border-slate-300 px-3 py-2 text-sm';
const JOURNALS = ['VE', 'AC', 'BQ', 'CA', 'PA', 'OD'] as const;

export default async function JournalPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ journal?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.comptabilite');

  const journalFilter = JOURNALS.includes(sp.journal as (typeof JOURNALS)[number]) ? (sp.journal as (typeof JOURNALS)[number]) : undefined;

  const entries = await withTenant(session.user.tenantId, (tx) =>
    tx.journalEntry.findMany({
      where: journalFilter ? { journal: journalFilter } : {},
      include: { lines: { include: { account: { select: { code: true, name: true } } } } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    }),
  );

  const csvRows = entries.flatMap((e) =>
    e.lines.map((l) => [new Date(e.date).toISOString().slice(0, 10), e.journal, e.label, l.account.code, l.account.name, Number(l.debit).toFixed(2), Number(l.credit).toFixed(2)]),
  );

  return (
    <div className="mx-auto max-w-5xl px-3 py-3">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/comptabilite`} className="hover:text-brand-700">📒 {t('title')}</Link>
        <span className="mx-1.5">›</span>
        <span>{t('journalLink')}</span>
      </nav>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <form className="flex items-end gap-2">
          <label className="text-xs font-medium text-slate-600"><span className="mb-1 block">{t('journal')}</span>
            <select name="journal" defaultValue={journalFilter ?? ''} className={inputCls}>
              <option value="">{t('allJournals')}</option>
              {JOURNALS.map((j) => <option key={j} value={j}>{t(`journals.${j}`)}</option>)}
            </select>
          </label>
          <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">{t('filter')}</button>
        </form>
        <ExportButton header={['Date', 'Journal', 'Libelle', 'Compte', 'Intitule', 'Debit', 'Credit']} rows={csvRows} filename="journal" label={t('export')} />
      </div>

      <div className="space-y-3">
        {entries.map((e) => {
          const totD = e.lines.reduce((s, l) => s + Number(l.debit), 0);
          return (
            <div key={e.id} className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm">
                <span className="font-medium text-slate-800">
                  <span className="me-2 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">{e.journal}</span>
                  {e.label}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{new Date(e.date).toLocaleDateString(locale)} · {totD.toFixed(2)}</span>
                  {!e.sourceType && <DeleteEntryButton id={e.id} />}
                  {e.sourceType && e.sourceType !== 'Reversal' && <ReverseEntryButton id={e.id} />}
                </span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-50">
                  {e.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-1.5"><span className="font-mono text-xs text-slate-500">{l.account.code}</span> <span className="text-slate-700">{l.account.name}</span></td>
                      <td className="px-4 py-1.5 text-end tabular-nums text-slate-700">{Number(l.debit) ? Number(l.debit).toFixed(2) : ''}</td>
                      <td className="px-4 py-1.5 text-end tabular-nums text-slate-700">{Number(l.credit) ? Number(l.credit).toFixed(2) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
        {entries.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">{t('noEntries')}</p>}
      </div>
    </div>
  );
}
