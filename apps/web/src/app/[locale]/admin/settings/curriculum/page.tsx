import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { CycleCreateForm, LevelCreateForm, CycleRowActions, LevelRowActions } from './client';

function periodKindOf(settings: unknown): 'TRIMESTER' | 'SEMESTER' {
  const v = (settings as { periodKind?: string } | null)?.periodKind;
  return v === 'SEMESTER' ? 'SEMESTER' : 'TRIMESTER';
}

function roomModeOf(settings: unknown): 'HOMEROOM' | 'POOL' {
  const v = (settings as { roomMode?: string } | null)?.roomMode;
  return v === 'POOL' ? 'POOL' : 'HOMEROOM';
}

export default async function CurriculumPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.settings.curriculum');

  const session = (await auth())!;
  const { cycles, levels } = await withTenant(session.user.tenantId, async (tx) => {
    const [cycles, levels] = await Promise.all([
      tx.cycle.findMany({ orderBy: { order: 'asc' } }),
      tx.level.findMany({ include: { cycle: true }, orderBy: [{ cycle: { order: 'asc' } }, { order: 'asc' }] }),
    ]);
    return { cycles, levels };
  });

  return (
    <div className="space-y-8">
      <section>
        <header className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t('cycles.title')}</h2>
            <p className="text-xs text-slate-500">{t('cycles.subtitle')}</p>
          </div>
        </header>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-[#A9EAFE] text-xs uppercase tracking-wide text-slate-700">
                  <tr>
                    <th className="px-4 py-2 text-start">{t('cycles.table.code')}</th>
                    <th className="px-4 py-2 text-start">{t('cycles.table.label')}</th>
                    <th className="px-4 py-2 text-start">{t('cycles.table.periods')}</th>
                    <th className="px-4 py-2 text-end">{t('cycles.table.order')}</th>
                    <th className="px-4 py-2 text-end">{t('cycles.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cycles.map((c) => {
                    const pk = periodKindOf(c.settings);
                    const rm = roomModeOf(c.settings);
                    return (
                      <tr key={c.id}>
                        <td className="px-4 py-2 font-mono text-xs">{c.code}</td>
                        <td className="px-4 py-2 font-medium text-slate-900">{c.label}</td>
                        <td className="px-4 py-2">
                          <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                            {t(`cycles.form.periodKind${pk === 'SEMESTER' ? 'Semester' : 'Trimester'}`)}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-end text-xs text-slate-500">{c.order}</td>
                        <td className="px-4 py-2 text-end">
                          <CycleRowActions
                            id={c.id}
                            initial={{ code: c.code, label: c.label, order: c.order, periodKind: pk, roomMode: rm }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {cycles.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        {t('cycles.empty')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <aside>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-700">{t('cycles.create')}</h3>
              <div className="mt-3">
                <CycleCreateForm />
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section>
        <header className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t('levels.title')}</h2>
            <p className="text-xs text-slate-500">{t('levels.subtitle')}</p>
          </div>
          <Link
            href={`/${locale}/admin/settings/curriculum/programme`}
            className="rounded-lg border border-brand-300 bg-white px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            📚 {t('levels.openProgramme')}
          </Link>
        </header>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-[#A9EAFE] text-xs uppercase tracking-wide text-slate-700">
                  <tr>
                    <th className="px-4 py-2 text-start">{t('levels.table.cycle')}</th>
                    <th className="px-4 py-2 text-start">{t('levels.table.code')}</th>
                    <th className="px-4 py-2 text-start">{t('levels.table.label')}</th>
                    <th className="px-4 py-2 text-end">{t('levels.table.order')}</th>
                    <th className="px-4 py-2 text-end">{t('levels.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {levels.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-2 text-xs text-slate-600">{l.cycle.label}</td>
                      <td className="px-4 py-2 font-mono text-xs">{l.code}</td>
                      <td className="px-4 py-2 font-medium text-slate-900">{l.label}</td>
                      <td className="px-4 py-2 text-end text-xs text-slate-500">{l.order}</td>
                      <td className="px-4 py-2 text-end">
                        <LevelRowActions
                          id={l.id}
                          initial={{ cycleId: l.cycleId, code: l.code, label: l.label, order: l.order }}
                          cycles={cycles.map((c) => ({ id: c.id, label: c.label }))}
                        />
                      </td>
                    </tr>
                  ))}
                  {levels.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        {t('levels.empty')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <aside>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-700">{t('levels.create')}</h3>
              <div className="mt-3">
                <LevelCreateForm cycles={cycles.map((c) => ({ id: c.id, label: c.label }))} />
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
