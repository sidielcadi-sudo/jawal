import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { DocCreateForm, DocRowActions, QuotaRow } from './client';
import { localizedLabel } from '@/lib/localized-name';

const PLACE_TAKEN = ['ACCEPTE', 'INSCRIPTION_VALIDEE', 'AFFECTE', 'ACTIVE'] as const;

export default async function AdmissionsSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.settings.admissions');

  const session = (await auth())!;
  const { docs, levels, activeYear, quotaByLevel, takenByLevel } = await withTenant(
    session.user.tenantId,
    async (tx) => {
      const [docs, levelsRaw, activeYear] = await Promise.all([
        tx.requiredDocument.findMany({
          orderBy: [{ order: 'asc' }, { labelFr: 'asc' }],
          include: { level: { include: { cycle: true } } },
        }),
        tx.level.findMany({
          include: { cycle: true },
          orderBy: [{ cycle: { order: 'asc' } }, { order: 'asc' }],
        }),
        tx.academicYear.findFirst({ where: { active: true }, select: { id: true, label: true } }),
      ]);
      const quotaByLevel = new Map<string, number>();
      const takenByLevel = new Map<string, number>();
      if (activeYear) {
        const quotas = await tx.admissionQuota.findMany({
          where: { academicYearId: activeYear.id },
          select: { levelId: true, capacity: true },
        });
        for (const q of quotas) quotaByLevel.set(q.levelId, q.capacity);
        const taken = await tx.enrollment.groupBy({
          by: ['levelId'],
          where: { academicYearId: activeYear.id, status: { in: [...PLACE_TAKEN] } },
          _count: { _all: true },
        });
        for (const r of taken) takenByLevel.set(r.levelId, r._count._all);
      }
      return {
        docs,
        levels: levelsRaw.map((l) => ({ id: l.id, label: `${localizedLabel(locale, l.cycle.label, l.cycle.labelAr)} — ${localizedLabel(locale, l.label, l.labelAr)}` })),
        activeYear,
        quotaByLevel,
        takenByLevel,
      };
    },
  );

  return (
    <div className="space-y-8">
      {/* Pièces requises */}
      <section>
        <header className="mb-3">
          <h2 className="text-lg font-semibold text-slate-900">{t('docs.title')}</h2>
          <p className="text-xs text-slate-500">{t('docs.subtitle')}</p>
        </header>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                  <tr>
                    <th className="px-4 py-2 text-start">{t('doc.code')}</th>
                    <th className="px-4 py-2 text-start">{t('doc.label')}</th>
                    <th className="px-4 py-2 text-start">{t('doc.level')}</th>
                    <th className="px-4 py-2 text-center">{t('doc.required')}</th>
                    <th className="px-4 py-2 text-end">{t('doc.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {docs.map((d) => (
                    <tr key={d.id} className={d.active ? '' : 'opacity-60'}>
                      <td className="px-4 py-2 font-mono text-xs">{d.code}</td>
                      <td className="px-4 py-2 font-medium text-slate-900">
                        {locale === 'ar' ? d.labelAr : d.labelFr}
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-600">
                        {d.level ? `${localizedLabel(locale, d.level.cycle.label, d.level.cycle.labelAr)} — ${localizedLabel(locale, d.level.label, d.level.labelAr)}` : t('doc.allLevels')}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {d.required ? (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">
                            {t('doc.yes')}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">{t('doc.no')}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-end">
                        <DocRowActions
                          id={d.id}
                          levels={levels}
                          initial={{
                            code: d.code,
                            labelFr: d.labelFr,
                            labelAr: d.labelAr,
                            levelId: d.levelId,
                            required: d.required,
                            order: d.order,
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                  {docs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        {t('docs.empty')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <aside>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-700">{t('docs.create')}</h3>
              <div className="mt-3">
                <DocCreateForm levels={levels} />
              </div>
            </div>
          </aside>
        </div>
      </section>

      {/* Quotas */}
      <section>
        <header className="mb-3">
          <h2 className="text-lg font-semibold text-slate-900">{t('quota.title')}</h2>
          <p className="text-xs text-slate-500">
            {activeYear ? t('quota.subtitle', { year: activeYear.label }) : t('quota.noYear')}
          </p>
        </header>
        {activeYear && (
          <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white lg:max-w-2xl">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="px-4 py-2 text-start">{t('quota.level')}</th>
                  <th className="px-4 py-2 text-end">{t('quota.taken')}</th>
                  <th className="px-4 py-2 text-start">{t('quota.capacity')}</th>
                  <th className="px-4 py-2 text-end" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {levels.map((l) => (
                  <QuotaRow
                    key={l.id}
                    academicYearId={activeYear.id}
                    levelId={l.id}
                    levelLabel={l.label}
                    capacity={quotaByLevel.get(l.id) ?? 0}
                    taken={takenByLevel.get(l.id) ?? 0}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
