import Link from 'next/link';
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

    // Deux sources : les affectations (planification) ET l'EDT généré.
    // L'EDT survit à une réinitialisation des affectations, donc on les unit
    // pour rester cohérent avec la page emploi du temps (qui lit l'EDT).
    const select = {
      classId: true,
      subjectId: true,
      subject: { select: { label: true } },
      class: { select: { name: true, level: { select: { label: true } } } },
    } as const;
    const [assignments, entries] = await Promise.all([
      tx.teacherAssignment.findMany({ where: { teacherId, academicYearId: year.id }, select }),
      tx.timetableEntry.findMany({ where: { teacherId, academicYearId: year.id }, select }),
    ]);

    // Dédup par (classe × matière).
    const map = new Map<
      string,
      {
        classId: string;
        subjectId: string | null;
        className: string;
        levelLabel: string;
        subject: string;
      }
    >();
    for (const a of [...assignments, ...entries]) {
      const key = `${a.classId}|${a.subjectId ?? 'none'}`;
      if (!map.has(key)) {
        map.set(key, {
          classId: a.classId,
          subjectId: a.subjectId ?? null,
          className: a.class.name,
          levelLabel: a.class.level.label,
          subject: a.subject?.label ?? '—',
        });
      }
    }
    if (map.size === 0) return [];

    const classIds = [...new Set([...map.values()].map((r) => r.classId))];
    const counts = await tx.studentClass.groupBy({
      by: ['classId'],
      where: { classId: { in: classIds }, unenrolledAt: null },
      _count: { _all: true },
    });
    const countByClass = new Map(counts.map((c) => [c.classId, c._count._all]));

    return [...map.values()]
      .sort(
        (a, b) => a.className.localeCompare(b.className) || a.subject.localeCompare(b.subject),
      )
      .map((r) => ({ ...r, students: countByClass.get(r.classId) ?? 0 }));
  });

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden rounded-3xl bg-gradient-to-r from-[#e8edff] to-[#eef0ff] px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
      </header>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">{t('empty')}</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {rows.map((r, i) => {
            const inner = (
              <>
                <div>
                  <div className="font-medium text-slate-900">{r.className}</div>
                  <div className="text-xs text-slate-500">
                    {r.levelLabel} · {r.subject}
                  </div>
                </div>
                <span className="flex items-center gap-3">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    {t('studentCount', { count: r.students })}
                  </span>
                  {r.subjectId && <span className="text-brand-600 text-sm">{t('openGrades')} ›</span>}
                </span>
              </>
            );
            const cls =
              'flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4';
            return (
              <li key={`${r.classId}-${i}`}>
                {r.subjectId ? (
                  <Link
                    href={`/${locale}/enseignant/classes/${r.classId}/grades/${r.subjectId}`}
                    className={`${cls} transition-colors hover:border-brand-300 hover:bg-brand-50/40`}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className={cls}>{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
