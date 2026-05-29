import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { RoleCreateForm, RoleRowActions, GroupTabs } from './client';

type SP = { group?: string };

export default async function RolesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SP>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const group = sp.group === 'STAFF' ? 'STAFF' : 'TEACHER';

  const t = await getTranslations('admin.settings.roles');

  const session = (await auth())!;
  const roles = await withTenant(session.user.tenantId, (tx) =>
    tx.personRole.findMany({
      where: { appliesTo: group },
      orderBy: [{ order: 'asc' }, { labelFr: 'asc' }],
    }),
  );

  return (
    <div className="space-y-6">
      <GroupTabs locale={locale} current={group} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-start">{t('table.code')}</th>
                  <th className="px-4 py-3 text-start">{t('table.labelFr')}</th>
                  <th className="px-4 py-3 text-start">{t('table.labelAr')}</th>
                  <th className="px-4 py-3 text-end">{t('table.order')}</th>
                  <th className="px-4 py-3 text-center">{t('table.active')}</th>
                  <th className="px-4 py-3 text-end">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {roles.map((r) => (
                  <tr key={r.id} className={r.active ? '' : 'opacity-60'}>
                    <td className="px-4 py-3 font-mono text-xs">{r.code}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{r.labelFr}</td>
                    <td className="px-4 py-3 text-slate-700" dir="rtl">
                      {r.labelAr}
                    </td>
                    <td className="px-4 py-3 text-end text-xs text-slate-500">{r.order}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          r.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {r.active ? t('active') : t('inactive')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <RoleRowActions
                        id={r.id}
                        initial={{
                          appliesTo: group,
                          code: r.code,
                          labelFr: r.labelFr,
                          labelAr: r.labelAr,
                          order: r.order,
                          active: r.active,
                        }}
                      />
                    </td>
                  </tr>
                ))}
                {roles.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
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
              <RoleCreateForm appliesTo={group} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
