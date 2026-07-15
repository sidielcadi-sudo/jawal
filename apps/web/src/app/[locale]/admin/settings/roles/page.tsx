import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import {
  RoleCreateForm,
  RoleRowActions,
  ServiceCreateForm,
  ServiceRowActions,
  GroupTabs,
  ActiveToggle,
} from './client';

type SP = { group?: string };
type Group = 'TEACHER' | 'STAFF' | 'SERVICE';

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
  const group: Group =
    sp.group === 'STAFF' ? 'STAFF' : sp.group === 'SERVICE' ? 'SERVICE' : 'TEACHER';

  const t = await getTranslations('admin.settings.roles');

  const session = (await auth())!;
  const { roles, services } = await withTenant(session.user.tenantId, async (tx) => {
    const services = await tx.service.findMany({
      orderBy: [{ order: 'asc' }, { labelFr: 'asc' }],
    });
    const roles =
      group === 'SERVICE'
        ? []
        : await tx.personRole.findMany({
            where: { appliesTo: group },
            orderBy: [{ order: 'asc' }, { labelFr: 'asc' }],
          });
    return { roles, services };
  });

  const serviceOptions = services.map((s) => ({ id: s.id, labelFr: s.labelFr }));
  const serviceLabelById = new Map(services.map((s) => [s.id, s.labelFr]));

  return (
    <div className="space-y-6">
      <GroupTabs locale={locale} current={group} />

      {group === 'SERVICE' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
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
                  {services.map((s) => (
                    <tr key={s.id} className={s.active ? '' : 'opacity-60'}>
                      <td className="px-4 py-3 font-mono text-xs">{s.code}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{s.labelFr}</td>
                      <td className="px-4 py-3 text-slate-700" dir="rtl">
                        {s.labelAr}
                      </td>
                      <td className="px-4 py-3 text-end text-xs text-slate-500">{s.order}</td>
                      <td className="px-4 py-3 text-center">
                        <ActiveToggle id={s.id} active={s.active} kind="service" />
                      </td>
                      <td className="px-4 py-3 text-end">
                        <ServiceRowActions
                          id={s.id}
                          initial={{
                            code: s.code,
                            labelFr: s.labelFr,
                            labelAr: s.labelAr,
                            order: s.order,
                            active: s.active,
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                  {services.length === 0 && (
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
              <h2 className="text-base font-semibold text-slate-900">{t('createService')}</h2>
              <p className="mt-1 text-xs text-slate-500">{t('createServiceHint')}</p>
              <div className="mt-4">
                <ServiceCreateForm />
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-start">{t('table.code')}</th>
                    <th className="px-4 py-3 text-start">{t('table.labelFr')}</th>
                    <th className="px-4 py-3 text-start">{t('table.labelAr')}</th>
                    <th className="px-4 py-3 text-start">{t('table.service')}</th>
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
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {r.serviceId ? (serviceLabelById.get(r.serviceId) ?? '—') : '—'}
                      </td>
                      <td className="px-4 py-3 text-end text-xs text-slate-500">{r.order}</td>
                      <td className="px-4 py-3 text-center">
                        <ActiveToggle id={r.id} active={r.active} kind="role" />
                      </td>
                      <td className="px-4 py-3 text-end">
                        <RoleRowActions
                          id={r.id}
                          services={serviceOptions}
                          initial={{
                            appliesTo: group,
                            code: r.code,
                            labelFr: r.labelFr,
                            labelAr: r.labelAr,
                            serviceId: r.serviceId,
                            order: r.order,
                            active: r.active,
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                  {roles.length === 0 && (
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

          <aside>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-base font-semibold text-slate-900">{t('create')}</h2>
              <p className="mt-1 text-xs text-slate-500">{t('createHint')}</p>
              <div className="mt-4">
                <RoleCreateForm appliesTo={group} services={serviceOptions} />
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
