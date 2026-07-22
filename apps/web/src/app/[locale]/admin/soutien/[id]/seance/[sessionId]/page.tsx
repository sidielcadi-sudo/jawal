import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { requireRoleCode } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { AttendanceForm, SessionTopicEditor } from '../../../attendance-form';
import { ResourceManager } from '../../../pedagogy';
import { SessionSkillPicker, SessionCompetencyGrid } from '../../../session-skills';
import { loadActiveFramework, loadLeaves, loadMasteryScale } from '@/lib/competences';

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

export default async function SupportSessionPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; sessionId: string }>;
}) {
  const { locale, id, sessionId } = await params;
  setRequestLocale(locale);
  await requireRoleCode(['tenant_admin', 'direction', 'cpe', 'scolarite']);
  const session = (await auth())!;
  const t = await getTranslations('admin.soutien');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const sess = await tx.supportSession.findUnique({
      where: { id: sessionId },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            teacherId: true,
            slots: { select: { dayOfWeek: true, startTime: true, endTime: true } },
          },
        },
      },
    });
    if (!sess || sess.supportCourseId !== id) return null;
    const teacher = sess.course.teacherId
      ? await tx.person.findUnique({ where: { id: sess.course.teacherId }, select: { firstName: true, lastName: true } })
      : null;

    const enrollments = await tx.supportEnrollment.findMany({ where: { supportCourseId: id, status: 'ACTIVE', unenrolledAt: null }, select: { studentId: true } });
    const students = enrollments.length
      ? await tx.person.findMany({ where: { id: { in: enrollments.map((e) => e.studentId) } }, orderBy: [{ lastName: 'asc' }], select: { id: true, firstName: true, lastName: true } })
      : [];
    const attendance = await tx.supportAttendance.findMany({ where: { sessionId } });
    const attById = new Map(attendance.map((a) => [a.studentId, a]));
    const resources = await tx.supportResource.findMany({ where: { supportSessionId: sessionId }, orderBy: { createdAt: 'desc' }, select: { id: true, title: true, url: true } });

    // Compétences travaillées pendant la séance (P5) + évaluations déjà saisies.
    const framework = await loadActiveFramework(tx);
    const skillRows = await tx.supportSessionSkill.findMany({
      where: { supportSessionId: sessionId },
      select: { nodeId: true },
    });
    const targetedIds = new Set(skillRows.map((r) => r.nodeId));
    const leaves = framework ? await loadLeaves(tx, framework.id) : [];
    const scale = framework ? await loadMasteryScale(tx) : [];
    const period = await tx.period.findFirst({
      where: { startDate: { lte: sess.date }, endDate: { gte: sess.date } },
      select: { id: true },
    });
    const existingAssess = period
      ? await tx.competencyAssessment.findMany({
          where: {
            periodId: period.id,
            nodeId: { in: [...targetedIds] },
            studentId: { in: students.map((s) => s.id) },
            evaluatedByUserId: session.user.id,
          },
          select: { studentId: true, nodeId: true, masteryLevelId: true },
        })
      : [];

    return {
      sess,
      resources,
      teacherName: teacher ? `${teacher.lastName} ${teacher.firstName}` : null,
      framework,
      scale,
      hasPeriod: !!period,
      skillItems: leaves.map((l) => ({
        id: l.id,
        label: l.label,
        group: l.kind === 'TRANSVERSAL' ? 'Aptitudes transversales' : l.domain,
      })),
      targeted: leaves
        .filter((l) => targetedIds.has(l.id))
        .map((l) => ({ id: l.id, label: l.label, descriptor: l.descriptor })),
      assessByNode: Object.fromEntries(
        [...targetedIds].map((nodeId) => [
          nodeId,
          Object.fromEntries(
            existingAssess
              .filter((a) => a.nodeId === nodeId)
              .map((a) => [a.studentId, a.masteryLevelId as string | null]),
          ),
        ]),
      ),
      studentList: students.map((s) => ({ studentId: s.id, name: `${s.lastName} ${s.firstName}` })),
      rows: students.map((s) => {
        const a = attById.get(s.id);
        return { studentId: s.id, name: `${s.lastName} ${s.firstName}`, present: a?.present ?? true, appreciation: a?.appreciation ?? '' };
      }),
    };
  });
  if (!data) notFound();

  const dateLabel = new Date(data.sess.date).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  // Heure de la séance : créneau du cours correspondant au jour de la séance.
  const dow = DOW[new Date(data.sess.date).getUTCDay()];
  const slot = data.sess.course.slots.find((sl) => sl.dayOfWeek === dow) ?? data.sess.course.slots[0];
  const timeLabel = slot ? `${slot.startTime}${slot.endTime ? `–${slot.endTime}` : ''}` : null;

  return (
    <div className="px-3 py-3">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/soutien`} className="hover:text-brand-700">📚 {t('title')}</Link>
        <span className="mx-1.5">›</span>
        <Link href={`/${locale}/admin/soutien/${id}`} className="hover:text-brand-700">{data.sess.course.title}</Link>
        <span className="mx-1.5">›</span>
        <span className="capitalize">{dateLabel}</span>
      </nav>

      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold capitalize text-slate-900">{dateLabel}</h1>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-600">
          {timeLabel && <span>🕒 {timeLabel}</span>}
          {data.teacherName && <span>👩‍🏫 {data.teacherName}</span>}
          <span>📘 {data.sess.course.title}</span>
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-4 rounded-2xl border border-brand-200 bg-white p-4">
            <div className="mb-1 text-xs text-slate-500">{t('session.topic')}</div>
            <SessionTopicEditor sessionId={sessionId} topic={data.sess.topic} />
          </div>

          <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('session.attendanceTitle')}</h2>
          <AttendanceForm sessionId={sessionId} initial={data.rows} />

          {/* Compétences travaillées (P5) */}
          {data.framework && (
            <section className="mt-5">
              <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('skills.title')}</h2>
              <div className="rounded-2xl border border-brand-200 bg-white p-4">
                <p className="mb-2 text-[11px] text-slate-400">{t('skills.hint')}</p>
                <SessionSkillPicker
                  sessionId={sessionId}
                  items={data.skillItems}
                  selected={data.targeted.map((x) => x.id)}
                />

                {data.targeted.length > 0 && (
                  <div className="mt-3 space-y-3">
                    {!data.hasPeriod ? (
                      <p className="text-xs text-amber-700">{t('skills.noPeriod')}</p>
                    ) : (
                      data.targeted.map((n) => (
                        <SessionCompetencyGrid
                          key={n.id}
                          sessionId={sessionId}
                          node={n}
                          scale={data.scale}
                          students={data.studentList}
                          initial={data.assessByNode[n.id] ?? {}}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        <aside>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('resource.title')}</h2>
          <div className="rounded-2xl border border-brand-200 bg-white p-4">
            <p className="mb-2 text-[11px] text-slate-400">{t('resource.sessionHint')}</p>
            <ResourceManager sessionId={sessionId} resources={data.resources} />
          </div>
        </aside>
      </div>
    </div>
  );
}
