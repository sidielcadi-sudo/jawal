import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { AttendanceReasonsManager } from './client';
import { AppelPresenceToggle } from './presence-toggle';
import { readStaffAttendanceSettings } from '@/lib/staff-presence-from-appel';

export default async function AttendanceReasonsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.settings.attendanceReasons');
  const session = (await auth())!;

  const reasons = await withTenant(session.user.tenantId, (tx) =>
    tx.attendanceReason.findMany({
      orderBy: [{ order: 'asc' }, { label: 'asc' }],
      select: { id: true, label: true, color: true, order: true, active: true },
    }),
  );

  const tenant = await withTenant(session.user.tenantId, (tx) =>
    tx.tenant.findUnique({ where: { id: session.user.tenantId }, select: { settings: true } }),
  );
  const presence = readStaffAttendanceSettings(tenant?.settings);

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <AppelPresenceToggle enabled={presence.appelCountsAsPresence} />
      </div>
      <h2 className="text-lg font-semibold text-slate-900">{t('title')}</h2>
      <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      <div className="mt-5">
        <AttendanceReasonsManager reasons={reasons} />
      </div>
    </div>
  );
}
