import Link from 'next/link';
import { ClassNav } from '../class-nav';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { readClassTimetableConstraints } from '@jawal/shared';
import { ConstraintsForm } from './client';

export default async function ClassConstraintsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
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
    <div className="mx-auto max-w-4xl px-6 py-8">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/classes`} className="hover:text-brand-700">
          {t('breadcrumbClasses')}
        </Link>
        <span className="mx-1.5">›</span>
        <Link href={`/${locale}/admin/classes/${cls.id}`} className="hover:text-brand-700">
          {cls.name}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{t('title')}</span>
      </nav>

      <header className="mb-5">
        <header className="mb-4 -mx-6 overflow-hidden rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">
          {t('title')} — {cls.name}
        </h1>
        <ClassNav classId={id} locale={locale} />
      </header>
        <p className="mt-1 text-sm text-slate-500">
          {cls.level.cycle.label} · {cls.level.label} · {cls.academicYear.label}
        </p>
        <p className="mt-3 text-sm text-slate-600">{t('subtitle')}</p>
      </header>

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
