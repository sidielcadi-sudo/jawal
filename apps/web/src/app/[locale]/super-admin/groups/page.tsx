import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prismaAdmin } from '@jawal/db';
import { SignOutButton } from '../../admin/sign-out-button';
import { CreateGroupForm, AttachTenantControl, GrantAccessForm, RevokeAccessButton } from './forms';

export default async function SuperAdminGroups({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/login`);
  if (!session.user.isSuperAdmin) redirect(`/${locale}/admin`);

  const tAdmin = await getTranslations('admin');

  const [groups, tenants, memberships] = await Promise.all([
    prismaAdmin.tenantGroup.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { tenants: true } } },
    }),
    prismaAdmin.tenant.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, groupId: true },
    }),
    prismaAdmin.userTenant.findMany({
      include: {
        user: { select: { email: true, tenantId: true } },
        tenant: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-amber-300 bg-amber-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="rounded bg-amber-600 px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-white">
              SaaS
            </span>
            <h1 className="text-lg font-semibold text-slate-900">Groupes scolaires</h1>
            <Link href={`/${locale}/super-admin/tenants`} className="text-sm text-brand-700 hover:underline">
              ← Établissements
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-700">{session.user.email}</span>
            <SignOutButton label={tAdmin('signOut')} locale={locale} />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-6 py-8 lg:grid-cols-3">
        {/* Établissements + rattachement */}
        <section className="lg:col-span-2">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Établissements & rattachement</h2>
          <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-[#A9EAFE] text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="px-4 py-3 text-start">Établissement</th>
                  <th className="px-4 py-3 text-start">Slug</th>
                  <th className="px-4 py-3 text-start">Groupe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tenants.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{t.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{t.slug}</td>
                    <td className="px-4 py-2.5">
                      <AttachTenantControl
                        tenantId={t.id}
                        groupId={t.groupId}
                        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Accès multi-sites accordés */}
          <h2 className="mb-3 mt-8 text-base font-semibold text-slate-900">Accès multi-sites accordés</h2>
          <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-[#A9EAFE] text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="px-4 py-3 text-start">Compte (email)</th>
                  <th className="px-4 py-3 text-start">Site autorisé</th>
                  <th className="px-4 py-3 text-end">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {memberships.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2.5 text-slate-800">{m.user.email}</td>
                    <td className="px-4 py-2.5 text-slate-600">{m.tenant.name}</td>
                    <td className="px-4 py-2.5 text-end">
                      <RevokeAccessButton userId={m.userId} tenantId={m.tenantId} />
                    </td>
                  </tr>
                ))}
                {memberships.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                      Aucun accès multi-sites pour l'instant.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Colonne actions */}
        <aside className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-900">Créer un groupe</h3>
            <p className="mt-1 text-xs text-slate-500">
              {groups.length} groupe(s) — rattachez ensuite les établissements.
            </p>
            <div className="mt-3">
              <CreateGroupForm />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-900">Accorder un accès multi-sites</h3>
            <p className="mt-1 text-xs text-slate-500">
              Donne à un compte existant l'accès à un autre établissement du même groupe.
            </p>
            <div className="mt-3">
              <GrantAccessForm tenants={tenants} />
            </div>
          </div>

          {groups.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-base font-semibold text-slate-900">Groupes</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {groups.map((g) => (
                  <li key={g.id} className="flex items-center justify-between">
                    <span className="text-slate-800">{g.name}</span>
                    <span className="text-xs text-slate-400">{g._count.tenants} site(s)</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
