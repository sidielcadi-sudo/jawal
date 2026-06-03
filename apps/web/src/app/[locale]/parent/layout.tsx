import type { ReactNode } from 'react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prismaAdmin, withTenant } from '@/lib/db';
import { getParentChildren } from '@/lib/parent';
import { ParentSidebar } from './nav';
import { SignOutButton } from '../admin/sign-out-button';

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
    prismaAdmin.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    withTenant(tenantId, (tx) => getParentChildren(tx, session.user.id)),
  ]);

  const t = await getTranslations('parent');

  return (
    <div className="flex min-h-screen bg-slate-50 print:block print:min-h-0 print:bg-white">
      <div className="print:hidden">
        <ParentSidebar
          locale={locale}
          tenantName={tenant?.name ?? ''}
          children={kids.map((c) => ({
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName,
            className: c.className,
          }))}
        />
      </div>

      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white print:hidden">
          <div className="flex items-center justify-end gap-3 px-6 py-3">
            <span className="text-sm text-slate-600">{session.user.email}</span>
            <SignOutButton label={t('signOut')} locale={locale} />
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
