import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { SurveyForm } from '../survey-form';

export default async function NewSurveyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.surveys');

  const periods = await withTenant(session.user.tenantId, async (tx) => {
    const year = await tx.academicYear.findFirst({
      where: { active: true },
      include: { periods: { orderBy: { startDate: 'asc' } } },
    });
    return (year?.periods ?? []).map((p) => ({ id: p.id, label: p.label }));
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={`/${locale}/admin/surveys`} className="hover:text-brand-700">
          {t('title')}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{t('actions.new')}</span>
      </nav>

      <h1 className="mb-6 text-2xl font-semibold text-slate-900">{t('actions.new')}</h1>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <SurveyForm locale={locale} periods={periods} />
      </div>
    </div>
  );
}
