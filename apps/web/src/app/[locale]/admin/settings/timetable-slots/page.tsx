import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { SlotsManager } from './client';

export default async function TimetableSlotsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.timetableSlots');

  const slots = await withTenant(session.user.tenantId, (tx) =>
    tx.timetableSlot.findMany({ orderBy: [{ order: 'asc' }, { startTime: 'asc' }] }),
  );

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      </header>

      <SlotsManager
        locale={locale}
        initialSlots={slots.map((s) => ({
          id: s.id,
          startTime: s.startTime,
          endTime: s.endTime,
          label: s.label,
          isBreak: s.isBreak,
          order: s.order,
        }))}
      />
    </div>
  );
}
