import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { AssignmentCreateForm, AssignmentRowActions } from './client';

export default async function AssignmentsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin.persons');
  const tA = await getTranslations('admin.persons.assignments');

  const session = (await auth())!;
  const { teacher, assignments, subjects, classes, years } = await withTenant(
    session.user.tenantId,
    async (tx) => {
      const teacher = await tx.person.findUnique({ where: { id } });
      if (!teacher || teacher.type !== 'TEACHER') {
        return { teacher: null, assignments: [], subjects: [], classes: [], years: [] };
      }
      const [assignments, subjects, classes, years] = await Promise.all([
        tx.teacherAssignment.findMany({
          where: { teacherId: id },
          include: {
            subject: true,
            class: true,
            academicYear: true,
          },
          orderBy: [{ academicYear: { startDate: 'desc' } }, { subject: { label: 'asc' } }],
        }),
        tx.subject.findMany({ orderBy: [{ order: 'asc' }, { label: 'asc' }] }),
        tx.class.findMany({
          where: { deletedAt: null },
          include: { academicYear: true },
          orderBy: [{ academicYear: { startDate: 'desc' } }, { name: 'asc' }],
        }),
        tx.academicYear.findMany({ orderBy: { startDate: 'desc' } }),
      ]);
      return { teacher, assignments, subjects, classes, years };
    },
  );

  if (!teacher) notFound();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={`/${locale}/admin/persons?type=TEACHER`} className="hover:text-brand-700">
          {t('title.TEACHER')}
        </Link>
        <span className="mx-1.5">›</span>
        <Link href={`/${locale}/admin/persons/${id}`} className="hover:text-brand-700">
          {teacher.lastName} {teacher.firstName}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{tA('title')}</span>
      </nav>

      <h1 className="text-2xl font-semibold text-slate-900">{tA('title')}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {tA('subtitle', { name: `${teacher.lastName} ${teacher.firstName}` })}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-[#A9EAFE] text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="px-4 py-3 text-start">{tA('table.subject')}</th>
                  <th className="px-4 py-3 text-start">{tA('table.class')}</th>
                  <th className="px-4 py-3 text-start">{tA('table.year')}</th>
                  <th className="px-4 py-3 text-end">{tA('table.hours')}</th>
                  <th className="px-4 py-3 text-end">{tA('table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assignments.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{a.subject.label}</td>
                    <td className="px-4 py-3 text-slate-700">{a.class.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{a.academicYear.label}</td>
                    <td className="px-4 py-3 text-end text-xs text-slate-500">
                      {a.hoursPerWeek ? `${a.hoursPerWeek} h` : '—'}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <AssignmentRowActions teacherId={id} assignmentId={a.id} />
                    </td>
                  </tr>
                ))}
                {assignments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                      {tA('empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">{tA('create')}</h2>
            <p className="mt-1 text-xs text-slate-500">{tA('createHint')}</p>
            <div className="mt-4">
              <AssignmentCreateForm
                teacherId={id}
                subjects={subjects.map((s) => ({ id: s.id, label: s.label }))}
                classes={classes.map((c) => ({
                  id: c.id,
                  name: c.name,
                  academicYearId: c.academicYearId,
                  academicYearLabel: c.academicYear.label,
                }))}
                years={years.map((y) => ({ id: y.id, label: y.label, active: y.active }))}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
