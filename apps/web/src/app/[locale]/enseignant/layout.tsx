import type { ReactNode } from 'react';
import { TenantThemeStyle } from '@/components/tenant-theme-style';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prismaAdmin, withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import { countTeacherMissingAppels } from '@/lib/teacher-attendance';
import { TeacherSidebar } from './nav';
import { SignOutButton } from '../admin/sign-out-button';
import { PortalHeaderIcons } from '@/components/portal-header-icons';

export default async function TeacherLayout({
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
  if (!session.user.isTeacher) redirect(`/${locale}/admin`);

  const tenantId = session.user.tenantId;
  const [tenant, teacherId] = await Promise.all([
    prismaAdmin.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, logoFileId: true, updatedAt: true, timezone: true },
    }),
    withTenant(tenantId, (tx) => getTeacherPersonId(tx, session.user.id)),
  ]);

  const tz = tenant?.timezone || 'Africa/Casablanca';
  const portal = await withTenant(tenantId, async (tx) => ({
    teacher: teacherId
      ? await tx.person.findUnique({
          where: { id: teacherId },
          select: { firstName: true, lastName: true, photoFileId: true },
        })
      : null,
    missingAppels: teacherId ? await countTeacherMissingAppels(tx, teacherId, tz) : 0,
  }));
  const teacher = portal.teacher;
  const missingAppels = portal.missingAppels;
  const photoUrl = teacher?.photoFileId ? `/api/admin/persons/${teacherId}/photo` : null;
  const logoUrl = tenant?.logoFileId ? `/api/tenant/logo?v=${tenant.updatedAt.getTime()}` : null;
  const t = await getTranslations('enseignant');

  return (
    <div className="flex h-screen overflow-hidden bg-[#eef0f7] print:block print:h-auto print:overflow-visible print:bg-white">
        <TenantThemeStyle />
      <div className="print:hidden">
        <TeacherSidebar locale={locale} photoUrl={photoUrl} appelBadge={missingAppels} />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden p-3 ps-0 print:overflow-visible print:p-0">
        <header className="relative mb-1 flex items-center justify-between gap-3 rounded-2xl bg-white px-5 py-2.5 shadow-sm print:hidden">
          {/* Logo établissement — à gauche */}
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-9 w-auto object-contain" />
          ) : (
            <span />
          )}

          {/* Titre — au centre de la bande */}
          {tenant?.name && (
            <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap bg-gradient-to-r from-brand-600 to-brand-800 bg-clip-text text-lg font-bold text-transparent">
              {tenant.name}
            </span>
          )}

          {/* Contrôles + logo établissement — à droite */}
          <div className="flex items-center gap-3">
            <PortalHeaderIcons
              locale={locale}
              messagesHref={`/${locale}/enseignant/messages`}
              messagesLabel={t('nav.messages')}
            />
            <span className="text-[13px] text-slate-600">{session.user.email}</span>
            <SignOutButton
              label={t('signOut')}
              locale={locale}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-700"
            />
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-9 w-auto object-contain" />
            )}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto print:overflow-visible">{children}</main>
      </div>
    </div>
  );
}
