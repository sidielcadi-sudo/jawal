import { KpiCard } from '@/components/kpi-card';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';
import {
  VALIDATED_STATUSES,
  coverageRate,
  hourlyRate,
  summarizeOvertime,
  DEFAULT_OVERTIME_MAJORATION,
} from '@/lib/overtime-hse';
import { OvertimeHeader, OvertimeOptionsProvider, GenerateButton, WorkflowButtons } from './overtime-client';

const STATUS_BADGE: Record<string, string> = {
  DECLARED: 'bg-amber-100 text-amber-700',
  RH_VALIDATED: 'bg-sky-100 text-sky-700',
  DIRECTION_APPROVED: 'bg-indigo-100 text-indigo-700',
  PROCESSED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
};
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Heures supplémentaires (HSE) : déclaration, validation, suivi de la paie.
 *
 * Indicateurs en tête (ce qui attend, ce qui est validé ce mois, ce que ça
 * coûte, et si les absences de professeurs sont couvertes), puis l'historique
 * à traiter. Le formulaire de déclaration reste replié tant qu'on ne le demande
 * pas.
 */
export default async function OvertimePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.overtime');

  const now = new Date();
  const month = iso(now).slice(0, 7);
  const monthStart = new Date(`${month}-01T00:00:00.000Z`);
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const year =
      (await tx.academicYear.findFirst({ where: { active: true } })) ??
      (await tx.academicYear.findFirst({ where: { startDate: { lte: now }, endDate: { gte: now } } }));

    const [people, entries, slots, classes, assignments, schedEntries, overrides] = await Promise.all([
      tx.person.findMany({
        where: { type: { in: ['STAFF', 'TEACHER'] }, deletedAt: null },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: {
          id: true,
          type: true,
          firstName: true,
          lastName: true,
          firstNameAr: true,
          lastNameAr: true,
          contractualHoursPerWeek: true,
        },
      }),
      tx.overtimeEntry.findMany({
        // Déclarations de l'année active seulement.
        where: year ? { date: { gte: year.startDate, lte: year.endDate } } : {},
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 200,
        include: {
          person: {
            select: {
              firstName: true,
              lastName: true,
              firstNameAr: true,
              lastNameAr: true,
              grossSalary: true,
            },
          },
        },
      }),
      tx.timetableSlot.findMany({
        where: { isBreak: false },
        orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
        select: { startTime: true, endTime: true },
      }),
      year
        ? tx.class.findMany({
            where: { academicYearId: year.id, deletedAt: null },
            orderBy: [{ level: { order: 'asc' } }, { name: 'asc' }],
            select: { id: true, name: true, nameAr: true },
          })
        : Promise.resolve([] as { id: string; name: string; nameAr: string | null }[]),
      year
        ? tx.teacherAssignment.findMany({
            where: { academicYearId: year.id },
            select: { teacherId: true, subject: { select: { label: true, labelAr: true } } },
          })
        : Promise.resolve([] as { teacherId: string; subject: { label: string; labelAr: string | null } }[]),
      year
        ? tx.timetableEntry.findMany({
            where: { academicYearId: year.id, teacherId: { not: null }, slot: { isBreak: false } },
            select: { teacherId: true, slot: { select: { startTime: true, endTime: true } } },
          })
        : Promise.resolve([] as { teacherId: string | null; slot: { startTime: string; endTime: string } }[]),
      // Cours touchés par une absence ce mois-ci : remplacés ou annulés.
      tx.timetableOverride.findMany({
        where: { date: { gte: monthStart, lt: monthEnd } },
        select: { kind: true, substituteTeacherId: true, approvalStatus: true },
      }),
    ]);

    // Les classes des déclarations peuvent appartenir à une autre année.
    const entryClassIds = [...new Set(entries.map((e) => e.classId).filter((v): v is string => !!v))];
    const entryClasses = entryClassIds.length
      ? await tx.class.findMany({ where: { id: { in: entryClassIds } }, select: { id: true, name: true, nameAr: true } })
      : [];

    return { year, people, entries, slots, classes, assignments, schedEntries, overrides, entryClasses };
  });

  const { people, entries, slots, classes, assignments, schedEntries, overrides, entryClasses } = data;

  /* ── Référentiels ──────────────────────────────────────────────────────── */
  const subjectOf = new Map<string, string>();
  for (const a of assignments) {
    if (!subjectOf.has(a.teacherId)) subjectOf.set(a.teacherId, localizedLabel(locale, a.subject.label, a.subject.labelAr));
  }
  const nameOf = new Map(people.map((p) => [p.id, personDisplayName(locale, p)]));
  const classNameOf = new Map(
    [...classes, ...entryClasses].map((c) => [c.id, localizedLabel(locale, c.name, c.nameAr)]),
  );
  const teacherOpts = people
    .filter((p) => p.type === 'TEACHER')
    .map((p) => ({
      id: p.id,
      label: subjectOf.has(p.id) ? `${nameOf.get(p.id)} (${subjectOf.get(p.id)})` : nameOf.get(p.id)!,
    }));
  const staffOpts = people.filter((p) => p.type === 'STAFF').map((p) => ({ id: p.id, label: nameOf.get(p.id)! }));

  /* ── Indicateurs ───────────────────────────────────────────────────────── */
  const summary = summarizeOvertime(
    entries.map((e) => ({
      hours: e.hours,
      status: e.status,
      date: iso(e.date),
      grossSalary: e.person.grossSalary !== null ? Number(e.person.grossSalary) : null,
    })),
    month,
  );
  const substituted = overrides.filter(
    (o) => o.kind === 'SUBSTITUTION' && o.substituteTeacherId && o.approvalStatus !== 'REFUSED',
  ).length;
  const cancelled = overrides.filter((o) => o.kind === 'CANCELLED').length;
  const coverage = coverageRate(substituted, cancelled);

  const num = (n: number, digits = 1) =>
    n.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const money = (n: number) => `${Math.round(n).toLocaleString(locale)} MAD`;

  /* ── Export paie : heures validées ─────────────────────────────────────── */
  const reasonLabel = (e: (typeof entries)[number]) => (e.reason ? t(`reasons.${e.reason}` as never) : t(`source.${e.source}`));
  const timeLabel = (e: (typeof entries)[number]) =>
    e.startTime && e.endTime ? `${e.startTime.replace(':', 'h')} - ${e.endTime.replace(':', 'h')}` : '';
  const exportHeader = [
    t('col.teacher'),
    t('col.when'),
    t('col.schedule'),
    t('col.duration'),
    t('col.reason'),
    t('col.class'),
    t('col.replaced'),
    t('col.status'),
    t('col.cost'),
  ];
  const exportRows = entries
    .filter((e) => (VALIDATED_STATUSES as readonly string[]).includes(e.status))
    .map((e) => {
      const rate = hourlyRate(e.person.grossSalary !== null ? Number(e.person.grossSalary) : null);
      return [
        personDisplayName(locale, e.person),
        iso(e.date),
        timeLabel(e),
        String(e.hours),
        reasonLabel(e),
        e.classId ? (classNameOf.get(e.classId) ?? '') : '',
        e.replacedPersonId ? (nameOf.get(e.replacedPersonId) ?? '') : '',
        t(`statusLabel.${e.status}` as never),
        rate === null ? '' : (e.hours * rate * (1 + DEFAULT_OVERTIME_MAJORATION)).toFixed(2),
      ];
    });

  /* ── Dépassement de quota (indicatif) ──────────────────────────────────── */
  const sched = new Map<string, number>();
  for (const e of schedEntries) {
    const h = (toMin(e.slot.endTime) - toMin(e.slot.startTime)) / 60;
    sched.set(e.teacherId!, (sched.get(e.teacherId!) ?? 0) + h);
  }
  const overQuota = people
    .filter((p) => p.type === 'TEACHER' && p.contractualHoursPerWeek !== null)
    .map((p) => {
      const scheduled = Math.round((sched.get(p.id) ?? 0) * 100) / 100;
      const quota = p.contractualHoursPerWeek ?? 0;
      return { name: nameOf.get(p.id)!, scheduled, quota, over: Math.round((scheduled - quota) * 100) / 100 };
    })
    .filter((x) => x.over > 0)
    .sort((a, b) => b.over - a.over);

  return (
    <OvertimeOptionsProvider
      value={{
        teachers: teacherOpts,
        staff: staffOpts,
        classes: classes.map((c) => ({ id: c.id, label: localizedLabel(locale, c.name, c.nameAr) })),
        slots,
      }}
    >
    <div className="px-3 py-3">
      <OvertimeHeader exportHeader={exportHeader} exportRows={exportRows} />

      {/* ── Indicateurs ───────────────────────────────────────────────── */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon="⏳"
          tone="amber"
          label={t('kpi.pending')}
          value={t('hoursValue', { value: num(summary.pendingHours) })}
          hint={t('kpi.pendingSub', { count: summary.pendingCount })}
        />
        <KpiCard
          icon="✔"
          tone="emerald"
          label={t('kpi.validated')}
          value={t('hoursValue', { value: num(summary.validatedHours) })}
          valueTone="text-emerald-700"
          hint={t('kpi.validatedSub')}
        />
        <KpiCard
          icon="🪙"
          tone="sky"
          label={t('kpi.cost')}
          value={summary.cost === null ? null : money(summary.cost)}
          hint={
            summary.costMissing > 0
              ? `${t('kpi.costSub')} · ${t('kpi.costMissing', { count: summary.costMissing })}`
              : t('kpi.costSub')
          }
        />
        <KpiCard
          icon="👤"
          tone="violet"
          label={t('kpi.coverage')}
          value={coverage === null ? null : `${num(coverage)} %`}
          hint={t('kpi.coverageSub')}
        />
      </div>

      {/* ── Historique et déclarations à traiter ─────────────────────── */}
      <section className="overflow-hidden rounded-2xl border border-brand-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-blue-900">{t('table.title')}</h2>
          <GenerateButton />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 text-start">{t('col.teacher')}</th>
                <th className="whitespace-nowrap px-4 py-3 text-start">{t('col.when')}</th>
                <th className="whitespace-nowrap px-4 py-3 text-start">{t('col.duration')}</th>
                <th className="whitespace-nowrap px-4 py-3 text-start">{t('col.reason')}</th>
                <th className="whitespace-nowrap px-4 py-3 text-start">{t('col.class')}</th>
                <th className="whitespace-nowrap px-4 py-3 text-start">{t('col.replaced')}</th>
                <th className="whitespace-nowrap px-4 py-3 text-start">{t('col.status')}</th>
                <th className="whitespace-nowrap px-4 py-3 text-start">{t('col.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((e) => {
                const name = personDisplayName(locale, e.person);
                return (
                  <tr key={e.id} className="align-middle">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-bold text-blue-900">
                          {initials(name)}
                        </span>
                        <div>
                          <div className="font-semibold text-slate-900">{name}</div>
                          <div className="text-xs text-slate-500">{subjectOf.get(e.personId) ?? '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <div className="font-semibold text-slate-900">{new Date(e.date).toLocaleDateString(locale)}</div>
                      {timeLabel(e) && <div className="text-xs text-slate-500">{timeLabel(e)}</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-bold tabular-nums text-blue-900">
                      {t('hoursValue', { value: num(e.hours) })}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-900">
                        {reasonLabel(e)}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-semibold text-slate-900">
                      {e.classId ? (classNameOf.get(e.classId) ?? '—') : '—'}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {e.replacedPersonId ? (nameOf.get(e.replacedPersonId) ?? '—') : '—'}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[e.status] ?? ''}`}
                      >
                        {t(`statusLabel.${e.status}` as never)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <WorkflowButtons
                        id={e.id}
                        status={e.status}
                        edit={{
                          personId: e.personId,
                          date: iso(e.date),
                          startTime: e.startTime,
                          endTime: e.endTime,
                          reason: e.reason,
                          classId: e.classId,
                          replacedPersonId: e.replacedPersonId,
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-400">
                    {t('empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Dépassement de quota : information, pas une déclaration. */}
      {overQuota.length > 0 && (
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">{t('overQuota')}</h2>
          <p className="mb-2 text-[11px] text-slate-400">{t('overQuotaHint')}</p>
          <ul className="grid grid-cols-1 gap-x-6 divide-y divide-slate-100 text-sm sm:grid-cols-2">
            {overQuota.map((q) => (
              <li key={q.name} className="flex items-center justify-between py-1.5">
                <span className="text-slate-700">{q.name}</span>
                <span className="tabular-nums text-amber-700">
                  +{q.over} h
                  <span className="ms-1 text-[11px] font-normal text-slate-400">
                    ({q.scheduled}/{q.quota})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
    </OvertimeOptionsProvider>
  );
}


function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}
