import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { audiencesFor } from '@/lib/survey';
import { RespondForm } from './respond-form';

export default async function ParentSurveysPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('parent.surveys');

  const surveys = await withTenant(session.user.tenantId, async (tx) =>
    tx.survey.findMany({
      where: { status: 'OPEN', audience: { in: audiencesFor('PARENT') } },
      orderBy: { createdAt: 'desc' },
      include: {
        questions: { orderBy: { order: 'asc' } },
        responses: { where: { submittedById: session.user.id }, select: { id: true } },
      },
    }),
  );

  return (
    <div className="px-3 py-3">
      <section className="mb-4 overflow-hidden rounded-3xl bg-gradient-to-r from-brand-100 to-brand-50 px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('subtitle')}</p>
      </section>

      {surveys.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          {t('empty')}
        </div>
      ) : (
        <div className="space-y-5">
          {surveys.map((s) => {
            const answered = s.responses.length > 0;
            return (
              <section key={s.id} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">{s.title}</h2>
                {s.description && <p className="mt-1 text-sm text-slate-600">{s.description}</p>}

                <div className="mt-4">
                  {answered ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                      {t('alreadyAnswered')}
                    </div>
                  ) : (
                    <RespondForm
                      surveyId={s.id}
                      questions={s.questions.map((q) => ({
                        id: q.id,
                        label: q.label,
                        type: q.type,
                        required: q.required,
                      }))}
                    />
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
