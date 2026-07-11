import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { requirePermission } from '@/lib/auth/rbac';
import { dowOf, toDateStr } from '@/lib/lesson-book';
import { EventRowActions, JustifReview } from './client';

const STATUSES = ['PENDING', 'CONFIRMED', 'JUSTIFIED', 'CANCELLED'] as const;

export default async function AbsenceManagementPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; class?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('admin.absenceMgmt');
  const session = (await auth())!;
  await requirePermission('attendance.write');

  const status = STATUSES.includes(sp.status as never) ? sp.status! : 'PENDING';

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
    const classes = year
      ? await tx.class.findMany({
          where: { academicYearId: year.id, deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : [];
    const events = await tx.attendanceEvent.findMany({
      where: { status: status as never, ...(sp.class ? { classId: sp.class } : {}) },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: {
        student: { select: { firstName: true, lastName: true } },
        session: { select: { periodLabel: true } },
      },
      take: 300,
    });
    const classMap = new Map(classes.map((c) => [c.id, c.name]));
    const eventClassIds = [...new Set(events.map((e) => e.classId))];

    // Séance (heures dans periodLabel) → matière + prof via l'entrée d'EDT
    // correspondante (classe × jour × créneau).
    const entries =
      year && eventClassIds.length > 0
        ? await tx.timetableEntry.findMany({
            where: { academicYearId: year.id, classId: { in: eventClassIds } },
            select: {
              classId: true,
              dayOfWeek: true,
              slot: { select: { startTime: true, endTime: true } },
              subject: { select: { label: true } },
              teacher: { select: { firstName: true, lastName: true } },
            },
          })
        : [];
    const entryMap = new Map<string, { subject: string | null; teacher: string | null }>();
    for (const en of entries) {
      entryMap.set(`${en.classId}|${en.dayOfWeek}|${en.slot.startTime}-${en.slot.endTime}`, {
        subject: en.subject?.label ?? null,
        teacher: en.teacher ? `${en.teacher.lastName} ${en.teacher.firstName}` : null,
      });
    }

    // Délégué (lecture seule) par classe — défini lors de la constitution de la classe.
    const clsRows =
      eventClassIds.length > 0
        ? await tx.class.findMany({
            where: { id: { in: eventClassIds } },
            select: { id: true, delegate: { select: { firstName: true, lastName: true } } },
          })
        : [];
    const delegateByClass = new Map(
      clsRows.map((c) => [c.id, c.delegate ? `${c.delegate.lastName} ${c.delegate.firstName}` : null]),
    );

    // Observations du prof (carnet OBSERVATION/ENCOURAGEMENT + note d'appel)
    // rattachées à la même (séance, élève) que l'événement.
    const sessionIds = [...new Set(events.map((e) => e.sessionId))];
    const studentIds = [...new Set(events.map((e) => e.studentId))];
    const obs =
      sessionIds.length > 0
        ? await tx.carnetEntry.findMany({
            where: {
              attendanceSessionId: { in: sessionIds },
              studentId: { in: studentIds },
              type: { in: ['OBSERVATION', 'ENCOURAGEMENT'] },
            },
            select: { attendanceSessionId: true, studentId: true, type: true, content: true },
          })
        : [];
    const obsMap = new Map<string, { type: string; content: string }[]>();
    for (const o of obs) {
      const k = `${o.attendanceSessionId}|${o.studentId}`;
      const arr = obsMap.get(k) ?? [];
      arr.push({ type: o.type, content: o.content });
      obsMap.set(k, arr);
    }
    const notes = await tx.attendanceRecord.findMany({
      where: { id: { in: events.map((e) => e.attendanceRecordId) } },
      select: { id: true, note: true },
    });
    const noteMap = new Map(notes.map((n) => [n.id, n.note]));

    // Justification déposée par le parent (motif + commentaire + justificatif).
    const justifs = await tx.absenceJustification.findMany({
      where: { attendanceRecordId: { in: events.map((e) => e.attendanceRecordId) } },
      select: {
        id: true,
        attendanceRecordId: true,
        reason: true,
        attachmentUrl: true,
        status: true,
        reviewNote: true,
      },
    });
    const justifByRecord = new Map(justifs.map((j) => [j.attendanceRecordId, j]));
    return {
      classes,
      counts: Object.fromEntries(
        await Promise.all(
          STATUSES.map(async (s) => [s, await tx.attendanceEvent.count({ where: { status: s } })] as const),
        ),
      ) as Record<string, number>,
      events: events.map((e) => {
        const periodLabel = e.session?.periodLabel ?? '';
        const slotInfo = entryMap.get(
          `${e.classId}|${dowOf(toDateStr(e.date))}|${periodLabel}`,
        );
        return {
          id: e.id,
          classId: e.classId,
          student: `${e.student.lastName} ${e.student.firstName}`,
          className: classMap.get(e.classId) ?? '—',
          date: e.date.toISOString(),
          sessionLabel: periodLabel.replace('-', ' → '),
          subject: slotInfo?.subject ?? null,
          teacher: slotInfo?.teacher ?? null,
          signaledCategory: e.signaledCategory,
          category: e.category,
          status: e.status,
          lateMinutes: e.lateMinutes,
          justifReason: e.justifReason,
          note: noteMap.get(e.attendanceRecordId) ?? null,
          observations: obsMap.get(`${e.sessionId}|${e.studentId}`) ?? [],
          delegate: delegateByClass.get(e.classId) ?? null,
          parentJustif: (() => {
            const j = justifByRecord.get(e.attendanceRecordId);
            if (!j) return null;
            const [motif, ...rest] = j.reason.split('\n\n');
            return {
              id: j.id,
              motif: motif ?? j.reason,
              comment: rest.join('\n\n') || null,
              hasFile: !!j.attachmentUrl,
              status: j.status as 'PENDING' | 'APPROVED' | 'REJECTED',
              reviewNote: j.reviewNote,
            };
          })(),
        };
      }),
    };
  });

  const base = `/${locale}/admin/attendance/management`;

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden rounded-3xl bg-gradient-to-r from-brand-100 to-brand-50 px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-0.5 text-sm text-slate-600">{t('subtitle')}</p>
      </header>

      {/* Onglets statut */}
      <div className="mt-4 flex flex-wrap gap-1 border-b border-slate-200">
        {STATUSES.map((s) => (
          <a
            key={s}
            href={`${base}?status=${s}${sp.class ? `&class=${sp.class}` : ''}`}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              status === s
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t(`status.${s}`)} <span className="text-xs text-slate-400">({data.counts[s] ?? 0})</span>
          </a>
        ))}
      </div>

      {/* Filtre classe */}
      <form method="get" className="mt-3 flex items-center gap-2">
        <input type="hidden" name="status" value={status} />
        <select
          name="class"
          defaultValue={sp.class ?? ''}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm"
        >
          <option value="">{t('allClasses')}</option>
          {data.classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
          {t('filter')}
        </button>
      </form>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-start">{t('col.student')}</th>
              <th className="px-4 py-3 text-start">{t('col.class')}</th>
              <th className="px-4 py-3 text-start">{t('col.date')}</th>
              <th className="px-4 py-3 text-start">{t('col.session')}</th>
              <th className="px-4 py-3 text-start">{t('col.subject')}</th>
              <th className="px-4 py-3 text-start">{t('col.category')}</th>
              <th className="px-4 py-3 text-start">{t('col.observation')}</th>
              <th className="px-4 py-3 text-start">{t('col.delegate')}</th>
              <th className="px-4 py-3 text-start">{t('col.parentJustif')}</th>
              <th className="px-4 py-3 text-start">{t('col.status')}</th>
              <th className="px-4 py-3 text-end">{t('col.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.events.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2 font-medium text-slate-900">{e.student}</td>
                <td className="px-4 py-2 text-xs text-slate-600">{e.className}</td>
                <td className="px-4 py-2 text-xs text-slate-600">
                  {new Date(e.date).toLocaleDateString(locale)}
                </td>
                <td className="px-4 py-2 text-xs tabular-nums text-slate-600">
                  {e.sessionLabel || '—'}
                </td>
                <td className="px-4 py-2 text-xs text-slate-600">
                  <div className="font-medium text-slate-800">{e.subject ?? '—'}</div>
                  {e.teacher && <div className="text-slate-400">{e.teacher}</div>}
                </td>
                <td className="px-4 py-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                    {t(`category.${e.category}`)}
                    {e.category === 'RETARD' && e.lateMinutes ? ` ${e.lateMinutes}′` : ''}
                  </span>
                  {e.category !== e.signaledCategory && (
                    <span className="ms-1 text-[10px] text-amber-600">
                      ({t('converted')} : {t(`category.${e.signaledCategory}`)})
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-slate-600">
                  {e.observations.length === 0 && !e.note ? (
                    <span className="text-slate-300">—</span>
                  ) : (
                    <div className="space-y-0.5">
                      {e.observations.map((o, i) => (
                        <div key={i}>
                          <span
                            className={`me-1 rounded px-1 py-0.5 text-[9px] font-medium uppercase ${
                              o.type === 'ENCOURAGEMENT'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {t(`obsType.${o.type}`)}
                          </span>
                          {o.content}
                        </div>
                      ))}
                      {e.note && <div className="italic text-slate-500">« {e.note} »</div>}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-slate-600">
                  {e.delegate ?? <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-2 text-xs">
                  {!e.parentJustif ? (
                    <span className="text-slate-300">—</span>
                  ) : (
                    <div className="space-y-1">
                      <div>
                        <span
                          className={`me-1 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase ${
                            e.parentJustif.status === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-700'
                              : e.parentJustif.status === 'REJECTED'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {t(`justifStatus.${e.parentJustif.status}`)}
                        </span>
                        <span className="font-medium text-slate-800">{e.parentJustif.motif}</span>
                      </div>
                      {e.parentJustif.comment && (
                        <div className="italic text-slate-500">« {e.parentJustif.comment} »</div>
                      )}
                      {e.parentJustif.hasFile && (
                        <a
                          href={`/api/justifications/${e.parentJustif.id}/attachment`}
                          target="_blank"
                          rel="noopener"
                          className="inline-block text-brand-700 hover:underline"
                        >
                          📎 {t('justifFile')}
                        </a>
                      )}
                      {e.parentJustif.reviewNote && (
                        <div className="text-[11px] text-slate-400">
                          {t('justifReviewNote')} : {e.parentJustif.reviewNote}
                        </div>
                      )}
                      {e.parentJustif.status === 'PENDING' && (
                        <JustifReview eventId={e.id} />
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 text-xs">
                  {t(`status.${e.status}`)}
                  {e.justifReason && <span className="ms-1 text-slate-400">· {e.justifReason}</span>}
                </td>
                <td className="px-4 py-2 text-end">
                  <EventRowActions id={e.id} category={e.category} status={e.status} />
                </td>
              </tr>
            ))}
            {data.events.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-slate-500">
                  {t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
