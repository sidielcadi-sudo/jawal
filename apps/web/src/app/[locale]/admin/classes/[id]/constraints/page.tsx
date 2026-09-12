import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { readClassTimetableConstraints } from '@jawal/shared';
import { ConstraintsForm } from './client';
import { localizedLabel } from '@/lib/localized-name';
import { ClassHeader, CLASS_PAGE_SHELL } from '../class-header';

export default async function ClassConstraintsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const tCrumb = await getTranslations('admin.classes.detail');
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.classConstraints');

  const { cls, slots } = await withTenant(session.user.tenantId, async (tx) => {
    const cls = await tx.class.findUnique({
      where: { id },
      include: { level: { include: { cycle: true } }, academicYear: true },
    });
    if (!cls) return { cls: null, slots: [] };
    const slots = await tx.timetableSlot.findMany({
      orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
    });
    return { cls, slots };
  });

  if (!cls) notFound();

  const constraints = readClassTimetableConstraints(cls.metadata);

  return (
    <div className={CLASS_PAGE_SHELL}>
      <ClassHeader cls={cls} locale={locale} current={tCrumb('timetableConstraints')} />
      <p className="mt-4 text-sm text-slate-600">{t('subtitle')}</p>

      <ConstraintsForm
        classId={cls.id}
        locale={locale}
        initial={constraints}
        slots={slots.map((s) => ({
          id: s.id,
          startTime: s.startTime,
          endTime: s.endTime,
          label: s.label,
          isBreak: s.isBreak,
        }))}
      />
    </div>
  );
}
