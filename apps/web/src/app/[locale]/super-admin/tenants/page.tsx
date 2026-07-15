import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prismaAdmin } from '@jawal/db';
import { CreateTenantForm } from './create-tenant-form';
import { SignOutButton } from '../../admin/sign-out-button';

export default async function SuperAdminTenants({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/login`);
  if (!session.user.isSuperAdmin) redirect(`/${locale}/admin`);

  const t = await getTranslations('superAdmin');
  const tAdmin = await getTranslations('admin');

  // prismaAdmin = superuser, voit tous les tenants (bypass RLS volontaire ici)
  const tenants = await prismaAdmin.tenant.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { users: true, persons: true, classes: true },
      },
    },
  });

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-amber-300 bg-amber-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="rounded bg-amber-600 px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-white">
              SaaS
            </span>
            <h1 className="text-lg font-semibold text-slate-900">{t('title')}</h1>
            <Link href={`/${locale}/super-admin/groups`} className="text-sm text-brand-700 hover:underline">
              Groupes scolaires →
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-700">{session.user.email}</span>
            <SignOutButton label={tAdmin('signOut')} locale={locale} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">{t('tenants.title')}</h2>
            <p className="mt-1 text-sm text-slate-500">{tenants.length} établissement(s)</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-start">{t('tenants.table.name')}</th>
                    <th className="px-4 py-3 text-start">{t('tenants.table.slug')}</th>
                    <th className="px-4 py-3 text-start">{t('tenants.table.profile')}</th>
                    <th className="px-4 py-3 text-start">{t('tenants.table.status')}</th>
                    <th className="px-4 py-3 text-end">Users · Pers · Cls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tenants.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{t.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{t.slug}</td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">
                          {t.profile}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="px-4 py-3 text-end font-mono text-xs text-slate-500">
                        {t._count.users} · {t._count.persons} · {t._count.classes}
                      </td>
                    </tr>
                  ))}
                  {tenants.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        Aucun établissement.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <aside>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-base font-semibold text-slate-900">
                {t('tenants.create')}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Provisionne un nouvel établissement avec les modules de base.
              </p>
              <div className="mt-4">
                <CreateTenantForm />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-700',
    TRIAL: 'bg-blue-100 text-blue-700',
    SUSPENDED: 'bg-red-100 text-red-700',
    ARCHIVED: 'bg-slate-200 text-slate-700',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs ${styles[status] ?? 'bg-slate-100'}`}>
      {status}
    </span>
  );
}
