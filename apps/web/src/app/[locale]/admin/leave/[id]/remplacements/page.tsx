import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { SubstituteSelect } from '../../substitute-select';

const DOW_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

function eachDate(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (d <= last) {
    out.push(new Date(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export default async function RemplacementsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.leave');
  const ts = await getTranslations('admin.leave.subs');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const leave = await tx.leaveRequest.findUnique({
      where: { id },
      include: { person: { select: { id: true, firstName: true, lastName: true, type: true } }, leaveType: { select: { labelFr: true } } },
    });
    if (!leave) return null;

    const now = new Date();
    const year =
      (await tx.academicYear.findFirst({ where: { startDate: { lte: now }, endDate: { gte: now } } })) ??
      (await tx.academicYear.findFirst({ orderBy: { startDate: 'desc' } }));
    if (!year) return { leave, year: null, sessions: [], candidatesByKey: new Map(), overrides: new Map() };

    // Séances de l'enseignant absent (hors pauses).
    const teacherEntries = await tx.timetableEntry.findMany({
      where: { teacherId: leave.personId, academicYearId: year.id, slot: { isBreak: false } },
      include: { slot: { select: { id: true, startTime: true, endTime: true, order: true } }, class: { select: { name: true } }, subject: { select: { id: true, label: true } } },
    });

    // Occupation de tous les profs par (jour|slot) sur l'année.
    const allEntries = await tx.timetableEntry.findMany({
      where: { academicYearId: year.id, teacherId: { not: null } },
      select: { teacherId: true, dayOfWeek: true, slotId: true },
    });
    const busy = new Map<string, Set<string>>();
    for (const e of allEntries) {
      const k = `${e.dayOfWeek}|${e.slotId}`;
      (busy.get(k) ?? busy.set(k, new Set()).get(k)!).add(e.teacherId!);
    }

    // Profs + qualification (TeacherAssignment) + congés approuvés (exclusion).
    const [teachers, assignments, approvedLeaves, existingOverrides] = await Promise.all([
      tx.person.findMany({ where: { type: 'TEACHER', deletedAt: null }, select: { id: true, firstName: true, lastName: true } }),
      tx.teacherAssignment.findMany({ where: { academicYearId: year.id }, select: { teacherId: true, subjectId: true } }),
      tx.leaveRequest.findMany({ where: { status: 'APPROVED', startDate: { lte: leave.endDate }, endDate: { gte: leave.startDate } }, select: { personId: true, startDate: true, endDate: true } }),
      tx.timetableOverride.findMany({ where: { entryId: { in: teacherEntries.map((e) => e.id) }, date: { gte: leave.startDate, lte: leave.endDate } }, select: { entryId: true, date: true, kind: true, substituteTeacherId: true } }),
    ]);
    const qualifiedBySubject = new Map<string, Set<string>>();
    for (const a of assignments) {
      (qualifiedBySubject.get(a.subjectId) ?? qualifiedBySubject.set(a.subjectId, new Set()).get(a.subjectId)!).add(a.teacherId);
    }
    const overrides = new Map(existingOverrides.map((o) => [`${o.entryId}|${o.date.toISOString().slice(0, 10)}`, o]));

    // Génère les séances datées dans la période du congé.
    const sessions = [] as {
      entryId: string; dateStr: string; slotOrder: number; slotLabel: string; className: string; subjectId: string | null; subjectName: string;
    }[];
    for (const d of eachDate(leave.startDate, leave.endDate)) {
      const code = DOW_CODES[d.getUTCDay()];
      for (const e of teacherEntries) {
        if (e.dayOfWeek !== code) continue;
        sessions.push({
          entryId: e.id,
          dateStr: d.toISOString().slice(0, 10),
          slotOrder: e.slot.order,
          slotLabel: `${e.slot.startTime}–${e.slot.endTime}`,
          className: e.class.name,
          subjectId: e.subjectId,
          subjectName: e.subject?.label ?? '—',
        });
      }
    }
    sessions.sort((a, b) => a.dateStr.localeCompare(b.dateStr) || a.slotOrder - b.slotOrder);

    // Candidats par séance.
    const onLeaveByDate = (dateStr: string) =>
      new Set(
        approvedLeaves
          .filter((l) => l.startDate.toISOString().slice(0, 10) <= dateStr && l.endDate.toISOString().slice(0, 10) >= dateStr)
          .map((l) => l.personId),
      );
    const candidatesByKey = new Map<string, { id: string; name: string; qualified: boolean }[]>();
    for (const s of sessions) {
      const code = DOW_CODES[new Date(`${s.dateStr}T00:00:00.000Z`).getUTCDay()];
      const entry = teacherEntries.find((e) => e.id === s.entryId)!;
      const busySet = busy.get(`${code}|${entry.slotId}`) ?? new Set<string>();
      const leaveSet = onLeaveByDate(s.dateStr);
      const qSet = s.subjectId ? qualifiedBySubject.get(s.subjectId) ?? new Set<string>() : new Set<string>();
      const cands = teachers
        .filter((te) => te.id !== leave.personId && !busySet.has(te.id) && !leaveSet.has(te.id))
        .map((te) => ({ id: te.id, name: `${te.lastName} ${te.firstName}`, qualified: qSet.has(te.id) }));
      candidatesByKey.set(`${s.entryId}|${s.dateStr}`, cands);
    }

    return { leave, year, sessions, candidatesByKey, overrides };
  });

  if (!data) notFound();
  const { leave, sessions, candidatesByKey, overrides } = data;
  const isTeacher = leave.person.type === 'TEACHER';

  return (
    <div className="mx-auto max-w-4xl px-3 py-3">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/leave`} className="hover:text-brand-700">🏖️ {t('title')}</Link>
        <span className="mx-1.5">›</span>
        <span>{ts('title')}</span>
      </nav>

      <h1 className="mb-1 text-base font-bold text-slate-900">
        {ts('title')} — {leave.person.lastName} {leave.person.firstName}
      </h1>
      <p className="mb-4 text-xs text-slate-500">
        {leave.leaveType.labelFr} · {new Date(leave.startDate).toLocaleDateString(locale)} → {new Date(leave.endDate).toLocaleDateString(locale)}
      </p>

      {!isTeacher ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">{ts('notTeacher')}</p>
      ) : sessions.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">{ts('noSessions')}</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 text-start">{ts('date')}</th>
                <th className="px-3 py-2.5 text-start">{ts('slot')}</th>
                <th className="px-3 py-2.5 text-start">{ts('class')}</th>
                <th className="px-3 py-2.5 text-start">{ts('subject')}</th>
                <th className="px-3 py-2.5 text-start">{ts('substitute')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.map((s) => {
                const key = `${s.entryId}|${s.dateStr}`;
                const ov = overrides.get(key);
                const value = ov ? (ov.kind === 'CANCELLED' ? 'CANCELLED' : ov.substituteTeacherId ?? '') : '';
                return (
                  <tr key={key}>
                    <td className="px-3 py-2 text-xs text-slate-600">{new Date(`${s.dateStr}T00:00:00Z`).toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' })}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{s.slotLabel}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{s.className}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{s.subjectName}</td>
                    <td className="px-3 py-2">
                      <SubstituteSelect entryId={s.entryId} date={s.dateStr} leaveId={leave.id} value={value} candidates={candidatesByKey.get(key) ?? []} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[11px] text-slate-400">{ts('legend')}</p>
    </div>
  );
}
