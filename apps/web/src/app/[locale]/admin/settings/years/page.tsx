import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { YearCreateForm, ActivateButton } from './client';

export default async function YearsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.settings.years');

  const years = await withTenant(session.user.tenantId, (tx) =>
    tx.academicYear.findMany({ orderBy: { startDate: 'desc' } }),
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section className="lg:col-span-2">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-start">{t('table.label')}</th>
                <th className="px-4 py-3 text-start">{t('table.start')}</th>
                <th className="px-4 py-3 text-start">{t('table.end')}</th>
                <th className="px-4 py-3 text-start">{t('table.status')}</th>
                <th className="px-4 py-3 text-end">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {years.map((y) => (
                <tr key={y.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{y.label}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {new Date(y.startDate).toLocaleDateString(locale)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {new Date(y.endDate).toLocaleDateString(locale)}
                  </td>
                  <td className="px-4 py-3">
                    {y.active ? (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        {t('active')}
                      </span>
                    ) : (
                      <ActivateButton id={y.id} label={t('actions.activate')} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <Link
                      href={`/${locale}/admin/settings/years/${y.id}/edit`}
                      className="text-xs text-slate-500 hover:text-brand-700"
                    >
                      {t('actions.edit')}
                    </Link>
                  </td>
                </tr>
              ))}
              {years.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    {t('empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <aside>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">{t('create')}</h2>
          <p className="mt-1 text-xs text-slate-500">{t('createHint')}</p>
          <div className="mt-4">
            <YearCreateForm />
          </div>
        </div>
      </aside>
    </div>
  );
}
