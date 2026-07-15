import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { SubjectCreateForm, SubjectRowActions } from './client';

export default async function SubjectsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.settings.subjects');

  const session = (await auth())!;
  const subjects = await withTenant(session.user.tenantId, (tx) =>
    tx.subject.findMany({
      orderBy: [{ order: 'asc' }, { label: 'asc' }],
      include: {
        curriculumEntries: {
          include: { level: true },
          orderBy: { level: { order: 'asc' } },
        },
      },
    }),
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section className="lg:col-span-2">
        <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
              <tr>
                <th className="px-4 py-3 text-start">{t('table.code')}</th>
                <th className="px-4 py-3 text-start">{t('table.label')}</th>
                <th className="px-4 py-3 text-end">{t('table.scale')}</th>
                <th className="px-4 py-3 text-end">{t('table.coefficient')}</th>
                <th className="px-4 py-3 text-start">{t('table.programme')}</th>
                <th className="px-4 py-3 text-end">{t('table.order')}</th>
                <th className="px-4 py-3 text-end">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subjects.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-mono text-xs">{s.code}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{s.label}</td>
                  <td className="px-4 py-3 text-end tabular-nums">/{s.scale}</td>
                  <td className="px-4 py-3 text-end tabular-nums text-xs text-slate-500">×{s.coefficient}</td>
                  <td className="px-4 py-3 text-xs">
                    {s.curriculumEntries.length === 0 ? (
                      <span className="text-slate-400">{t('table.noProgramme')}</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {s.curriculumEntries.map((c) => (
                          <Link
                            key={c.id}
                            href={`/${locale}/admin/settings/curriculum/programme?level=${c.levelId}`}
                            className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700 hover:bg-brand-100 hover:text-brand-700"
                            title={`${c.level.label} · coef ${c.coefficient} · ${c.weeklyHours}h/sem`}
                          >
                            {c.level.code} ×{c.coefficient}
                            <span className="ms-1 text-slate-500">({c.weeklyHours}h)</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-end text-xs text-slate-500">{s.order}</td>
                  <td className="px-4 py-3 text-end">
                    <SubjectRowActions
                      id={s.id}
                      initial={{
                        code: s.code,
                        label: s.label,
                        scale: s.scale,
                        coefficient: s.coefficient,
                        order: s.order,
                      }}
                    />
                  </td>
                </tr>
              ))}
              {subjects.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    {t('empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          <p className="font-medium">{t('infoBox.title')}</p>
          <p className="mt-1">{t('infoBox.body')}</p>
          <Link
            href={`/${locale}/admin/settings/curriculum/programme`}
            className="mt-2 inline-block font-medium text-amber-900 underline hover:text-amber-700"
          >
            {t('infoBox.cta')} →
          </Link>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">{t('create')}</h2>
          <p className="mt-1 text-xs text-slate-500">{t('createHint')}</p>
          <div className="mt-4">
            <SubjectCreateForm />
          </div>
        </div>
      </aside>
    </div>
  );
}
