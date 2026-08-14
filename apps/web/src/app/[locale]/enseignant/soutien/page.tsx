import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';

const DOW_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/**
 * Portail enseignant — mes cours de soutien.
 *
 * Le prof ne voit que les cours dont il est le titulaire (`teacherId`). Le
 * cadre (création du cours, affectation des élèves, tarif) reste côté
 * administration ; ici on entre par la pédagogie : séances, appel, acquis.
 */
export default async function TeacherSupportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('enseignant.soutien');
  const tAdmin = await getTranslations('admin.soutien');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, session.user.id);
    if (!teacherId) return null;

    const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
    const courses = await tx.supportCourse.findMany({
      where: { teacherId, ...(year ? { academicYearId: year.id } : {}) },
      include: {
        slots: { orderBy: { startTime: 'asc' } },
        _count: { select: { enrollments: { where: { status: 'ACTIVE' } }, sessions: true } },
      },
      orderBy: [{ active: 'desc' }, { title: 'asc' }],
    });

    const subjects = await tx.subject.findMany({ select: { id: true, label: true } });
    const subjectById = new Map(subjects.map((s) => [s.id, s.label]));

    // Dernière séance saisie par cours, pour situer le prof d'un coup d'œil.
    const courseIds = courses.map((c) => c.id);
    const lastSessions = courseIds.length
      ? await tx.supportSession.findMany({
          where: { supportCourseId: { in: courseIds } },
          orderBy: { date: 'desc' },
          select: { supportCourseId: true, date: true },
        })
      : [];
    const lastByCourse = new Map<string, Date>();
    for (const s of lastSessions) {
      if (!lastByCourse.has(s.supportCourseId)) lastByCourse.set(s.supportCourseId, s.date);
    }

    return {
      rows: courses.map((c) => ({
        id: c.id,
        title: c.title,
        subject: subjectById.get(c.subjectId) ?? '—',
        active: c.active,
        students: c._count.enrollments,
        sessions: c._count.sessions,
        lastSession: lastByCourse.get(c.id) ?? null,
        slots: [...c.slots].sort(
          (a, b) => DOW_ORDER.indexOf(a.dayOfWeek) - DOW_ORDER.indexOf(b.dayOfWeek),
        ),
      })),
    };
  });

  if (!data) {
    return (
      <div className="px-3 py-3">
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
          {t('noTeacher')}
        </p>
      </div>
    );
  }

  const dateFmt = (d: Date) =>
    new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">📚 {t('title')}</h1>
        <p className="mt-0.5 text-sm text-slate-600">{t('subtitle')}</p>
      </header>

      {data.rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          {t('empty')}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data.rows.map((c) => (
            <Link
              key={c.id}
              href={`/${locale}/enseignant/soutien/${c.id}`}
              className={`block rounded-2xl border border-brand-200 bg-white p-4 shadow-sm transition-colors hover:border-brand-400 hover:bg-brand-50/40 ${
                c.active ? '' : 'opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold text-slate-900">{c.title}</h2>
                {!c.active && (
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                    {t('archived')}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{c.subject}</p>

              {c.slots.length > 0 && (
                <p className="mt-2 text-xs text-slate-600">
                  🕒{' '}
                  {c.slots
                    .map((s) => `${tAdmin(`days.${s.dayOfWeek}`)} ${s.startTime}–${s.endTime}`)
                    .join(' · ')}
                </p>
              )}

              <div className="mt-3 flex items-center gap-4 border-t border-slate-100 pt-3 text-xs">
                <span className="text-slate-700">
                  <strong className="tabular-nums">{c.students}</strong> {t('students')}
                </span>
                <span className="text-slate-700">
                  <strong className="tabular-nums">{c.sessions}</strong> {t('sessions')}
                </span>
                <span className="ms-auto text-slate-400">
                  {c.lastSession ? `${t('lastSession')} ${dateFmt(c.lastSession)}` : t('noSession')}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
