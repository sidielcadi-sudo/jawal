import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { loadParentChildContext } from '@/lib/parent';
import { loadStudentCarnet } from '@/lib/carnet';
import { AcknowledgeCarnet } from '@/components/carnet/acknowledge-carnet';
import { TimetableGridReadonly, type ReadonlyEntry } from '@/components/timetable-grid-readonly';
import { ChildTabs } from '../tabs';
import { JustifyButton } from '../justify-button';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

export default async function ParentChildVieScolairePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; childId: string }>;
  searchParams: Promise<{ tab?: string; sub?: string }>;
}) {
  const { locale, childId } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('parent.child');
  const tab = sp.tab === 'carnet' || sp.tab === 'equipe' ? sp.tab : 'edt';
  const sub = sp.sub === 'retard' || sp.sub === 'autres' ? sp.sub : 'absence';

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
              subject: { select: { label: true } },
              teacher: { select: { firstName: true, lastName: true } },
              room: { select: { label: true } },
            },
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
              session: { select: { periodLabel: true, class: { select: { name: true } } } },
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
              subject: { select: { label: true } },
              teacher: { select: { firstName: true, lastName: true } },
            },
            orderBy: { subject: { label: 'asc' } },
          })
        : [];
    const mainTeacher =
      tab === 'equipe' && ctx.classId
        ? (
            await tx.class.findUnique({
              where: { id: ctx.classId },
              select: { mainTeacher: { select: { firstName: true, lastName: true } } },
            })
          )?.mainTeacher ?? null
        : null;

    return { ctx, slots, entries, carnet, team, mainTeacher, toJustify, justifyReasons };
  });
  if (!data) notFound();

  const base = `/${locale}/parent/children/${childId}/vie-scolaire`;
  const dayLabels = Object.fromEntries(DAYS.map((d) => [d, t(`edt.days.${d}`)]));
  const gridEntries: ReadonlyEntry[] = data.entries.map((e) => ({
    dayOfWeek: e.dayOfWeek,
    slotId: e.slotId,
    subjectLabel: e.subject?.label ?? null,
    teacherName: e.teacher ? `${e.teacher.lastName} ${e.teacher.firstName}` : null,
    roomLabel: e.room?.label ?? null,
  }));
  return (
    <>
      <ChildTabs
        current={tab}
        tabs={[
          { key: 'edt', label: t('vieScolaire.tabEdt'), href: `${base}?tab=edt` },
          { key: 'carnet', label: t('vieScolaire.tabCarnet'), href: `${base}?tab=carnet` },
          { key: 'equipe', label: t('vieScolaire.tabTeam'), href: `${base}?tab=equipe` },
        ]}
      />

      {tab === 'edt' ? (
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
              {data.mainTeacher.lastName} {data.mainTeacher.firstName}
            </div>
          )}
          {data.team.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">{t('equipe.empty')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-2 text-start">{t('equipe.subject')}</th>
                  <th className="px-4 py-2 text-start">{t('equipe.teacher')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.team.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2 font-medium text-slate-800">{a.subject.label}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {a.teacher.lastName} {a.teacher.firstName}
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
