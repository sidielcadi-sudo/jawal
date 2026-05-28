import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { ClassActions } from './class-actions';
import { EnrollmentManager } from './enrollment-manager';

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const tenantId = session.user.tenantId;
  const t = await getTranslations('admin.classes');
  const tDetail = await getTranslations('admin.classes.detail');

  const { cls, availableStudents, lastSession } = await withTenant(tenantId, async (tx) => {
    const cls = await tx.class.findUnique({
      where: { id },
      include: {
        level: { include: { cycle: true } },
        academicYear: true,
        mainTeacher: true,
        students: {
          where: { unenrolledAt: null },
          include: { student: true },
          orderBy: { student: { lastName: 'asc' } },
        },
      },
    });
    if (!cls) return { cls: null, availableStudents: [], lastSession: null };

    // Élèves disponibles : tous les STUDENT actifs qui ne sont PAS déjà
    // inscrits activement à cette classe (pas dans la liste students[]).
    const enrolledIds = cls.students.map((sc) => sc.studentId);
    const availableStudents = await tx.person.findMany({
      where: {
        type: 'STUDENT',
        deletedAt: null,
        id: { notIn: enrolledIds },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 200,
    });

    // Dernier appel finalisé sur cette classe
    const lastSession = await tx.attendanceSession.findFirst({
      where: { classId: id, finalizedAt: { not: null } },
      orderBy: { date: 'desc' },
      include: { records: { select: { status: true } } },
    });

    return { cls, availableStudents, lastSession };
  });

  if (!cls) notFound();

  const usagePct = (cls.students.length / cls.capacity) * 100;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={`/${locale}/admin/classes`} className="hover:text-brand-700">
          {t('title')}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{cls.name}</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {cls.name}
            {cls.deletedAt && (
              <span className="ms-3 rounded bg-slate-200 px-2 py-0.5 align-middle text-xs text-slate-600">
                {t('archived')}
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {cls.level.cycle.label} — {cls.level.label} · {cls.academicYear.label}
            {cls.mainTeacher
              ? ` · ${tDetail('mainTeacher')} : ${cls.mainTeacher.lastName} ${cls.mainTeacher.firstName}`
              : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!cls.deletedAt && (
            <>
              <Link
                href={`/${locale}/admin/classes/${cls.id}/attendance`}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700"
              >
                {tDetail('takeAttendance')}
              </Link>
              <Link
                href={`/${locale}/admin/classes/${cls.id}/grades`}
                className="rounded-lg border border-brand-300 bg-white px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
              >
                {tDetail('manageGrades')}
              </Link>
            </>
          )}
          <ClassActions classId={cls.id} isArchived={!!cls.deletedAt} locale={locale} />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <section className="rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-700">{tDetail('students')}</h2>
              <span className="text-xs text-slate-500">
                {cls.students.length}/{cls.capacity}
              </span>
            </div>

            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-start">{tDetail('table.name')}</th>
                  <th className="px-4 py-2 text-start">{tDetail('table.enrolledAt')}</th>
                  <th className="px-4 py-2 text-end">{tDetail('table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cls.students.map((sc) => (
                  <tr key={sc.id}>
                    <td className="px-4 py-2">
                      <Link
                        href={`/${locale}/admin/persons/${sc.student.id}`}
                        className="hover:text-brand-700 hover:underline"
                      >
                        {sc.student.lastName} {sc.student.firstName}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {new Date(sc.enrolledAt).toLocaleDateString(locale)}
                    </td>
                    <td className="px-4 py-2 text-end">
                      <UnenrollButton
                        classId={cls.id}
                        studentId={sc.studentId}
                        label={tDetail('unenroll')}
                      />
                    </td>
                  </tr>
                ))}
                {cls.students.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-xs text-slate-500">
                      {tDetail('noStudents')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>

        <aside>
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-700">{tDetail('enroll')}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {tDetail('availableCount', { count: availableStudents.length })}
            </p>
            <div className="mt-3">
              <EnrollmentManager
                classId={cls.id}
                students={availableStudents.map((s) => ({
                  id: s.id,
                  label: `${s.lastName} ${s.firstName}`,
                }))}
                disabled={
                  !!cls.deletedAt || cls.students.length >= cls.capacity
                }
              />
              {cls.students.length >= cls.capacity && !cls.deletedAt && (
                <p className="mt-2 text-xs text-amber-700">{tDetail('capacityReached')}</p>
              )}
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-slate-500">
                {tDetail('utilization')}
              </span>
              <span className="text-sm font-semibold text-slate-900">{Math.round(usagePct)}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full ${
                  usagePct >= 100
                    ? 'bg-red-500'
                    : usagePct >= 90
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, usagePct)}%` }}
              />
            </div>
          </section>

          {lastSession && (
            <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
              <span className="text-xs uppercase tracking-wide text-slate-500">
                {tDetail('lastAttendance')}
              </span>
              <LastAttendance
                date={lastSession.date}
                records={lastSession.records}
                locale={locale}
              />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function UnenrollButton({
  classId,
  studentId,
  label,
}: {
  classId: string;
  studentId: string;
  label: string;
}) {
  return (
    <form
      action={async () => {
        'use server';
        const { unenrollStudentAction } = await import('../actions');
        await unenrollStudentAction(classId, studentId);
      }}
    >
      <button
        type="submit"
        className="text-xs text-red-600 hover:text-red-800 hover:underline"
      >
        {label}
      </button>
    </form>
  );
}

function LastAttendance({
  date,
  records,
  locale,
}: {
  date: Date;
  records: { status: string }[];
  locale: string;
}) {
  const total = records.length || 1;
  const present = records.filter((r) => r.status === 'PRESENT').length;
  const absent = records.filter((r) => r.status === 'ABSENT').length;
  const late = records.filter((r) => r.status === 'LATE').length;
  const rate = Math.round((present / total) * 100);
  return (
    <>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-2xl font-semibold text-slate-900">{rate}%</span>
        <span className="text-xs text-slate-500">{new Date(date).toLocaleDateString(locale)}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
        <div>
          <div className="font-semibold text-emerald-700">{present}</div>
          <div className="text-slate-500">P</div>
        </div>
        <div>
          <div className="font-semibold text-red-700">{absent}</div>
          <div className="text-slate-500">A</div>
        </div>
        <div>
          <div className="font-semibold text-amber-700">{late}</div>
          <div className="text-slate-500">R</div>
        </div>
      </div>
    </>
  );
}
