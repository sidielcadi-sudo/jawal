import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { ClassActions } from './class-actions';
import { ClassHeader, CLASS_PAGE_SHELL } from './class-header';
import { ClassKpis } from './class-kpis-cards';
import { DelegateSelect } from './delegate-select';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';

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

  const { cls, lastSession, curriculum, assignments, programSource, kpiData } = await withTenant(tenantId, async (tx) => {
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
    if (!cls)
      return {
        cls: null,
        lastSession: null,
        curriculum: [],
        assignments: [],
        programSource: 'level' as const,
        kpiData: null,
      };

    // Programme de la classe : au lycée il est porté par la FILIÈRE, ailleurs
    // par le niveau. Lire le seul CurriculumSubject affichait « aucun programme
    // défini » sur toutes les classes de lycée, dont le programme existe bel et
    // bien — dans TrackSubjectCoefficient.
    const [trackProgram, levelProgram, assignments] = await Promise.all([
      cls.trackId
        ? tx.trackSubjectCoefficient.findMany({
            where: { trackId: cls.trackId },
            include: { subject: true },
            orderBy: { subject: { label: 'asc' } },
          })
        : Promise.resolve([]),
      tx.curriculumSubject.findMany({
        where: { levelId: cls.levelId },
        include: { subject: true },
        orderBy: [{ order: 'asc' }, { subject: { label: 'asc' } }],
      }),
      tx.teacherAssignment.findMany({
        where: { classId: id, academicYearId: cls.academicYearId },
        include: { subject: true, teacher: true },
      }),
    ]);

    type ProgramRow = {
      id: string;
      subjectId: string;
      subject: (typeof levelProgram)[number]['subject'];
      coefficient: number;
      weeklyHours: number;
    };
    const curriculum: ProgramRow[] =
      trackProgram.length > 0
        ? trackProgram.map((r) => ({
            id: r.id,
            subjectId: r.subjectId,
            subject: r.subject,
            // Au lycée le coefficient de contrôle continu est celui qui pèse
            // sur la moyenne de la classe ; c'est donc lui qu'on affiche ici.
            coefficient: r.ccCoefficient ?? 0,
            weeklyHours: r.weeklyHours ?? 0,
          }))
        : levelProgram.map((r) => ({
            id: r.id,
            subjectId: r.subjectId,
            subject: r.subject,
            coefficient: r.coefficient,
            weeklyHours: r.weeklyHours,
          }));
    const programSource = trackProgram.length > 0 ? ('track' as const) : ('level' as const);

    /* ── Mesures des cartes ─────────────────────────────────────────── */
    //
    // Période courante : celle qui contient la date du jour, sinon la dernière
    // commencée. Hors période (vacances), un indicateur vide ne dirait rien
    // alors que le trimestre écoulé a du sens.
    const periods = await tx.period.findMany({
      where: { academicYearId: cls.academicYearId },
      orderBy: { startDate: 'asc' },
      select: { id: true, label: true, startDate: true, endDate: true },
    });
    const now = new Date();
    const period =
      periods.find((x) => x.startDate <= now && now <= x.endDate) ??
      [...periods].reverse().find((x) => x.startDate <= now) ??
      periods[0] ??
      null;

    const studentIds = cls.students.map((sc) => sc.studentId);

    const [classGrades, schoolGrades, attendanceRows, dueRows] = await Promise.all([
      period
        ? tx.grade.findMany({
            where: { value: { not: null }, evaluation: { periodId: period.id, classId: id } },
            select: {
              studentId: true,
              value: true,
              evaluation: {
                select: { weight: true, maxValue: true, subject: { select: { coefficient: true } } },
              },
            },
          })
        : Promise.resolve([]),
      // Référence de comparaison : tout l'établissement sur la même période.
      // averageWithDelta en retire ensuite les élèves de la classe.
      period
        ? tx.grade.findMany({
            where: { value: { not: null }, evaluation: { periodId: period.id } },
            select: {
              studentId: true,
              value: true,
              evaluation: {
                select: { weight: true, maxValue: true, subject: { select: { coefficient: true } } },
              },
            },
          })
        : Promise.resolve([]),
      tx.attendanceRecord.groupBy({
        by: ['status'],
        where: {
          session: {
            classId: id,
            ...(period ? { date: { gte: period.startDate, lte: period.endDate } } : {}),
          },
        },
        _count: { _all: true },
      }),
      // Règlement : les échéances DÉJÀ TOMBÉES des élèves de la classe.
      studentIds.length > 0
        ? tx.installment.findMany({
            where: {
              studentId: { in: studentIds },
              status: { not: 'CANCELLED' },
              dueDate: { gte: cls.academicYear.startDate, lte: now },
            },
            select: { amount: true, payments: { select: { amount: true } } },
          })
        : Promise.resolve([]),
    ]);

    const toGradeRow = (r: {
      studentId: string;
      value: number | null;
      evaluation: { weight: number; maxValue: number; subject: { coefficient: number } };
    }) => ({
      studentId: r.studentId,
      value: Number(r.value),
      weight: r.evaluation.weight,
      maxValue: r.evaluation.maxValue,
      coefficient: r.evaluation.subject.coefficient,
    });

    const counts = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const r of attendanceRows) {
      if (r.status === 'PRESENT') counts.present += r._count._all;
      else if (r.status === 'ABSENT') counts.absent += r._count._all;
      else if (r.status === 'LATE') counts.late += r._count._all;
      else counts.excused += r._count._all;
    }

    let dueToDate = 0;
    let paidToDate = 0;
    for (const i of dueRows) {
      dueToDate += Number(i.amount);
      paidToDate += i.payments.reduce((n, x) => n + Number(x.amount), 0);
    }

    const kpiData = {
      periodLabel: period?.label ?? null,
      classGrades: classGrades.map(toGradeRow),
      schoolGrades: schoolGrades.map(toGradeRow),
      counts,
      dueToDate,
      paidToDate,
    };

    // Dernier appel finalisé sur cette classe
    const lastSession = await tx.attendanceSession.findFirst({
      where: { classId: id, finalizedAt: { not: null } },
      orderBy: { date: 'desc' },
      include: { records: { select: { status: true } } },
    });

    return { cls, lastSession, curriculum, assignments, programSource, kpiData };
  });

  if (!cls) notFound();

  const usagePct = (cls.students.length / cls.capacity) * 100;

  return (
    <div className={CLASS_PAGE_SHELL}>
      <ClassHeader cls={cls} locale={locale} />

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <section className="rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-700">{tDetail('students')}</h2>
              <span className="text-xs text-slate-500">
                {cls.students.length}/{cls.capacity}
              </span>
            </div>

            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
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
                      {/* Le délégué est marqué d'un D : il est l'interlocuteur
                          de la classe, et le retrouver dans une liste de trente
                          noms sans repère visuel est une perte de temps. */}
                      {sc.student.id === cls.delegateId && (
                        <span
                          title={tDetail('delegate')}
                          className="me-2 inline-grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-[11px] font-bold text-white"
                        >
                          D
                        </span>
                      )}
                      <Link
                        href={`/${locale}/admin/persons/${sc.student.id}`}
                        className="hover:text-brand-700 hover:underline"
                      >
                        {personDisplayName(locale, sc.student)}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {new Date(sc.enrolledAt).toLocaleDateString(locale)}
                    </td>
                    <td className="px-4 py-2 text-end">
                      {/* « Désinscrire » retiré : la désinscription se fait
                          depuis la scolarité de l'élève, où l'on voit ce qu'elle
                          entraîne (créances, EDT, dossier). Ici on consulte. */}
                      <Link
                        href={`/${locale}/admin/persons/${sc.student.id}`}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {tDetail('view')}
                      </Link>
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
          {/* Les mesures de la classe, en tête de colonne. Elles remplacent le
              bloc « Inscrire un élève » : rattacher un élève se fait depuis son
              dossier — où l'on voit son niveau, sa filière et ses frais — et
              non depuis la classe, où rien de tout cela n'est visible. */}
          {kpiData && (
            <ClassKpis
              enrolled={cls.students.length}
              capacity={cls.capacity}
              periodLabel={kpiData.periodLabel}
              classGrades={kpiData.classGrades}
              schoolGrades={kpiData.schoolGrades}
              counts={kpiData.counts}
              dueToDate={kpiData.dueToDate}
              paidToDate={kpiData.paidToDate}
            />
          )}

          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-700">{tDetail('delegate')}</h2>
            <p className="mt-1 text-xs text-slate-500">{tDetail('delegateHint')}</p>
            <div className="mt-3">
              <DelegateSelect
                classId={cls.id}
                delegateId={cls.delegateId}
                students={cls.students.map((sc) => ({
                  id: sc.student.id,
                  label: personDisplayName(locale, sc.student),
                }))}
                disabled={!!cls.deletedAt}
              />
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

      {/* Programme du niveau × profs affectés */}
      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-slate-900">{tDetail('programme')}</h2>
          {curriculum.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              {programSource === 'track'
                ? tDetail('programmeFromTrack')
                : tDetail('programmeFromLevel')}
            </span>
          )}
        </div>
        <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
              <tr>
                <th className="px-4 py-3 text-start">{tDetail('subject')}</th>
                <th className="px-4 py-3 text-end">{tDetail('coefficient')}</th>
                <th className="px-4 py-3 text-end">{tDetail('weeklyHours')}</th>
                <th className="px-4 py-3 text-end">{tDetail('hoursAssigned')}</th>
                <th className="px-4 py-3 text-start">{tDetail('teachers')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {curriculum.map((c) => {
                const subjectAssignments = assignments.filter((a) => a.subjectId === c.subjectId);
                const totalAssigned = subjectAssignments.reduce(
                  (s, a) => s + (a.hoursPerWeek ?? 0),
                  0,
                );
                const deltaOk = Math.abs(totalAssigned - c.weeklyHours) < 0.01;
                const noTeacher = subjectAssignments.length === 0;
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{localizedLabel(locale, c.subject.label, c.subject.labelAr)}</td>
                    <td className="px-4 py-3 text-end tabular-nums">×{c.coefficient}</td>
                    <td className="px-4 py-3 text-end tabular-nums">{c.weeklyHours} h</td>
                    <td className="px-4 py-3 text-end">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          noTeacher
                            ? 'bg-red-100 text-red-700'
                            : deltaOk
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {totalAssigned} h
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {subjectAssignments.length === 0
                        ? tDetail('noTeacher')
                        : subjectAssignments
                            .map((a) => personDisplayName(locale, a.teacher))
                            .join(', ')}
                    </td>
                  </tr>
                );
              })}
              {curriculum.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-500">
                    {tDetail('programmeEmpty')}
                    <Link
                      href={
                        cls.trackId
                          ? `/${locale}/admin/settings/curriculum/programme?cycle=${cls.level.cycleId}&track=${cls.trackId}`
                          : `/${locale}/admin/settings/curriculum/programme?level=${cls.levelId}`
                      }
                      className="ms-2 text-brand-700 hover:underline"
                    >
                      {tDetail('configureProgramme')} →
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
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
