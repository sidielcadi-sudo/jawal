import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { isDirection } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { SubstituteSelect, ValidateSubstitutionButton, ApprovalCell } from '../../substitute-select';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';

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
  // Seules la direction et l'admin approuvent/refusent un remplacement validé.
  const canApprove = await isDirection();

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const leave = await tx.leaveRequest.findUnique({
      where: { id },
      include: { person: { select: { id: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true, type: true } }, leaveType: { select: { labelFr: true } } },
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
      include: {
        slot: { select: { id: true, startTime: true, endTime: true, order: true } },
        class: { select: { name: true, nameAr: true } },
        subject: { select: { id: true, label: true, labelAr: true } },
        room: { select: { id: true, code: true } },
      },
    });

    // Occupation par (jour|slot) sur l'année : profs ET salles.
    const allEntries = await tx.timetableEntry.findMany({
      where: { academicYearId: year.id },
      select: { teacherId: true, roomId: true, dayOfWeek: true, slotId: true },
    });
    const busy = new Map<string, Set<string>>();
    const roomBusy = new Map<string, Set<string>>();
    for (const e of allEntries) {
      const k = `${e.dayOfWeek}|${e.slotId}`;
      if (e.teacherId) (busy.get(k) ?? busy.set(k, new Set()).get(k)!).add(e.teacherId);
      if (e.roomId) (roomBusy.get(k) ?? roomBusy.set(k, new Set()).get(k)!).add(e.roomId);
    }
    // Salles de l'établissement (pour compter les libres par créneau).
    const rooms = await tx.room.findMany({ select: { id: true, code: true }, orderBy: { code: 'asc' } });

    // Profs + qualification (TeacherAssignment) + congés approuvés (exclusion).
    const [teachers, assignments, approvedLeaves, existingOverrides] = await Promise.all([
      tx.person.findMany({ where: { type: 'TEACHER', deletedAt: null }, select: { id: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } }),
      tx.teacherAssignment.findMany({ where: { academicYearId: year.id }, select: { teacherId: true, subjectId: true } }),
      tx.leaveRequest.findMany({ where: { status: 'APPROVED', startDate: { lte: leave.endDate }, endDate: { gte: leave.startDate } }, select: { personId: true, startDate: true, endDate: true } }),
      tx.timetableOverride.findMany({ where: { entryId: { in: teacherEntries.map((e) => e.id) }, date: { gte: leave.startDate, lte: leave.endDate } }, select: { entryId: true, date: true, kind: true, substituteTeacherId: true, validatedAt: true, approvalStatus: true, approvalComment: true } }),
    ]);
    const qualifiedBySubject = new Map<string, Set<string>>();
    for (const a of assignments) {
      (qualifiedBySubject.get(a.subjectId) ?? qualifiedBySubject.set(a.subjectId, new Set()).get(a.subjectId)!).add(a.teacherId);
    }
    const overrides = new Map(existingOverrides.map((o) => [`${o.entryId}|${o.date.toISOString().slice(0, 10)}`, o]));

    // Génère les séances datées dans la période du congé.
    const sessions = [] as {
      entryId: string; dateStr: string; slotOrder: number; slotLabel: string; className: string;
      subjectId: string | null; subjectName: string; roomCode: string | null; freeRooms: number;
    }[];
    for (const d of eachDate(leave.startDate, leave.endDate)) {
      const code = DOW_CODES[d.getUTCDay()];
      for (const e of teacherEntries) {
        if (e.dayOfWeek !== code) continue;
        // Salles libres sur ce créneau = salles non occupées par une autre séance
        // au même jour|slot (occupation issue de l'EDT régulier).
        const occupied = roomBusy.get(`${code}|${e.slotId}`) ?? new Set<string>();
        const freeRooms = rooms.filter((r) => !occupied.has(r.id)).length;
        sessions.push({
          entryId: e.id,
          dateStr: d.toISOString().slice(0, 10),
          slotOrder: e.slot.order,
          slotLabel: `${e.slot.startTime}–${e.slot.endTime}`,
          className: localizedLabel(locale, e.class.name, e.class.nameAr),
          subjectId: e.subjectId,
          subjectName: e.subject?.label ?? '—',
          roomCode: e.room?.code ?? null,
          freeRooms,
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
        .map((te) => ({ id: te.id, name: personDisplayName(locale, te), qualified: qSet.has(te.id) }));
      candidatesByKey.set(`${s.entryId}|${s.dateStr}`, cands);
    }

    return { leave, year, sessions, candidatesByKey, overrides };
  });

  if (!data) notFound();
  const { leave, sessions, candidatesByKey, overrides } = data;
  const isTeacher = leave.person.type === 'TEACHER';

  // Récap d'approbation de l'absence : on ne dit « tout approuvé » que si CHAQUE
  // séance a une décision (remplacement ou annulation) approuvée. Sinon, partiel.
  const summary = { total: sessions.length, toDecide: 0, toValidate: 0, awaiting: 0, approved: 0, refused: 0 };
  for (const s of sessions) {
    const ov = overrides.get(`${s.entryId}|${s.dateStr}`);
    const hasDecision = !!ov && (ov.kind === 'CANCELLED' || !!ov.substituteTeacherId);
    if (!hasDecision) summary.toDecide++;
    else if (!ov!.validatedAt) summary.toValidate++;
    else if (ov!.approvalStatus === 'APPROVED') summary.approved++;
    else if (ov!.approvalStatus === 'REFUSED') summary.refused++;
    else summary.awaiting++;
  }
  const fullyApproved = summary.total > 0 && summary.approved === summary.total;

  return (
    <div className="mx-auto max-w-4xl px-3 py-3">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/leave`} className="hover:text-brand-700">🏖️ {t('title')}</Link>
        <span className="mx-1.5">›</span>
        <span>{ts('title')}</span>
      </nav>

      <h1 className="mb-1 text-base font-bold text-slate-900">
        {ts('title')} — {personDisplayName(locale, leave.person)}
      </h1>
      <p className="mb-3 text-xs text-slate-500">
        {leave.leaveType.labelFr} · {new Date(leave.startDate).toLocaleDateString(locale)} → {new Date(leave.endDate).toLocaleDateString(locale)}
      </p>

      {isTeacher && sessions.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`rounded-lg px-2 py-1 font-medium ${
              fullyApproved ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {fullyApproved
              ? ts('rollupAllApproved')
              : ts('rollupPartial', { approved: summary.approved, total: summary.total })}
          </span>
          {summary.toDecide > 0 && <span className="text-slate-500">· {ts('cToDecide', { n: summary.toDecide })}</span>}
          {summary.toValidate > 0 && <span className="text-slate-500">· {ts('cToValidate', { n: summary.toValidate })}</span>}
          {summary.awaiting > 0 && <span className="text-amber-700">· {ts('cAwaiting', { n: summary.awaiting })}</span>}
          {summary.refused > 0 && <span className="text-red-700">· {ts('cRefused', { n: summary.refused })}</span>}
        </div>
      )}

      {!isTeacher ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">{ts('notTeacher')}</p>
      ) : sessions.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">{ts('noSessions')}</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
              <tr>
                <th className="px-3 py-2.5 text-start">{ts('date')}</th>
                <th className="px-3 py-2.5 text-start">{ts('slot')}</th>
                <th className="px-3 py-2.5 text-start">{ts('class')}</th>
                <th className="px-3 py-2.5 text-start">{ts('subject')}</th>
                <th className="px-3 py-2.5 text-start">{ts('room')}</th>
                <th className="px-3 py-2.5 text-start">{ts('substitute')}</th>
                <th className="px-3 py-2.5 text-start">{ts('validation')}</th>
                <th className="px-3 py-2.5 text-start">{ts('approval')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.map((s) => {
                const key = `${s.entryId}|${s.dateStr}`;
                const ov = overrides.get(key);
                const value = ov ? (ov.kind === 'CANCELLED' ? 'CANCELLED' : ov.substituteTeacherId ?? '') : '';
                // Une décision existe (remplaçant OU annulation) → validable/approuvable.
                const hasOverride = value !== '';
                const validated = !!ov?.validatedAt;
                const approvalStatus = ov?.approvalStatus ?? 'PENDING';
                return (
                  <tr key={key}>
                    <td className="px-3 py-2 text-xs text-slate-600">{new Date(`${s.dateStr}T00:00:00Z`).toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' })}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{s.slotLabel}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{s.className}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{s.subjectName}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className="text-slate-700">{s.roomCode ?? '—'}</span>
                      <span
                        className={`ms-1 ${s.freeRooms > 0 ? 'text-slate-400' : 'text-red-500'}`}
                        title={ts('freeRoomsHint')}
                      >
                        · {ts('freeRooms', { count: s.freeRooms })}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <SubstituteSelect entryId={s.entryId} date={s.dateStr} leaveId={leave.id} value={value} candidates={candidatesByKey.get(key) ?? []} />
                    </td>
                    <td className="px-3 py-2">
                      <ValidateSubstitutionButton
                        entryId={s.entryId}
                        date={s.dateStr}
                        leaveId={leave.id}
                        hasOverride={hasOverride}
                        validated={validated}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <ApprovalCell
                        entryId={s.entryId}
                        date={s.dateStr}
                        leaveId={leave.id}
                        hasOverride={hasOverride}
                        validated={validated}
                        status={approvalStatus}
                        comment={ov?.approvalComment ?? null}
                        canApprove={canApprove}
                      />
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
