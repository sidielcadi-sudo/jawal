import type { ReactNode } from 'react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { currentUserRoleCodes } from '@/lib/auth/rbac';
import { prismaAdmin } from '@/lib/db';
import { AdminSidebar } from './nav';
import { SignOutButton } from './sign-out-button';

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
      select: { id: true, name: true, profile: true },
    }),
    currentUserRoleCodes(),
  ]);

  const tAdmin = await getTranslations('admin');

  return (
    <div className="flex min-h-screen bg-slate-50 print:block print:min-h-0 print:bg-white">
      <div className="print:hidden">
        <AdminSidebar locale={locale} tenantName={tenant?.name ?? ''} roleCodes={roleCodes} />
      </div>

      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white print:hidden">
          <div className="flex items-center justify-end gap-3 px-6 py-3">
            <span className="text-sm text-slate-600">{session.user.email}</span>
            <SignOutButton label={tAdmin('signOut')} locale={locale} />
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
