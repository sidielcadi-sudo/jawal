import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { listSurveys } from '@/lib/survey';

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  OPEN: 'bg-emerald-100 text-emerald-700',
  CLOSED: 'bg-amber-100 text-amber-700',
};

export default async function SurveysListPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.surveys');

  const surveys = await withTenant(session.user.tenantId, (tx) => listSurveys(tx));
  const base = `/${locale}/admin/surveys`;

  return (
    <div className="px-3 py-3">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-600">{t('subtitle')}</p>
        </div>
        <Link
          href={`${base}/new`}
          className="bg-brand-600 hover:bg-brand-700 rounded-lg px-4 py-2 text-sm font-medium text-white shadow"
        >
          {t('actions.new')}
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-4 py-3 text-start">{t('table.title')}</th>
              <th className="px-4 py-3 text-start">{t('table.audience')}</th>
              <th className="px-4 py-3 text-start">{t('table.status')}</th>
              <th className="px-4 py-3 text-end">{t('table.responses')}</th>
              <th className="px-4 py-3 text-end">{t('table.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {surveys.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3">
                  <Link
                    href={`${base}/${s.id}`}
                    className="hover:text-brand-700 font-medium text-slate-900 hover:underline"
                  >
                    {s.title}
                  </Link>
                  <div className="text-xs text-slate-400">
                    {t('table.questionsCount', { count: s._count.questions })}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{t(`form.audiences.${s.audience}`)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[s.status]}`}
                  >
                    {t(`status.${s.status}`)}
                  </span>
                </td>
                <td className="px-4 py-3 text-end tabular-nums text-slate-700">
                  {s._count.responses}
                </td>
                <td className="px-4 py-3 text-end">
                  <Link
                    href={`${base}/${s.id}`}
                    className="hover:text-brand-700 text-xs text-slate-500"
                  >
                    {t('actions.view')}
                  </Link>
                </td>
              </tr>
            ))}
            {surveys.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  {t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
