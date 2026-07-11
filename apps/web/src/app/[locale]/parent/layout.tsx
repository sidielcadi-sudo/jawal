import type { ReactNode } from 'react';
import { TenantThemeStyle } from '@/components/tenant-theme-style';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prismaAdmin, withTenant } from '@/lib/db';
import { getParentChildren } from '@/lib/parent';
import { countUnreadCarnet } from '@/lib/carnet';
import { countPendingConsent } from '@/lib/exceptional-fees';
import { ParentSidebar } from './nav';
import { SignOutButton } from '../admin/sign-out-button';
import { PortalHeaderIcons } from '@/components/portal-header-icons';

export default async function ParentLayout({
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
  if (!session.user.isParent) redirect(`/${locale}/admin`);

  const tenantId = session.user.tenantId;
  const [tenant, kids] = await Promise.all([
    prismaAdmin.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, logoFileId: true, updatedAt: true },
    }),
    withTenant(tenantId, async (tx) => {
      const list = await getParentChildren(tx, session.user.id);
      const out: Array<(typeof list)[number] & { unread: number; pendingFees: number }> = [];
      for (const c of list)
        out.push({
          ...c,
          unread: await countUnreadCarnet(tx, c.id),
          pendingFees: await countPendingConsent(tx, [c.id]),
        });
      return out;
    }),
  ]);

  const t = await getTranslations('parent');

  return (
    <div className="flex h-screen overflow-hidden bg-[#eef0f7] print:block print:h-auto print:overflow-visible print:bg-white">
        <TenantThemeStyle />
      <div className="print:hidden">
        <ParentSidebar
          locale={locale}
          tenantName={tenant?.name ?? ''}
          logoUrl={tenant?.logoFileId ? `/api/tenant/logo?v=${tenant.updatedAt.getTime()}` : null}
          children={kids.map((c) => ({
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName,
            className: c.className,
            unread: c.unread,
            pendingFees: c.pendingFees,
          }))}
        />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden p-3 ps-0 print:overflow-visible print:p-0">
        <header className="relative mb-1 flex items-center justify-end gap-3 rounded-3xl bg-white px-5 py-2.5 shadow-sm print:hidden">
          {tenant?.name && (
            <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap bg-gradient-to-r from-brand-600 to-brand-800 bg-clip-text text-lg font-bold text-transparent">
              {tenant.name}
            </span>
          )}
          <PortalHeaderIcons
            locale={locale}
            messagesHref={`/${locale}/parent/messages`}
            messagesLabel={t('nav.messages')}
          />
          <span className="text-[13px] text-slate-600">{session.user.email}</span>
          <SignOutButton
            label={t('signOut')}
            locale={locale}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-brand-700"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/jawal-logo.png" alt="Jawal" className="h-9 w-9 object-contain" />
        </header>
        <main className="flex-1 overflow-y-auto print:overflow-visible">{children}</main>
      </div>
    </div>
  );
}
