import type { ReactNode } from 'react';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prismaAdmin, withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import { countTeacherMissingAppels } from '@/lib/teacher-attendance';
import { countUnreadConversations } from '@/lib/messaging';
import { TeacherSidebar } from './nav';
import { SignOutButton } from '../admin/sign-out-button';

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
          select: { firstName: true, lastName: true },
        })
      : null,
    missingAppels: teacherId ? await countTeacherMissingAppels(tx, teacherId, tz) : 0,
    unreadMessages: await countUnreadConversations(tx, session.user.id),
  }));
  const teacher = portal.teacher;
  const missingAppels = portal.missingAppels;
  const unreadMessages = portal.unreadMessages;
  const teacherName = teacher ? `${teacher.firstName} ${teacher.lastName}` : session.user.email!;
  const t = await getTranslations('enseignant');

  return (
    <div className="flex h-screen overflow-hidden bg-[#eef0f7] print:block print:h-auto print:overflow-visible print:bg-white">
      <div className="print:hidden">
        <TeacherSidebar
          locale={locale}
          tenantName={tenant?.name ?? ''}
          teacherName={teacherName}
          logoUrl={tenant?.logoFileId ? `/api/tenant/logo?v=${tenant.updatedAt.getTime()}` : null}
          appelBadge={missingAppels}
          messagesBadge={unreadMessages}
        />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden p-3 ps-0 print:overflow-visible print:p-0">
        <header className="relative mb-1 flex items-center justify-end gap-3 rounded-3xl bg-white px-5 py-2.5 shadow-sm print:hidden">
          {tenant?.name && (
            <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap bg-gradient-to-r from-[#1A56DB] to-[#123a8f] bg-clip-text text-lg font-bold text-transparent">
              {tenant.name}
            </span>
          )}
          <span className="text-[13px] text-slate-600">{session.user.email}</span>
          <SignOutButton
            label={t('signOut')}
            locale={locale}
            className="rounded-lg bg-[#1A56DB] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#143fa6]"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/jawal-logo.png" alt="Jawal" className="h-9 w-9 object-contain" />
        </header>
        <main className="flex-1 overflow-y-auto print:overflow-visible">{children}</main>
      </div>
    </div>
  );
}
