import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { ProgrammeMatrix, ProgrammeAddRow } from './client';

export default async function ProgrammePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ level?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations('admin.settings.programme');

  const session = (await auth())!;
  const { levels, subjects, currentLevel, entries } = await withTenant(
    session.user.tenantId,
    async (tx) => {
      const [levels, subjects] = await Promise.all([
        tx.level.findMany({
          include: { cycle: true },
          orderBy: [{ cycle: { order: 'asc' } }, { order: 'asc' }],
        }),
        tx.subject.findMany({ orderBy: [{ order: 'asc' }, { label: 'asc' }] }),
      ]);
      const currentLevelId = sp.level ?? levels[0]?.id;
      const currentLevel = levels.find((l) => l.id === currentLevelId) ?? null;
      const entries = currentLevel
        ? await tx.curriculumSubject.findMany({
            where: { levelId: currentLevel.id },
            include: { subject: true },
            orderBy: [{ order: 'asc' }, { subject: { label: 'asc' } }],
          })
        : [];
      return { levels, subjects, currentLevel, entries };
    },
  );

  const totalHours = entries.reduce((s, e) => s + e.weeklyHours, 0);
  const usedSubjectIds = new Set(entries.map((e) => e.subjectId));
  const availableSubjects = subjects.filter((s) => !usedSubjectIds.has(s.id));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t('title')}</h2>
          <p className="text-xs text-slate-500">{t('subtitle')}</p>
        </div>
        <Link
          href={`/${locale}/admin/settings/curriculum`}
          className="text-xs text-slate-500 hover:text-brand-700"
        >
          ← {t('backToCurriculum')}
        </Link>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {levels.map((l) => {
          const active = currentLevel?.id === l.id;
          return (
            <Link
              key={l.id}
              href={`/${locale}/admin/settings/curriculum/programme?level=${l.id}`}
              className={[
                'rounded-lg px-3 py-1.5 text-sm transition-colors',
                active
                  ? 'bg-brand-600 text-white shadow'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
              ].join(' ')}
            >
              {l.cycle.label} · {l.label}
            </Link>
          );
        })}
        {levels.length === 0 && (
          <p className="text-sm text-slate-500">{t('noLevels')}</p>
        )}
      </div>

      {currentLevel && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-[#A9EAFE] text-xs uppercase tracking-wide text-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-start">{t('table.subject')}</th>
                    <th className="px-4 py-3 text-end">{t('table.hours')}</th>
                    <th className="px-4 py-3 text-end">{t('table.coefficient')}</th>
                    <th className="px-4 py-3 text-end">{t('table.order')}</th>
                    <th className="px-4 py-3 text-end">{t('table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entries.map((e) => (
                    <ProgrammeMatrix
                      key={e.id}
                      id={e.id}
                      levelId={currentLevel.id}
                      subjectId={e.subjectId}
                      subjectLabel={e.subject.label}
                      weeklyHours={e.weeklyHours}
                      coefficient={e.coefficient}
                      order={e.order}
                    />
                  ))}
                  {entries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                        {t('empty')}
                      </td>
                    </tr>
                  )}
                </tbody>
                {entries.length > 0 && (
                  <tfoot className="border-t border-slate-200 bg-slate-50 text-xs">
                    <tr>
                      <td className="px-4 py-2 font-medium text-slate-700">{t('totalHours')}</td>
                      <td className="px-4 py-2 text-end font-semibold tabular-nums text-slate-900">
                        {totalHours} h
                      </td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>

          <aside>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-slate-700">{t('addSubject')}</h3>
              <p className="mt-1 text-xs text-slate-500">{t('addSubjectHint')}</p>
              {availableSubjects.length === 0 ? (
                <p className="mt-3 text-xs text-amber-700">{t('allSubjectsAdded')}</p>
              ) : (
                <div className="mt-3">
                  <ProgrammeAddRow
                    levelId={currentLevel.id}
                    subjects={availableSubjects.map((s) => ({
                      id: s.id,
                      label: s.label,
                      defaultCoefficient: s.coefficient,
                    }))}
                  />
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
