import type { ReactNode } from 'react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prismaAdmin, withTenant } from '@/lib/db';
import { getStudentPersonId } from '@/lib/student';
import { StudentSidebar } from './nav';
import { SignOutButton } from '../admin/sign-out-button';

export default async function StudentLayout({
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
  if (!session.user.isStudent) redirect(`/${locale}/admin`);

  const tenantId = session.user.tenantId;
  const [tenant, header] = await Promise.all([
    prismaAdmin.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    withTenant(tenantId, async (tx) => {
      const studentId = await getStudentPersonId(tx, session.user.id);
      if (!studentId) return null;
      const p = await tx.person.findUnique({
        where: { id: studentId },
        select: { firstName: true, lastName: true },
      });
      const sc = await tx.studentClass.findFirst({
        where: { studentId, unenrolledAt: null, class: { academicYear: { active: true } } },
        select: { class: { select: { name: true } } },
      });
      return p ? { name: `${p.firstName} ${p.lastName}`, className: sc?.class.name ?? null } : null;
    }),
  ]);

  const t = await getTranslations('eleve');

  return (
    <div className="flex min-h-screen bg-slate-50 print:block print:min-h-0 print:bg-white">
      <div className="print:hidden">
        <StudentSidebar
          locale={locale}
          tenantName={tenant?.name ?? ''}
          studentName={header?.name ?? session.user.email ?? ''}
          className={header?.className ?? null}
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
