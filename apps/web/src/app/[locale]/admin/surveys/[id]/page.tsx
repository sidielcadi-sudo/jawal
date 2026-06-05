import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getSurveyResults } from '@/lib/survey';
import { SurveyStatusActions } from './survey-actions';

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  OPEN: 'bg-emerald-100 text-emerald-700',
  CLOSED: 'bg-amber-100 text-amber-700',
};

export default async function SurveyResultsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.surveys');

  const data = await withTenant(session.user.tenantId, (tx) => getSurveyResults(tx, id));
  if (!data) notFound();
  const { survey, periodLabel, realResponses, questions } = data;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={`/${locale}/admin/surveys`} className="hover:text-brand-700">
          {t('title')}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{survey.title}</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{survey.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[survey.status]}`}
            >
              {t(`status.${survey.status}`)}
            </span>
            <span>· {t(`form.audiences.${survey.audience}`)}</span>
            {periodLabel && <span>· {periodLabel}</span>}
            <span>· {t('results.responseCount', { count: realResponses })}</span>
          </p>
          {survey.description && (
            <p className="mt-2 max-w-prose text-sm text-slate-600">{survey.description}</p>
          )}
        </div>
        <SurveyStatusActions id={survey.id} status={survey.status} locale={locale} />
      </header>

      <div className="space-y-4">
        {questions.map((q) => (
          <section key={q.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-800">{q.label}</h2>
              {q.type === 'RATING_5' && q.average !== null && (
                <span className="bg-brand-50 text-brand-700 shrink-0 rounded-lg px-2.5 py-1 text-sm font-semibold">
                  {q.average.toFixed(2)}/5
                </span>
              )}
            </div>

            {q.type === 'RATING_5' ? (
              q.count === 0 ? (
                <p className="mt-2 text-sm text-slate-400">{t('results.noAnswers')}</p>
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const n = q.distribution[star - 1] ?? 0;
                    const pct = q.count > 0 ? (n / q.count) * 100 : 0;
                    return (
                      <li key={star} className="flex items-center gap-3 text-xs">
                        <span className="w-10 shrink-0 text-slate-500">{star} ★</span>
                        <div className="relative h-3 flex-1 overflow-hidden rounded bg-slate-100">
                          <div className="bg-brand-400 h-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-8 shrink-0 text-end tabular-nums text-slate-500">
                          {n}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : q.texts.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">{t('results.noAnswers')}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {q.texts.map((txt, i) => (
                  <li key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    « {txt} »
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
