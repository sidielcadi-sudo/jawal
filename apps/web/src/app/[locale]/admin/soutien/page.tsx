import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { requireRoleCode } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { CourseForm } from './course-form';
import { SoutienTabs } from './tabs';

export default async function SoutienPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoleCode(['tenant_admin', 'direction', 'cpe', 'scolarite']);
  const session = (await auth())!;
  const t = await getTranslations('admin.soutien');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
    const [subjects, teachers, levels, rooms, courses] = await Promise.all([
      tx.subject.findMany({ orderBy: [{ order: 'asc' }, { label: 'asc' }], select: { id: true, label: true } }),
      tx.person.findMany({ where: { type: 'TEACHER', deletedAt: null }, orderBy: [{ lastName: 'asc' }], select: { id: true, firstName: true, lastName: true } }),
      tx.level.findMany({ orderBy: { order: 'asc' }, select: { id: true, label: true } }),
      tx.room.findMany({ orderBy: { code: 'asc' }, select: { id: true, code: true, label: true } }),
      tx.supportCourse.findMany({
        where: year ? { academicYearId: year.id } : undefined,
        orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
        include: { _count: { select: { enrollments: { where: { status: 'ACTIVE' } }, slots: true } } },
      }),
    ]);
    const subjectById = new Map(subjects.map((s) => [s.id, s.label]));
    const teacherById = new Map(teachers.map((p) => [p.id, `${p.lastName} ${p.firstName}`]));
    return {
      subjects,
      teachers: teachers.map((p) => ({ id: p.id, label: `${p.lastName} ${p.firstName}` })),
      levels,
      rooms: rooms.map((r) => ({ id: r.id, label: `${r.code} — ${r.label}` })),
      courses: courses.map((c) => ({
        id: c.id,
        title: c.title,
        subject: subjectById.get(c.subjectId) ?? '—',
        teacher: c.teacherId ? teacherById.get(c.teacherId) ?? null : null,
        pricingMode: c.pricingMode,
        price: Number(c.price),
        active: c.active,
        count: c._count.enrollments,
        sessions: c._count.slots,
      })),
    };
  });

  const currency = 'MAD';
  const fmt = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const priceLabel = (mode: string, price: number) =>
    mode === 'FREE' ? t('free') : `${fmt(price)} ${currency}${t(`pricingSuffix.${mode}`)}`;

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">📚 {t('title')}</h1>
        <p className="mt-0.5 text-sm text-slate-600">{t('subtitle')}</p>
      </header>

      <SoutienTabs locale={locale} active="manage" />

      <section className="mb-5 overflow-hidden rounded-2xl border border-brand-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-4 py-3 text-start">{t('col.course')}</th>
              <th className="px-4 py-3 text-start">{t('col.subject')}</th>
              <th className="px-4 py-3 text-start">{t('col.teacher')}</th>
              <th className="px-4 py-3 text-end">{t('col.sessions')}</th>
              <th className="px-4 py-3 text-end">{t('col.students')}</th>
              <th className="px-4 py-3 text-end">{t('col.price')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.courses.map((c) => (
              <tr key={c.id} className={c.active ? '' : 'opacity-50'}>
                <td className="px-4 py-3 font-medium text-slate-900">
                  <Link href={`/${locale}/admin/soutien/${c.id}`} className="hover:text-brand-700 hover:underline">
                    {c.title}
                  </Link>
                  {!c.active && <span className="ms-1 text-[10px] text-slate-400">({t('archived')})</span>}
                </td>
                <td className="px-4 py-3 text-slate-600">{c.subject}</td>
                <td className="px-4 py-3 text-slate-600">{c.teacher ?? '—'}</td>
                <td className="px-4 py-3 text-end tabular-nums text-slate-600">{c.sessions}</td>
                <td className="px-4 py-3 text-end tabular-nums text-slate-700">{c.count}</td>
                <td className="px-4 py-3 text-end tabular-nums text-slate-700">
                  {priceLabel(c.pricingMode, c.price)}
                </td>
              </tr>
            ))}
            {data.courses.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">{t('empty')}</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border border-brand-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('newCourse')}</h2>
        <CourseForm subjects={data.subjects} teachers={data.teachers} levels={data.levels} rooms={data.rooms} />
      </section>
    </div>
  );
}
