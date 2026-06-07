import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { ClassForm } from '../class-form';

export default async function NewClassPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.classes');

  const { years, levels, teachers, rooms, activeYearId } = await withTenant(
    session.user.tenantId,
    async (tx) => {
      const [years, levels, teachers, rooms, activeYear] = await Promise.all([
        tx.academicYear.findMany({ orderBy: { startDate: 'desc' } }),
        tx.level.findMany({ include: { cycle: true }, orderBy: { order: 'asc' } }),
        tx.person.findMany({
          where: { type: 'TEACHER', deletedAt: null },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        }),
        tx.room.findMany({ orderBy: { code: 'asc' } }),
        tx.academicYear.findFirst({ where: { active: true } }),
      ]);
      return {
        years: years.map((y) => ({
          id: y.id,
          label: `${y.label}${y.active ? ' (actif)' : ''}`,
          isDefault: y.active,
        })),
        levels: levels.map((l) => ({ id: l.id, label: `${l.cycle.label} — ${l.label}` })),
        teachers: teachers.map((p) => ({ id: p.id, label: `${p.lastName} ${p.firstName}` })),
        rooms: rooms.map((r) => ({ id: r.id, label: `${r.code} — ${r.label}` })),
        activeYearId: activeYear?.id,
      };
    },
  );

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={`/${locale}/admin/classes`} className="hover:text-brand-700">
          {t('title')}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{t('actions.new')}</span>
      </nav>

      <h1 className="text-2xl font-semibold text-slate-900">{t('actions.new')}</h1>
      <p className="mt-1 text-sm text-slate-500">{t('newSubtitle')}</p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <ClassForm
          mode="create"
          locale={locale}
          years={years}
          levels={levels}
          teachers={teachers}
          rooms={rooms}
          initial={{ academicYearId: activeYearId }}
        />
      </div>
    </div>
  );
}
