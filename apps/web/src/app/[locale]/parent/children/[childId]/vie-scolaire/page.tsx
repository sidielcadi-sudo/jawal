import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { loadParentChildContext } from '@/lib/parent';
import { loadStudentCarnet } from '@/lib/carnet';
import { AcknowledgeCarnet } from '@/components/carnet/acknowledge-carnet';
import { TimetableGridReadonly, type ReadonlyEntry } from '@/components/timetable-grid-readonly';
import { DayTimetable, type DayCourse } from '@/components/day-timetable';
import { loadActiveFramework } from '@/lib/competences';
import { computeReports, rateColor } from '@/lib/competency-report';
import { pickPeriodId } from '@/lib/periods';
import { ChildTabs } from '../tabs';
import { JustifyButton } from '../justify-button';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const DOW_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export default async function ParentChildVieScolairePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; childId: string }>;
  searchParams: Promise<{ tab?: string; sub?: string; date?: string }>;
}) {
  const { locale, childId } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('parent.child');
  // Défaut : « Aujourd'hui » (vue par jour).
  const tab =
    sp.tab === 'carnet' ||
    sp.tab === 'equipe' ||
    sp.tab === 'edt' ||
    sp.tab === 'soutien' ||
    sp.tab === 'competences'
      ? sp.tab
      : 'jour';
  const sub = sp.sub === 'retard' || sp.sub === 'autres' ? sp.sub : 'absence';
  // Vue « Par jour » : date demandée (?date=YYYY-MM-DD) sinon aujourd'hui.
  const selectedDate =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : ymd(new Date());

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const ctx = await loadParentChildContext(tx, session.user.id, childId);
    if (!ctx) return null;

    const slots =
      tab === 'edt'
        ? await tx.timetableSlot.findMany({ orderBy: [{ order: 'asc' }, { startTime: 'asc' }] })
        : [];
    const entries =
      tab === 'edt' && ctx.classId && ctx.year
        ? await tx.timetableEntry.findMany({
            where: { classId: ctx.classId, academicYearId: ctx.year.id },
            include: {
              subject: { select: { label: true, labelAr: true } },
              teacher: { select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } },
              room: { select: { label: true, labelAr: true } },
            },
          })
        : [];

    // Vue « Par jour » : cours de la classe le jour sélectionné, + overrides
    // APPROUVÉS de cette date (annulation → rouge, remplacement → prof remplaçant).
    const dayCode = DOW_CODES[new Date(`${selectedDate}T00:00:00.000Z`).getUTCDay()]!;
    const dayEntries =
      tab === 'jour' && ctx.classId && ctx.year
        ? await tx.timetableEntry.findMany({
            where: { classId: ctx.classId, academicYearId: ctx.year.id, dayOfWeek: dayCode },
            include: {
              slot: { select: { startTime: true, endTime: true, order: true, isBreak: true } },
              subject: { select: { label: true, labelAr: true } },
              teacher: { select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } },
              room: { select: { label: true, labelAr: true, code: true } },
            },
            orderBy: { slot: { order: 'asc' } },
          })
        : [];
    const dayOverrides =
      tab === 'jour' && dayEntries.length
        ? await tx.timetableOverride.findMany({
            where: {
              entryId: { in: dayEntries.map((e) => e.id) },
              date: new Date(`${selectedDate}T00:00:00.000Z`),
              approvalStatus: 'APPROVED',
            },
            include: { substituteTeacher: { select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } } },
          })
        : [];

    const carnet =
      tab === 'carnet'
        ? await loadStudentCarnet(tx, childId, { forParents: true })
        : { entries: [], events: [] };

    // À justifier : UNIQUEMENT les événements CONFIRMÉS par la Vie scolaire
    // (l'appel brut n'est jamais exposé). Non encore justifiés (ou rejetés).
    const justifySince = new Date(Date.now() - 60 * 86_400_000);
    const toJustify =
      tab === 'carnet'
        ? await tx.attendanceEvent.findMany({
            where: {
              studentId: childId,
              status: 'CONFIRMED',
              category: { in: ['ABSENCE', 'RETARD'] },
              date: { gte: justifySince },
              attendanceRecord: {
                OR: [{ justification: { is: null } }, { justification: { status: 'REJECTED' } }],
              },
            },
            include: {
              attendanceRecord: { select: { id: true, note: true } },
              session: { select: { periodLabel: true, class: { select: { name: true, nameAr: true } } } },
            },
            orderBy: { date: 'desc' },
            take: 50,
          })
        : [];
    const justifyReasons =
      tab === 'carnet'
        ? await tx.attendanceReason.findMany({
            where: { active: true, forJustification: true },
            orderBy: { order: 'asc' },
            select: { id: true, label: true },
          })
        : [];

    const team =
      tab === 'equipe' && ctx.classId && ctx.year
        ? await tx.teacherAssignment.findMany({
            where: { classId: ctx.classId, academicYearId: ctx.year.id },
            include: {
              subject: { select: { label: true, labelAr: true } },
              teacher: { select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } },
            },
            orderBy: { subject: { label: 'asc' } },
          })
        : [];
    const mainTeacher =
      tab === 'equipe' && ctx.classId
        ? (
            await tx.class.findUnique({
              where: { id: ctx.classId },
              select: { mainTeacher: { select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } } },
            })
          )?.mainTeacher ?? null
        : null;

    // Soutien scolaire : cours suivis par l'enfant + séances (thème, présence,
    // appréciation) — rapport de suivi côté parent.
    let support: {
      courseTitle: string;
      subject: string;
      teacher: string | null;
      sessions: {
        date: string;
        time: string | null;
        topic: string | null;
        present: boolean | null;
        appreciation: string | null;
        resources: { id: string; title: string; url: string }[];
      }[];
    }[] = [];
    if (tab === 'soutien') {
      const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
      const enrollments = await tx.supportEnrollment.findMany({
        where: { studentId: childId, status: 'ACTIVE', unenrolledAt: null },
        select: {
          supportCourseId: true,
          course: {
            select: {
              title: true,
              subjectId: true,
              teacherId: true,
              slots: { select: { dayOfWeek: true, startTime: true, endTime: true } },
            },
          },
        },
      });
      if (enrollments.length) {
        const subjectIds = [...new Set(enrollments.map((e) => e.course.subjectId))];
        const subjects = await tx.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, label: true } });
        const subjById = new Map(subjects.map((s) => [s.id, s.label]));
        const teacherIds = [...new Set(enrollments.map((e) => e.course.teacherId).filter((x): x is string => !!x))];
        const teachers = teacherIds.length
          ? await tx.person.findMany({ where: { id: { in: teacherIds } }, select: { id: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } })
          : [];
        const teacherById = new Map(teachers.map((p) => [p.id, personDisplayName(locale, p)]));
        const courseIds = enrollments.map((e) => e.supportCourseId);
        const sessions = await tx.supportSession.findMany({ where: { supportCourseId: { in: courseIds } }, orderBy: { date: 'desc' }, select: { id: true, supportCourseId: true, date: true, topic: true } });
        const attendance = await tx.supportAttendance.findMany({ where: { studentId: childId, session: { supportCourseId: { in: courseIds } } }, select: { sessionId: true, present: true, appreciation: true } });
        const attBySession = new Map(attendance.map((a) => [a.sessionId, a]));
        const resList = sessions.length
          ? await tx.supportResource.findMany({ where: { supportSessionId: { in: sessions.map((s) => s.id) } }, orderBy: { createdAt: 'desc' }, select: { id: true, title: true, url: true, supportSessionId: true } })
          : [];
        const resBySession = new Map<string, { id: string; title: string; url: string }[]>();
        for (const r of resList) {
          const arr = resBySession.get(r.supportSessionId!) ?? [];
          arr.push({ id: r.id, title: r.title, url: r.url });
          resBySession.set(r.supportSessionId!, arr);
        }
        support = enrollments.map((e) => {
          const slots = e.course.slots;
          return {
            courseTitle: e.course.title,
            subject: subjById.get(e.course.subjectId) ?? '—',
            teacher: e.course.teacherId ? teacherById.get(e.course.teacherId) ?? null : null,
            sessions: sessions
              .filter((se) => se.supportCourseId === e.supportCourseId)
              .map((se) => {
                const a = attBySession.get(se.id);
                const dow = DOW[se.date.getUTCDay()];
                const slot = slots.find((sl) => sl.dayOfWeek === dow) ?? slots[0];
                return {
                  date: se.date.toISOString().slice(0, 10),
                  time: slot ? `${slot.startTime}${slot.endTime ? `–${slot.endTime}` : ''}` : null,
                  topic: se.topic,
                  present: a?.present ?? null,
                  appreciation: a?.appreciation ?? null,
                  resources: resBySession.get(se.id) ?? [],
                };
              }),
          };
        });
      }
    }

    // Onglet « Compétences » : bilan figé si disponible, sinon calcul à la volée
    // (marqué provisoire), avec la période précédente pour la progression.
    let competences: {
      periodLabel: string;
      provisional: boolean;
      report: import('@/lib/competency-report').StudentReport;
      previous: Map<string, number> | null;
      scale: { code: string; label: string; color: string }[];
    } | null = null;
    if (tab === "competences" && ctx.year) {
      const klass = ctx.classId
        ? await tx.class.findUnique({ where: { id: ctx.classId }, select: { levelId: true } })
        : null;
      const framework = await loadActiveFramework(tx);
      const periods = await tx.period.findMany({
        where: { academicYearId: ctx.year.id },
        orderBy: { startDate: 'asc' },
        select: { id: true, label: true },
      });
      const current = pickPeriodId(
        await tx.period.findMany({
          where: { academicYearId: ctx.year.id },
          orderBy: { startDate: 'asc' },
          select: { id: true, startDate: true, endDate: true },
        }),
      );
      const periodId = current ?? periods[periods.length - 1]?.id ?? null;
      if (framework && periodId) {
        const idx = periods.findIndex((p) => p.id === periodId);
        const prevId = idx > 0 ? periods[idx - 1]!.id : null;

        const frozen = await tx.competencyReport.findUnique({
          where: { studentId_periodId: { studentId: childId, periodId } },
          select: { data: true },
        });
        let report: import('@/lib/competency-report').StudentReport;
        let provisional = false;
        if (frozen) {
          report = frozen.data as unknown as import('@/lib/competency-report').StudentReport;
        } else {
          const live = await computeReports(tx, {
            frameworkId: framework.id,
            periodId,
            studentIds: [childId],
            levelId: klass?.levelId ?? null,
          });
          report = live.get(childId)!;
          provisional = true;
        }

        // Période précédente → flèches de progression par domaine.
        let previous: Map<string, number> | null = null;
        if (prevId) {
          const prevFrozen = await tx.competencyReport.findUnique({
            where: { studentId_periodId: { studentId: childId, periodId: prevId } },
            select: { data: true },
          });
          const prevReport = prevFrozen
            ? (prevFrozen.data as unknown as import('@/lib/competency-report').StudentReport)
            : (await computeReports(tx, {
                frameworkId: framework.id,
                periodId: prevId,
                studentIds: [childId],
                levelId: klass?.levelId ?? null,
              })).get(childId) ?? null;
          if (prevReport) {
            previous = new Map(
              prevReport.domains.filter((d) => d.rate !== null).map((d) => [d.id, d.rate!]),
            );
          }
        }

        const scaleRows = await tx.masteryLevel.findMany({ orderBy: { order: 'asc' } });
        competences = {
          periodLabel: periods.find((p) => p.id === periodId)?.label ?? '',
          provisional,
          report,
          previous,
          scale: scaleRows.map((m) => ({ code: m.code, label: m.labelFr, color: m.color })),
        };
      }
    }

    return { ctx, slots, entries, dayEntries, dayOverrides, carnet, team, mainTeacher, toJustify, justifyReasons, support, competences };
  });
  if (!data) notFound();

  const base = `/${locale}/parent/children/${childId}/vie-scolaire`;
  const dayLabels = Object.fromEntries(DAYS.map((d) => [d, t(`edt.days.${d}`)]));
  const gridEntries: ReadonlyEntry[] = data.entries.map((e) => ({
    dayOfWeek: e.dayOfWeek,
    slotId: e.slotId,
    subjectLabel: e.subject?.label ?? null,
    teacherName: e.teacher ? personDisplayName(locale, e.teacher) : null,
    roomLabel: e.room?.label ?? null,
  }));

  // Cours du jour (onglet « Par jour ») avec les overrides approuvés appliqués.
  const overrideByEntry = new Map(data.dayOverrides.map((o) => [o.entryId, o]));
  const dayCourses: DayCourse[] = data.dayEntries.map((e) => {
    const ov = overrideByEntry.get(e.id);
    return {
      startTime: e.slot.startTime,
      endTime: e.slot.endTime,
      subject: e.subject?.label ?? null,
      teacher: e.teacher ? personDisplayName(locale, e.teacher) : null,
      room: e.room?.label ?? e.room?.code ?? null,
      isBreak: e.slot.isBreak,
      cancelled: ov?.kind === 'CANCELLED',
      substituteName:
        ov?.kind === 'SUBSTITUTION' && ov.substituteTeacher
          ? personDisplayName(locale, ov.substituteTeacher)
          : null,
    };
  });
  // Navigation date (jour précédent / suivant / aujourd'hui).
  const dayMs = 86_400_000;
  const selDate = new Date(`${selectedDate}T00:00:00.000Z`);
  const prevDate = ymd(new Date(selDate.getTime() - dayMs));
  const nextDate = ymd(new Date(selDate.getTime() + dayMs));
  const dayHref = (d: string) => `${base}?tab=jour&date=${d}`;
  const dateLabel = selDate.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  return (
    <>
      <ChildTabs
        current={tab}
        tabs={[
          { key: 'jour', label: t('vieScolaire.tabDay'), href: `${base}?tab=jour` },
          { key: 'edt', label: t('vieScolaire.tabEdt'), href: `${base}?tab=edt` },
          { key: 'carnet', label: t('vieScolaire.tabCarnet'), href: `${base}?tab=carnet` },
          { key: 'competences', label: t('vieScolaire.tabCompetences'), href: `${base}?tab=competences` },
          { key: 'soutien', label: t('vieScolaire.tabSupport'), href: `${base}?tab=soutien` },
          { key: 'equipe', label: t('vieScolaire.tabTeam'), href: `${base}?tab=equipe` },
        ]}
      />

      {tab === 'competences' ? (
        !data.competences || data.competences.report.total === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
            {t('competences.empty')}
          </p>
        ) : (
          <div className="space-y-4">
            {/* Bandeau : période, taux globaux, mention provisoire */}
            <div className="rounded-2xl border border-brand-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800">
                  {data.competences.periodLabel}
                  {data.competences.provisional && (
                    <span className="ms-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                      {t('competences.provisional')}
                    </span>
                  )}
                </h3>
                <span className="text-xs text-slate-400">
                  {t('competences.coverage', {
                    covered: data.competences.report.covered,
                    total: data.competences.report.total,
                  })}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {(
                  [
                    ['DISCIPLINARY', t('competences.disciplinary'), data.competences.report.disciplinaryRate],
                    ['TRANSVERSAL', t('competences.transversal'), data.competences.report.transversalRate],
                  ] as const
                ).map(([k, label, rate]) => (
                  <div key={k} className="rounded-xl border border-slate-200 p-3 text-center">
                    <div className="text-xs text-slate-500">{label}</div>
                    <div className="text-2xl font-bold tabular-nums" style={{ color: rateColor(rate) }}>
                      {rate === null ? '—' : `${Math.round(rate)}%`}
                    </div>
                  </div>
                ))}
              </div>
              {/* Légende de l'échelle — indispensable pour un parent */}
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                {data.competences.scale.map((m) => (
                  <span key={m.code} className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                    {m.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Détail par domaine, séparé en Compétences / Aptitudes */}
            {(['DISCIPLINARY', 'TRANSVERSAL'] as const).map((kind) => {
              const doms = data.competences!.report.domains
                .map((d) => ({ id: d.id, label: d.label, comps: d.competencies.filter((c) => c.kind === kind && c.total > 0) }))
                .filter((d) => d.comps.length > 0);
              if (doms.length === 0) return null;
              return (
                <section key={kind} className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
                  <div className="border-b border-slate-100 bg-brand-50 px-4 py-2.5">
                    <h3 className="text-sm font-semibold text-brand-800">
                      {kind === 'DISCIPLINARY' ? t('competences.disciplinary') : t('competences.transversal')}
                    </h3>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {doms.map((d) => {
                      const rates = d.comps.filter((c) => c.rate !== null).map((c) => c.rate!);
                      const domRate = rates.length ? rates.reduce((s, r) => s + r, 0) / rates.length : null;
                      return (
                        <li key={d.id} className="px-4 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-medium text-slate-800">{d.label}</span>
                            <span className="text-sm font-bold tabular-nums" style={{ color: rateColor(domRate) }}>
                              {domRate === null ? '—' : `${Math.round(domRate)}%`}
                            </span>
                          </div>
                          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${domRate ?? 0}%`, backgroundColor: rateColor(domRate) }}
                            />
                          </div>
                          <ul className="mt-2 space-y-1">
                            {d.comps.map((c) => (
                              <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
                                <span className="truncate text-slate-600">{c.label}</span>
                                <span className="shrink-0 tabular-nums" style={{ color: rateColor(c.rate) }}>
                                  {c.rate === null ? '—' : `${Math.round(c.rate)}%`}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )
      ) : tab === 'soutien' ? (
        data.support.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
            {t('support.empty')}
          </p>
        ) : (
          <div className="space-y-4">
            {data.support.map((c) => (
              <section key={c.courseTitle} className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
                <div className="border-b border-slate-100 bg-brand-50 px-4 py-2.5">
                  <h3 className="text-sm font-semibold text-brand-800">📚 {c.courseTitle}</h3>
                  <p className="text-xs text-slate-500">
                    {c.subject}
                    {c.teacher && <span> · 👩‍🏫 {c.teacher}</span>}
                  </p>
                </div>
                {c.sessions.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-slate-400">{t('support.noSession')}</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {c.sessions.map((se, i) => (
                      <li key={i} className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium text-slate-800">
                            {new Date(`${se.date}T00:00:00Z`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' })}
                            {se.time && <span className="ms-1.5 font-normal text-slate-500">🕒 {se.time}</span>}
                            {se.topic && <span className="ms-2 font-normal text-slate-500">— {se.topic}</span>}
                          </span>
                          {se.present === null ? (
                            <span className="text-[11px] text-slate-400">{t('support.notMarked')}</span>
                          ) : (
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${se.present ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                              {se.present ? t('support.present') : t('support.absent')}
                            </span>
                          )}
                        </div>
                        {se.appreciation && (
                          <p className="mt-1 text-sm text-slate-600">
                            <span className="text-xs font-medium text-slate-400">{t('support.appreciation')} : </span>
                            {se.appreciation}
                          </p>
                        )}
                        {se.resources.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-2">
                            {se.resources.map((r) => (
                              <a key={r.id} href={r.url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs text-brand-700 hover:bg-brand-100">
                                🔗 {r.title}
                              </a>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )
      ) : tab === 'jour' ? (
        !data.ctx.classId ? (
          <p className="text-sm text-slate-400">{t('noClass')}</p>
        ) : (
          <div>
            <div className="mb-4 flex items-center justify-center gap-2">
              <Link
                href={dayHref(prevDate)}
                aria-label={t('vieScolaire.prevDay')}
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              >
                ‹
              </Link>
              <div className="min-w-[12rem] rounded-lg border border-brand-200 bg-white px-4 py-1.5 text-center">
                <div className="text-sm font-semibold capitalize text-slate-800">{dateLabel}</div>
              </div>
              <Link
                href={dayHref(nextDate)}
                aria-label={t('vieScolaire.nextDay')}
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              >
                ›
              </Link>
            </div>
            <DayTimetable
              courses={dayCourses}
              labels={{
                empty: t('vieScolaire.dayEmpty'),
                cancelled: t('vieScolaire.cancelled'),
                substitute: t('vieScolaire.substitute'),
                break: t('vieScolaire.break'),
              }}
            />
          </div>
        )
      ) : tab === 'edt' ? (
        !data.ctx.classId ? (
          <p className="text-sm text-slate-400">{t('noClass')}</p>
        ) : (
          <TimetableGridReadonly
            days={[...DAYS]}
            dayLabels={dayLabels}
            slots={data.slots.map((s) => ({
              id: s.id,
              startTime: s.startTime,
              endTime: s.endTime,
              isBreak: s.isBreak,
            }))}
            entries={gridEntries}
            hourLabel={t('edt.hour')}
            emptyLabel={t('edt.empty')}
          />
        )
      ) : tab === 'carnet' ? (
        <>
          {data.toJustify.length > 0 && (
            <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
              <h3 className="text-sm font-semibold text-amber-900">{t('carnet.toJustifyTitle')}</h3>
              <ul className="mt-2 space-y-1.5">
                {data.toJustify.map((r) => {
                  const dateLabel = `${new Date(r.date).toLocaleDateString(locale, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    timeZone: 'UTC',
                  })}${r.session.periodLabel ? ` · ${r.session.periodLabel}` : ''}`;
                  const isLate = r.category === 'RETARD';
                  return (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            isLate ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {t(`carnet.type.${r.category}`)}
                          {isLate && r.lateMinutes ? ` · ${r.lateMinutes} min` : ''}
                        </span>
                        <span className="capitalize text-slate-700">{dateLabel}</span>
                        {r.attendanceRecord.note && (
                          <span className="text-xs italic text-slate-500">
                            « {r.attendanceRecord.note} »
                          </span>
                        )}
                      </span>
                      <JustifyButton
                        recordId={r.attendanceRecord.id}
                        reasons={data.justifyReasons}
                        dateLabel={dateLabel}
                        className={r.session.class?.name ?? ''}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {/* Sous-onglets : Absence / Retard / Autres */}
          {(() => {
            const absenceEvents = data.carnet.events.filter(
              (e) => e.category === 'ABSENT' || e.category === 'EXCLUSION',
            );
            const retardEvents = data.carnet.events.filter((e) => e.category === 'LATE');
            const counts = {
              absence: absenceEvents.length,
              retard: retardEvents.length,
              autres: data.carnet.entries.length,
            };
            const subTabs = [
              { key: 'absence', label: t('carnet.subAbsence') },
              { key: 'retard', label: t('carnet.subRetard') },
              { key: 'autres', label: t('carnet.subAutres') },
            ] as const;
            return (
              <>
                <div className="mb-3 flex flex-wrap gap-2">
                  {subTabs.map((s) => (
                    <Link
                      key={s.key}
                      href={`${base}?tab=carnet&sub=${s.key}`}
                      className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium ${
                        sub === s.key
                          ? 'bg-brand-600 text-white'
                          : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {s.label}
                      <span className="ms-1 opacity-70">({counts[s.key]})</span>
                    </Link>
                  ))}
                </div>

                <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                  {sub === 'autres' ? (
                    data.carnet.entries.length === 0 ? (
                      <p className="text-sm text-slate-400">{t('carnet.empty')}</p>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {data.carnet.entries.map((c) => (
                          <li
                            key={c.id}
                            className={`py-3 first:pt-0 last:pb-0 ${c.parentReadAt ? '' : 'rounded-lg bg-red-50/40 px-2'}`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="flex items-center gap-2">
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                                    c.type === 'ENCOURAGEMENT' || c.type === 'FELICITATION'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : c.type === 'OBSERVATION'
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {t(`carnet.type.${c.type}`)}
                                </span>
                                <span className="text-xs text-slate-500">
                                  {new Date(c.occurredAt).toLocaleDateString(locale)} · {c.authorName}
                                  {c.sessionLabel ? ` · ${c.sessionLabel}` : ''}
                                  {c.subjectLabel ? ` · ${c.subjectLabel}` : ''}
                                </span>
                              </span>
                              {!c.parentReadAt && (
                                <span className="text-[10px] font-medium text-red-600">{t('carnet.new')}</span>
                              )}
                            </div>
                            <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-800">{c.content}</p>
                            {c.parentReadAt ? (
                              <p className="mt-2 text-[11px] text-slate-400">
                                {t('carnet.seenOn', { date: new Date(c.parentReadAt).toLocaleDateString(locale) })}
                              </p>
                            ) : (
                              <AcknowledgeCarnet entryId={c.id} />
                            )}
                          </li>
                        ))}
                      </ul>
                    )
                  ) : (
                    (() => {
                      const list = sub === 'absence' ? absenceEvents : retardEvents;
                      if (list.length === 0)
                        return <p className="text-sm text-slate-400">{t('carnet.empty')}</p>;
                      return (
                        <ul className="divide-y divide-slate-100">
                          {list.map((ev) => (
                            <li key={ev.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                              <span className="flex items-center gap-2">
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                    ev.category === 'LATE'
                                      ? 'bg-orange-100 text-orange-700'
                                      : 'bg-red-100 text-red-700'
                                  }`}
                                >
                                  {t(`carnet.type.${ev.category === 'EXCLUSION' ? 'EXCLUSION' : ev.category === 'LATE' ? 'RETARD' : 'ABSENCE'}`)}
                                </span>
                                <span className="text-sm text-slate-700">
                                  {new Date(ev.date).toLocaleDateString(locale, {
                                    weekday: 'long',
                                    day: 'numeric',
                                    month: 'long',
                                    timeZone: 'UTC',
                                  })}
                                </span>
                                <span className="text-xs text-slate-400">{ev.className}</span>
                              </span>
                              {ev.justifStatus && (
                                <span
                                  className={`text-[11px] font-medium ${
                                    ev.justifStatus === 'APPROVED'
                                      ? 'text-emerald-700'
                                      : ev.justifStatus === 'REJECTED'
                                        ? 'text-red-700'
                                        : 'text-amber-700'
                                  }`}
                                >
                                  {t(`carnet.justif.${ev.justifStatus}`)}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      );
                    })()
                  )}
                </section>
              </>
            );
          })()}
        </>
      ) : (
        // Équipe pédagogique
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
          {data.mainTeacher && (
            <div className="border-b border-slate-100 bg-brand-50 px-4 py-2.5 text-sm">
              <span className="font-medium text-brand-800">{t('equipe.mainTeacher')} :</span>{' '}
              {personDisplayName(locale, data.mainTeacher)}
            </div>
          )}
          {data.team.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">{t('equipe.empty')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 table-head text-[10px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-2 text-start">{t('equipe.subject')}</th>
                  <th className="px-4 py-2 text-start">{t('equipe.teacher')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.team.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2 font-medium text-slate-800">{localizedLabel(locale, a.subject.label, a.subject.labelAr)}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {personDisplayName(locale, a.teacher)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
