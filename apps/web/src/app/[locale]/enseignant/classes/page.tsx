import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';

export default async function TeacherClassesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('enseignant.classes');

  const rows = await withTenant(session.user.tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, session.user.id);
    const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
    if (!teacherId || !year) return [];

    const assignments = await tx.teacherAssignment.findMany({
      where: { teacherId, academicYearId: year.id },
      select: {
        classId: true,
        subject: { select: { label: true } },
        class: { select: { name: true, level: { select: { label: true } } } },
      },
      orderBy: [{ class: { name: 'asc' } }],
    });
    if (assignments.length === 0) return [];

    const classIds = [...new Set(assignments.map((a) => a.classId))];
    const counts = await tx.studentClass.groupBy({
      by: ['classId'],
      where: { classId: { in: classIds }, unenrolledAt: null },
      _count: { _all: true },
    });
    const countByClass = new Map(counts.map((c) => [c.classId, c._count._all]));

    return assignments.map((a) => ({
      classId: a.classId,
      className: a.class.name,
      levelLabel: a.class.level.label,
      subject: a.subject.label,
      students: countByClass.get(a.classId) ?? 0,
    }));
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">{t('empty')}</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {rows.map((r, i) => (
            <li
              key={`${r.classId}-${i}`}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4"
            >
              <div>
                <div className="font-medium text-slate-900">{r.className}</div>
                <div className="text-xs text-slate-500">
                  {r.levelLabel} · {r.subject}
                </div>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                {t('studentCount', { count: r.students })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
