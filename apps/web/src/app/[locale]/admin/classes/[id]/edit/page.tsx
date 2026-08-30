import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { ClassForm } from '../../class-form';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';

export default async function EditClassPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.classes');

  const { cls, years, levels, teachers, rooms } = await withTenant(session.user.tenantId, async (tx) => {
    const [cls, years, levels, teachers, rooms] = await Promise.all([
      tx.class.findUnique({ where: { id } }),
      tx.academicYear.findMany({ orderBy: { startDate: 'desc' } }),
      tx.level.findMany({ include: { cycle: true }, orderBy: { order: 'asc' } }),
      tx.person.findMany({
        where: { type: 'TEACHER', deletedAt: null },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      tx.room.findMany({ orderBy: { code: 'asc' } }),
    ]);
    return {
      cls,
      years: years.map((y) => ({ id: y.id, label: y.label })),
      levels: levels.map((l) => ({ id: l.id, label: `${localizedLabel(locale, l.cycle.label, l.cycle.labelAr)} — ${localizedLabel(locale, l.label, l.labelAr)}` })),
      teachers: teachers.map((p) => ({ id: p.id, label: personDisplayName(locale, p) })),
      rooms: rooms.map((r) => ({ id: r.id, label: `${r.code} — ${r.label}` })),
    };
  });

  if (!cls) notFound();

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={`/${locale}/admin/classes`} className="hover:text-brand-700">
          {t('title')}
        </Link>
        <span className="mx-1.5">›</span>
        <Link href={`/${locale}/admin/classes/${id}`} className="hover:text-brand-700">
          {localizedLabel(locale, cls.name, cls.nameAr)}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{t('actions.edit')}</span>
      </nav>

      <h1 className="mb-4 -mx-6 overflow-hidden rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-3 text-2xl font-semibold text-slate-900">
        {t('actions.edit')} — {localizedLabel(locale, cls.name, cls.nameAr)}
      </h1>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <ClassForm
          mode="edit"
          locale={locale}
          years={years}
          levels={levels}
          teachers={teachers}
          rooms={rooms}
          initial={{
            id: cls.id,
            name: localizedLabel(locale, cls.name, cls.nameAr),
            capacity: cls.capacity,
            academicYearId: cls.academicYearId,
            levelId: cls.levelId,
            mainTeacherId: cls.mainTeacherId,
            homeRoomId: (cls.metadata as { homeRoomId?: string } | null)?.homeRoomId ?? null,
          }}
        />
      </div>
    </div>
  );
}
