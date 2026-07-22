import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { requireRoleCode } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { CourseForm } from '../course-form';
import { EnrollStudent, UnenrollButton } from '../enroll';
import { CreateSessionForm, GenerateBillingButton } from '../pedagogy';

export default async function SupportCourseDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireRoleCode(['tenant_admin', 'direction', 'cpe', 'scolarite']);
  const session = (await auth())!;
  const t = await getTranslations('admin.soutien');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const course = await tx.supportCourse.findUnique({
      where: { id },
      include: { slots: { orderBy: { startTime: 'asc' } } },
    });
    if (!course) return null;
    const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });

    const [subjects, teachers, levels, rooms, enrollments] = await Promise.all([
      tx.subject.findMany({ orderBy: [{ order: 'asc' }, { label: 'asc' }], select: { id: true, label: true } }),
      tx.person.findMany({ where: { type: 'TEACHER', deletedAt: null }, orderBy: [{ lastName: 'asc' }], select: { id: true, firstName: true, lastName: true } }),
      tx.level.findMany({ orderBy: { order: 'asc' }, select: { id: true, label: true } }),
      tx.room.findMany({ orderBy: { code: 'asc' }, select: { id: true, code: true, label: true } }),
      tx.supportEnrollment.findMany({
        where: { supportCourseId: id, status: 'ACTIVE', unenrolledAt: null },
        orderBy: { enrolledAt: 'asc' },
      }),
    ]);

    const [sessions, billedCount] = await Promise.all([
      tx.supportSession.findMany({ where: { supportCourseId: id }, orderBy: { date: 'desc' } }),
      tx.installment.count({ where: { supportCourseId: id } }),
    ]);
    // Nombre de ressources par séance.
    const resGroups = sessions.length
      ? await tx.supportResource.groupBy({ by: ['supportSessionId'], where: { supportSessionId: { in: sessions.map((s) => s.id) } }, _count: true })
      : [];
    const resBySession = new Map(resGroups.map((g) => [g.supportSessionId, g._count]));
    // Présents / absents par séance.
    const attGroups = sessions.length
      ? await tx.supportAttendance.groupBy({ by: ['sessionId', 'present'], where: { sessionId: { in: sessions.map((s) => s.id) } }, _count: true })
      : [];
    const presBySession = new Map<string, { present: number; absent: number }>();
    for (const g of attGroups) {
      const a = presBySession.get(g.sessionId) ?? { present: 0, absent: 0 };
      if (g.present) a.present = g._count;
      else a.absent = g._count;
      presBySession.set(g.sessionId, a);
    }

    const enrolledIds = new Set(enrollments.map((e) => e.studentId));
    const enrolledStudents = enrollments.length
      ? await tx.person.findMany({
          where: { id: { in: enrollments.map((e) => e.studentId) } },
          select: { id: true, firstName: true, lastName: true, studentClasses: { where: { unenrolledAt: null }, select: { class: { select: { name: true } } }, take: 1 } },
        })
      : [];
    const nameById = new Map(enrolledStudents.map((s) => [s.id, { name: `${s.lastName} ${s.firstName}`, className: s.studentClasses[0]?.class.name ?? null }]));

    // Élèves inscriptibles : élèves actifs non déjà inscrits à ce cours.
    const candidates = await tx.person.findMany({
      where: { type: 'STUDENT', deletedAt: null, enrollments: { some: { status: 'ACTIVE' } }, id: { notIn: [...enrolledIds] } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true },
    });

    return {
      course,
      subjects,
      teachers: teachers.map((p) => ({ id: p.id, label: `${p.lastName} ${p.firstName}` })),
      levels,
      rooms: rooms.map((r) => ({ id: r.id, label: `${r.code} — ${r.label}` })),
      enrollments: enrollments.map((e) => ({ ...e, ...nameById.get(e.studentId) })),
      candidates: candidates.map((s) => ({ id: s.id, label: `${s.lastName} ${s.firstName}` })),
      subjectLabel: subjects.find((s) => s.id === course.subjectId)?.label ?? '—',
      hasYear: !!year,
      sessions: sessions.map((se) => ({
        id: se.id,
        date: se.date.toISOString().slice(0, 10),
        topic: se.topic,
        present: presBySession.get(se.id)?.present ?? 0,
        absent: presBySession.get(se.id)?.absent ?? 0,
        resources: resBySession.get(se.id) ?? 0,
      })),
      billedCount,
    };
  });
  if (!data) notFound();

  const c = data.course;
  const currency = 'MAD';
  const fmt = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const priceLabel =
    c.pricingMode === 'FREE' ? t('free') : `${fmt(Number(c.price))} ${currency}${t(`pricingSuffix.${c.pricingMode}`)}`;
  const slotsLabel = c.slots
    .map((sl) => `${t(`days.${sl.dayOfWeek as 'MON'}`)} ${sl.startTime}${sl.endTime ? `–${sl.endTime}` : ''}`)
    .join(' · ');

  return (
    <div className="px-3 py-3">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/soutien`} className="hover:text-brand-700">📚 {t('title')}</Link>
        <span className="mx-1.5">›</span>
        <span>{c.title}</span>
      </nav>

      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{c.title}</h1>
          <p className="mt-0.5 text-sm text-slate-600">
            {data.subjectLabel}
            {slotsLabel ? ` · ${slotsLabel}` : ''}
            {' · '}
            {priceLabel}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Élèves affectés */}
        <section className="lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('studentsTitle', { count: data.enrollments.length })}</h2>
          <div className="mb-3 rounded-2xl border border-brand-200 bg-white p-4">
            <EnrollStudent courseId={c.id} students={data.candidates} />
            <p className="mt-2 text-[11px] text-slate-400">{t('enroll.hint')}</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="px-4 py-3 text-start">{t('col.student')}</th>
                  <th className="px-4 py-3 text-start">{t('col.class')}</th>
                  <th className="px-4 py-3 text-start">{t('col.mode')}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.enrollments.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{e.name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{e.className ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${e.recommended ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                        {e.recommended ? t('enroll.recommended') : t('enroll.volunteer')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-end">
                      <UnenrollButton courseId={c.id} studentId={e.studentId} />
                    </td>
                  </tr>
                ))}
                {data.enrollments.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">{t('noStudents')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Séances (P2) */}
        <section className="lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('session.title')}</h2>
          <div className="mb-3 rounded-2xl border border-brand-200 bg-white p-4">
            <CreateSessionForm courseId={c.id} />
          </div>
          <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="px-4 py-2.5 text-start">{t('session.date')}</th>
                  <th className="px-4 py-2.5 text-start">{t('session.topic')}</th>
                  <th className="px-4 py-2.5 text-end">{t('session.presentCount')}</th>
                  <th className="px-4 py-2.5 text-end">{t('session.absentCount')}</th>
                  <th className="px-4 py-2.5 text-end">{t('resource.short')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.sessions.map((se) => (
                  <tr key={se.id}>
                    <td className="px-4 py-2.5">
                      <Link href={`/${locale}/admin/soutien/${c.id}/seance/${se.id}`} className="font-medium text-brand-700 hover:underline">
                        {new Date(`${se.date}T00:00:00Z`).toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' })}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{se.topic ?? <span className="italic text-amber-600">{t('session.noTopic')}</span>}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums text-emerald-700">{se.present}</td>
                    <td className={`px-4 py-2.5 text-end tabular-nums ${se.absent > 0 ? 'text-red-700' : 'text-slate-400'}`}>{se.absent}</td>
                    <td className={`px-4 py-2.5 text-end tabular-nums ${se.resources > 0 ? 'text-brand-700' : 'text-slate-400'}`}>{se.resources > 0 ? `📎 ${se.resources}` : '—'}</td>
                  </tr>
                ))}
                {data.sessions.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">{t('session.empty')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Ressources + Facturation + Édition du cadre */}
        <aside className="space-y-4">
          {c.pricingMode !== 'FREE' && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('billing.title')}</h2>
              <p className="mb-2 text-xs text-slate-500">{t('billing.hint', { count: data.billedCount })}</p>
              <GenerateBillingButton courseId={c.id} />
            </div>
          )}

          <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('editTitle')}</h2>
          <div className="rounded-2xl border border-brand-200 bg-white p-4">
            <CourseForm
              subjects={data.subjects}
              teachers={data.teachers}
              levels={data.levels}
              rooms={data.rooms}
              initial={{
                id: c.id,
                title: c.title,
                subjectId: c.subjectId,
                teacherId: c.teacherId,
                levelId: c.levelId,
                pricingMode: c.pricingMode,
                price: Number(c.price),
                description: c.description,
                slots: c.slots.map((sl) => ({
                  dayOfWeek: sl.dayOfWeek,
                  startTime: sl.startTime,
                  endTime: sl.endTime,
                  roomId: sl.roomId ?? '',
                })),
              }}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
