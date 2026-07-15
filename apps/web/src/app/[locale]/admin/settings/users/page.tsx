import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { InviteUserForm, UserActions } from './client';

export default async function UsersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.settings.users');

  const session = (await auth())!;
  const tenantId = session.user.tenantId;

  const { users, roles, personRoles } = await withTenant(tenantId, async (tx) => {
    const [users, roles, personRoles] = await Promise.all([
      tx.user.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          userRoles: { include: { role: { select: { code: true, label: true } } } },
          userPersons: { include: { person: { select: { firstName: true, lastName: true, type: true } } } },
        },
      }),
      tx.role.findMany({ where: { code: { notIn: ['parent', 'eleve'] } }, orderBy: { code: 'asc' } }),
      tx.personRole.findMany({
        where: { active: true, appliesTo: { in: ['TEACHER', 'STAFF'] } },
        orderBy: [{ appliesTo: 'asc' }, { order: 'asc' }],
        select: { id: true, labelFr: true, labelAr: true, appliesTo: true },
      }),
    ]);
    return { users, roles, personRoles };
  });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section className="lg:col-span-2">
        <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
              <tr>
                <th className="px-4 py-3 text-start">{t('table.email')}</th>
                <th className="px-4 py-3 text-start">{t('table.name')}</th>
                <th className="px-4 py-3 text-start">{t('table.roles')}</th>
                <th className="px-4 py-3 text-start">{t('table.lastLogin')}</th>
                <th className="px-4 py-3 text-end">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => {
                const person = u.userPersons[0]?.person;
                const isSelf = u.id === session.user.id;
                return (
                  <tr key={u.id} className={u.disabledAt ? 'bg-slate-50/60 text-slate-500' : ''}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {u.email}
                      {u.isSuperAdmin && (
                        <span className="ms-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                          super
                        </span>
                      )}
                      {isSelf && (
                        <span className="ms-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800">
                          {t('you')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {person ? `${person.lastName} ${person.firstName}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {u.userRoles.length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        u.userRoles.map((ur) => (
                          <span
                            key={ur.id}
                            className="me-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs"
                          >
                            {ur.role.label}
                          </span>
                        ))
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString(locale) : '—'}
                    </td>
                    <td className="px-4 py-3 text-end">
                      {!isSelf && (
                        <UserActions
                          userId={u.id}
                          disabled={!!u.disabledAt}
                          canDelete={(!!u.disabledAt || !u.lastLoginAt) && !u.isSuperAdmin}
                          labels={{
                            disable: t('actions.disable'),
                            enable: t('actions.enable'),
                            confirm: t('actions.confirmDisable'),
                            delete: t('actions.delete'),
                            confirmDelete: t('actions.confirmDelete'),
                          }}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <aside>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">{t('invite')}</h2>
          <p className="mt-1 text-xs text-slate-500">{t('inviteHint')}</p>
          <div className="mt-4">
            <InviteUserForm
              roles={roles.map((r) => ({ code: r.code, label: r.label }))}
              personRoles={personRoles.map((r) => ({
                id: r.id,
                label: locale === 'ar' ? r.labelAr : r.labelFr,
                appliesTo: r.appliesTo as 'TEACHER' | 'STAFF',
              }))}
            />
          </div>
        </div>
      </aside>
    </div>
  );
}
