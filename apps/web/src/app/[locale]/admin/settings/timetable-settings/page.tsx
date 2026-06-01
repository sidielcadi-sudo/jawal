import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { readTimetableSettings } from '@jawal/shared';
import { SettingsForm } from './client';

export default async function TimetableSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.timetableSettings');

  const tenant = await withTenant(session.user.tenantId, (tx) =>
    tx.tenant.findUniqueOrThrow({ where: { id: session.user.tenantId } }),
  );
  const settings = readTimetableSettings(tenant.settings);

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      </header>
      <SettingsForm locale={locale} initial={settings} />
    </div>
  );
}
