import type { ReactNode } from 'react';
import { TenantThemeStyle } from '@/components/tenant-theme-style';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { currentUserRoleCodes } from '@/lib/auth/rbac';
import { prismaAdmin, withTenant } from '@/lib/db';
import { countMissingAppels } from '@/lib/teacher-attendance';
import { AdminSidebar } from './nav';
import { SignOutButton } from './sign-out-button';
import { SiteSwitcher } from './site-switcher';
import { PortalHeaderIcons } from '@/components/portal-header-icons';

export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) redirect(`/${locale}/login`);
  if (session.user.isSuperAdmin) redirect(`/${locale}/super-admin/tenants`);
  if (session.user.isParent) redirect(`/${locale}/parent`);
  if (session.user.isTeacher) redirect(`/${locale}/enseignant`);

  const [tenant, roleCodes] = await Promise.all([
    prismaAdmin.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { id: true, name: true, profile: true, logoFileId: true, updatedAt: true, timezone: true },
    }),
    currentUserRoleCodes(),
  ]);

  // Badge « appels non faits » du jour — seul le rôle CPE voit l'entrée Vie scolaire.
  const vieScolaireBadge = roleCodes.includes('cpe')
    ? await withTenant(session.user.tenantId, (tx) =>
        countMissingAppels(tx, tenant?.timezone || 'Africa/Casablanca'),
      )
    : 0;

  const tAdmin = await getTranslations('admin');
  const logoUrl = tenant?.logoFileId ? `/api/tenant/logo?v=${tenant.updatedAt.getTime()}` : null;

  return (
    <div className="flex h-screen overflow-hidden bg-[#eef0f7] print:block print:h-auto print:overflow-visible print:bg-white">
        <TenantThemeStyle />
      <div className="print:hidden">
        <AdminSidebar
          locale={locale}
          roleCodes={roleCodes}
          vieScolaireBadge={vieScolaireBadge}
          multiSite={session.user.sites.length > 1}
        />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden p-3 ps-0 print:overflow-visible print:p-0">
        <header className="relative z-10 mb-1 flex shrink-0 items-center justify-between gap-3 rounded-2xl bg-white px-5 py-2.5 shadow-sm print:hidden">
          {tenant?.name && (
            <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap bg-gradient-to-r from-brand-600 to-brand-800 bg-clip-text text-lg font-bold text-transparent">
              {tenant.name}
            </span>
          )}
          {/* Gauche : logo de l'établissement, puis sélecteur (multi-sites) */}
          <div className="flex items-center gap-3">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={tenant?.name ?? ''} className="h-9 w-auto object-contain" />
            )}
            <SiteSwitcher sites={session.user.sites} activeTenantId={session.user.tenantId} />
          </div>
          {/* Droite : messages, alertes, compte */}
          <div className="flex items-center gap-2">
            <PortalHeaderIcons
              locale={locale}
              messagesHref={`/${locale}/admin/messages`}
              messagesLabel={tAdmin('nav.messages')}
            />
            <span className="ms-1 text-[13px] text-slate-600">{session.user.email}</span>
            <SignOutButton
              label={tAdmin('signOut')}
              locale={locale}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-700"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/jawal-logo.png" alt="LeadSchool" className="h-9 w-9 object-contain" />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto print:overflow-visible">{children}</main>
      </div>
    </div>
  );
}
