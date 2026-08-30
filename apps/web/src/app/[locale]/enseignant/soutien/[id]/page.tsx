import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import { CreateSessionForm } from '../../../admin/soutien/pedagogy';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';

const DOW_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/**
 * Portail enseignant — un de mes cours de soutien : élèves inscrits et
 * séances. Lecture seule sur le cadre (tarif, affectations) ; le prof crée ses
 * séances et entre dedans pour l'appel et les appréciations.
 *
 * La garde d'accès est le `teacherId` du cours : un prof qui tente l'URL d'un
 * cours qui n'est pas le sien obtient un 404, pas une page vide.
 */
export default async function TeacherSupportCoursePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('enseignant.soutien');
  const tAdmin = await getTranslations('admin.soutien');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, session.user.id);
    if (!teacherId) return null;

    const course = await tx.supportCourse.findFirst({
      where: { id, teacherId },
      include: { slots: { orderBy: { startTime: 'asc' } } },
    });
    if (!course) return null;

    const subject = await tx.subject.findUnique({
      where: { id: course.subjectId },
      select: { label: true },
    });

    const enrollments = await tx.supportEnrollment.findMany({
      where: { supportCourseId: id, status: 'ACTIVE', unenrolledAt: null },
      orderBy: { enrolledAt: 'asc' },
      select: { studentId: true, recommended: true },
    });
    const students = enrollments.length
      ? await tx.person.findMany({
          where: { id: { in: enrollments.map((e) => e.studentId) } },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          select: {
            id: true,
            firstName: true,
            firstNameAr: true,
            lastName: true,
            lastNameAr: true,
            studentClasses: {
              where: { unenrolledAt: null },
              select: { class: { select: { name: true, nameAr: true } } },
              take: 1,
            },
          },
        })
      : [];
    const recommendedById = new Map(enrollments.map((e) => [e.studentId, e.recommended]));

    const sessions = await tx.supportSession.findMany({
      where: { supportCourseId: id },
      orderBy: { date: 'desc' },
    });

    // Présents / absents et nb de ressources par séance.
    const ids = sessions.map((s) => s.id);
    const [attGroups, resGroups] = await Promise.all([
      ids.length
        ? tx.supportAttendance.groupBy({
            by: ['sessionId', 'present'],
            where: { sessionId: { in: ids } },
            _count: true,
          })
        : Promise.resolve([]),
      ids.length
        ? tx.supportResource.groupBy({
            by: ['supportSessionId'],
            where: { supportSessionId: { in: ids } },
            _count: true,
          })
        : Promise.resolve([]),
    ]);
    const presBySession = new Map<string, { present: number; absent: number }>();
    for (const g of attGroups) {
      const a = presBySession.get(g.sessionId) ?? { present: 0, absent: 0 };
      if (g.present) a.present = g._count;
      else a.absent = g._count;
      presBySession.set(g.sessionId, a);
    }
    const resBySession = new Map(resGroups.map((g) => [g.supportSessionId, g._count]));

    // Taux de présence global du cours — le seul indicateur utile au prof ici.
    const totalPresent = attGroups.filter((g) => g.present).reduce((s, g) => s + g._count, 0);
    const totalAll = attGroups.reduce((s, g) => s + g._count, 0);

    return {
      course,
      subject: subject?.label ?? '—',
      slots: [...course.slots].sort(
        (a, b) => DOW_ORDER.indexOf(a.dayOfWeek) - DOW_ORDER.indexOf(b.dayOfWeek),
      ),
      students: students.map((s) => ({
        id: s.id,
        name: personDisplayName(locale, s),
        className: localizedLabel(locale, s.studentClasses[0]?.class.name, s.studentClasses[0]?.class.nameAr) ?? null,
        recommended: recommendedById.get(s.id) ?? false,
      })),
      sessions: sessions.map((s) => ({
        id: s.id,
        date: s.date,
        topic: s.topic,
        pres: presBySession.get(s.id) ?? null,
        resources: resBySession.get(s.id) ?? 0,
      })),
      presenceRate: totalAll > 0 ? (totalPresent / totalAll) * 100 : null,
    };
  });

  if (!data) notFound();

  const dateFmt = (d: Date) =>
    new Date(d).toLocaleDateString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });

  return (
    <div className="px-3 py-3">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/enseignant/soutien`} className="hover:text-brand-700">
          📚 {t('title')}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{data.course.title}</span>
      </nav>

      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{data.course.title}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-slate-600">
            <span>📘 {data.subject}</span>
            {data.slots.length > 0 && (
              <span>
                🕒{' '}
                {data.slots
                  .map((s) => `${tAdmin(`days.${s.dayOfWeek}`)} ${s.startTime}–${s.endTime}`)
                  .join(' · ')}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Stat label={t('students')} value={String(data.students.length)} />
          <Stat label={t('sessions')} value={String(data.sessions.length)} />
          <Stat
            label={t('presenceRate')}
            value={data.presenceRate === null ? '—' : `${data.presenceRate.toFixed(0)}%`}
            tone="emerald"
          />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Séances */}
        <section className="lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">{tAdmin('session.title')}</h2>

          <div className="mb-3 rounded-2xl border border-brand-200 bg-white p-4">
            <CreateSessionForm courseId={data.course.id} />
          </div>

          <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
            <ul className="divide-y divide-slate-100">
              {data.sessions.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/${locale}/enseignant/soutien/${data.course.id}/seance/${s.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-brand-50/50"
                  >
                    <span className="min-w-[9rem] font-medium capitalize text-slate-900">
                      {dateFmt(s.date)}
                    </span>
                    <span className="flex-1 text-sm text-slate-600">
                      {s.topic ?? (
                        <em className="text-amber-700">{tAdmin('session.noTopic')}</em>
                      )}
                    </span>
                    {s.pres ? (
                      <span className="text-xs tabular-nums text-slate-500">
                        <span className="text-emerald-700">{s.pres.present}</span> /{' '}
                        <span className="text-red-600">{s.pres.absent}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-amber-700">{t('attendanceTodo')}</span>
                    )}
                    {s.resources > 0 && (
                      <span className="text-xs text-slate-400">
                        📎 {s.resources}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
              {data.sessions.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-slate-500">
                  {tAdmin('session.empty')}
                </li>
              )}
            </ul>
          </div>
        </section>

        {/* Élèves inscrits (lecture seule : l'affectation reste administrative) */}
        <aside>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">{tAdmin('studentsTitle')}</h2>
          <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
            <ul className="divide-y divide-slate-100">
              {data.students.map((s) => (
                <li key={s.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                  <span className="flex-1 text-slate-800">{s.name}</span>
                  {s.className && <span className="text-xs text-slate-400">{s.className}</span>}
                  {s.recommended && (
                    <span
                      className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                      title={t('recommendedHint')}
                    >
                      ★
                    </span>
                  )}
                </li>
              ))}
              {data.students.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-slate-500">
                  {tAdmin('noStudents')}
                </li>
              )}
            </ul>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">{t('enrollmentHint')}</p>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'emerald' }) {
  return (
    <div className="text-center">
      <div
        className={`text-lg font-bold tabular-nums ${tone === 'emerald' ? 'text-emerald-600' : 'text-brand-700'}`}
      >
        {value}
      </div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
