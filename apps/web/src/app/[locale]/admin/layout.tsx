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

  const initial = (session.user.email ?? '?').charAt(0).toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8F9FB] print:block print:h-auto print:overflow-visible print:bg-white">
      <div className="print:hidden">
        <AdminSidebar locale={locale} tenantName={tenant?.name ?? ''} roleCodes={roleCodes} />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden print:overflow-visible">
        <header className="z-10 shrink-0 border-b border-[#E5E7EB] bg-white print:hidden">
          <div className="flex items-center justify-end gap-3 px-6 py-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                {initial}
              </span>
              <span className="text-sm text-slate-600">{session.user.email}</span>
            </div>
            <SignOutButton label={tAdmin('signOut')} locale={locale} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-[#F8F9FB] print:overflow-visible">{children}</main>
      </div>
    </div>
  );
}
