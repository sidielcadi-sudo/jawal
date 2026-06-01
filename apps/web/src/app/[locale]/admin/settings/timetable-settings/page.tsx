import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import {
  cycleHasOwnTimetableSettings,
  readTimetableSettings,
  TIMETABLE_SETTINGS_DEFAULTS,
} from '@jawal/shared';
import { SettingsManager, type CycleRow } from './client';

export default async function TimetableSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.timetableSettings');

  const { tenant, cycles } = await withTenant(session.user.tenantId, async (tx) => {
    const [tenant, cycles] = await Promise.all([
      tx.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId } }),
      tx.cycle.findMany({ orderBy: { order: 'asc' } }),
    ]);
    return { tenant, cycles };
  });

  const tenantSettings = readTimetableSettings(tenant.settings);
  const cycleRows: CycleRow[] = cycles.map((c) => ({
    id: c.id,
    code: c.code,
    label: c.label,
    hasOverride: cycleHasOwnTimetableSettings(c.settings),
    settings: cycleHasOwnTimetableSettings(c.settings)
      ? readTimetableSettings(c.settings)
      : TIMETABLE_SETTINGS_DEFAULTS,
  }));

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      </header>
      <SettingsManager
        locale={locale}
        tenantSettings={tenantSettings}
        cycles={cycleRows}
      />
    </div>
  );
}
