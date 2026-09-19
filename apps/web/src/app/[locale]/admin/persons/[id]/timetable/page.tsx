import { coveringCellsForTeacher, absentCellsForTeacher } from '@/lib/timetable-overrides';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import type { DayKey } from '@/lib/timetable-conflicts';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';
import {
  computeAssignmentDeltas,
  slotDurationMinutes,
} from '@/lib/timetable-validation';
import { PersonHeader, PERSON_PAGE_SHELL } from '../person-header';

const DAYS: DayKey[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export default async function TeacherTimetablePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { locale, id } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.timetable');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const teacher = await tx.person.findUnique({
      where: { id },
      select: { id: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true, type: true },
    });
    if (!teacher) return null;

    const years = await tx.academicYear.findMany({
      orderBy: { startDate: 'desc' },
      select: { id: true, label: true, active: true },
    });
    const yearId = sp.year ?? years.find((y) => y.active)?.id ?? years[0]?.id ?? null;

    const slots = await tx.timetableSlot.findMany({
      orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
    });

    const entries = yearId
      ? await tx.timetableEntry.findMany({
          where: { teacherId: id, academicYearId: yearId },
          include: {
            subject: { select: { id: true, label: true, labelAr: true } },
            class: { select: { id: true, name: true, nameAr: true } },
            room: { select: { id: true, code: true, label: true, labelAr: true } },
            slot: { select: { id: true, startTime: true, endTime: true } },
          },
        })
      : [];

    const assignments = yearId
      ? await tx.teacherAssignment.findMany({
          where: { teacherId: id, academicYearId: yearId },
          include: {
            subject: { select: { id: true, label: true, labelAr: true } },
            class: { select: { id: true, name: true, nameAr: true } },
          },
        })
      : [];

    // Groupes dont il est l'enseignant désigné : ses cours de groupe viennent
    // de là, et non d'une affectation à la matière.
    const groupRows = yearId
      ? await tx.classGroup.findMany({
          where: { teacherId: id, class: { academicYearId: yearId } },
          select: { name: true, classId: true, subjectId: true },
        })
      : [];

    // Remplacements approuvés qu’il assure : absents de la semaine type,
    // puisqu’ils ne valent que pour une date.
    const covering = await coveringCellsForTeacher(tx, id);
    const absent = await absentCellsForTeacher(tx, id);

    return { teacher, years, yearId, slots, entries, assignments, groupRows, covering, absent };
  });

  if (!data) notFound();
  const { teacher, years, yearId, slots, entries, assignments, groupRows, covering, absent } = data;
  const absentByKey = new Map<string, (typeof absent)[number][]>();
  for (const a of absent) {
    const k = `${a.dayOfWeek}|${a.slotId}`;
    absentByKey.set(k, [...(absentByKey.get(k) ?? []), a]);
  }
  const coveringByKey = new Map<string, (typeof covering)[number][]>();
  for (const c of covering) {
    const k = `${c.dayOfWeek}|${c.slotId}`;
    coveringByKey.set(k, [...(coveringByKey.get(k) ?? []), c]);
  }
  const groupsByKey = new Map<string, string[]>();
  for (const g of groupRows) {
    const k = `${g.subjectId}|${g.classId}`;
    groupsByKey.set(k, [...(groupsByKey.get(k) ?? []), g.name]);
  }

  // Calcul des deltas volume horaire (programmé vs hoursPerWeek)
  const deltas = computeAssignmentDeltas(
    assignments.map((a) => ({
      teacherId: a.teacherId,
      subjectId: a.subjectId,
      classId: a.classId,
      hoursPerWeek: a.hoursPerWeek,
    })),
    entries.map((e) => ({
      teacherId: e.teacherId,
      subjectId: e.subjectId,
      classId: e.classId,
      durationMinutes: slotDurationMinutes(e.slot.startTime, e.slot.endTime),
    })),
  );
  // Pour le rendu, on enrichit avec les labels
  const subjectLabels = new Map(
    assignments.map((a) => [`${a.subjectId}|${a.classId}`, {
      subject: localizedLabel(locale, a.subject.label, a.subject.labelAr),
      className: localizedLabel(locale, a.class.name, a.class.nameAr),
    }]),
  );
  // Pour les deltas « extra » sans assignment, on lookup via entries
  const extraLookup = new Map(
    entries
      .filter((e) => e.subject && e.classId)
      .map((e) => [`${e.subjectId}|${e.classId}`, {
        subject: e.subject?.label ?? '—',
        className: localizedLabel(locale, e.class.name, e.class.nameAr),
      }]),
  );

  // Index entries par (day, slot)
  const byKey = new Map<string, (typeof entries)[number]>();
  for (const e of entries) byKey.set(`${e.dayOfWeek}|${e.slotId}`, e);

  const totalCourses = entries.length;
  const distinctClasses = new Set(entries.map((e) => e.classId)).size;
  const distinctSubjects = new Set(entries.map((e) => e.subjectId).filter(Boolean)).size;

  return (
    <div className={PERSON_PAGE_SHELL}>
      <PersonHeader personId={id} locale={locale} active="timetable" />

      <header className="-mx-4 sm:-mx-6 overflow-hidden rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-3 mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {t('teacherWeek')}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t('teacherWeekSummary', {
              total: totalCourses,
              classes: distinctClasses,
              subjects: distinctSubjects,
            })}
          </p>
        </div>
        <form className="flex items-center gap-2">
          <label className="text-xs text-slate-500">{t('year')}</label>
          <select
            name="year"
            defaultValue={yearId ?? ''}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
                {y.active ? ' ★' : ''}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs hover:bg-slate-50"
          >
            {t('apply')}
          </button>
        </form>
      </header>

      {deltas.length > 0 && (
        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-700">{t('volumeTitle')}</h2>
          <p className="mt-1 text-xs text-slate-500">{t('volumeSubtitle')}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-2 text-start">{t('volume.subject')}</th>
                  <th className="px-2 py-2 text-start">{t('volume.class')}</th>
                  <th className="px-2 py-2 text-end">{t('volume.expected')}</th>
                  <th className="px-2 py-2 text-end">{t('volume.scheduled')}</th>
                  <th className="px-2 py-2 text-end">{t('volume.delta')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deltas.map((d, i) => {
                  const meta =
                    subjectLabels.get(`${d.subjectId}|${d.classId}`) ??
                    extraLookup.get(`${d.subjectId}|${d.classId}`);
                  const isExtra = d.expectedHours === null;
                  const overShoot =
                    d.expectedHours !== null && d.deltaHours > 0.01;
                  const underShoot =
                    d.expectedHours !== null && d.deltaHours < -0.01;
                  return (
                    <tr key={i} className={isExtra ? 'bg-amber-50/40' : ''}>
                      <td className="px-2 py-2">{meta?.subject ?? '—'}</td>
                      <td className="px-2 py-2 text-slate-600">{meta?.className ?? '—'}</td>
                      <td className="px-2 py-2 text-end tabular-nums">
                        {d.expectedHours !== null ? `${d.expectedHours}h` : '—'}
                      </td>
                      <td className="px-2 py-2 text-end tabular-nums">{d.scheduledHours}h</td>
                      <td className="px-2 py-2 text-end tabular-nums">
                        {isExtra && groupsByKey.has(`${d.subjectId}|${d.classId}`) ? (
                          // Cours de groupe : enseignant désigné sur le groupe, pas
                          // d'affectation à la matière — ce n'est pas une anomalie.
                          <span className="text-sky-700">
                            👥 {t('volume.groupTeacher', { groups: groupsByKey.get(`${d.subjectId}|${d.classId}`)!.join(', ') })}
                          </span>
                        ) : isExtra ? (
                          <span className="text-amber-700">
                            ⚠ {t('volume.extra')}
                          </span>
                        ) : overShoot ? (
                          <span className="text-red-700">+{d.deltaHours}h</span>
                        ) : underShoot ? (
                          <span className="text-amber-700">{d.deltaHours}h</span>
                        ) : (
                          <span className="text-emerald-700">✓ {t('volume.match')}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="mb-3 flex flex-wrap justify-end gap-2">
        <a
          href={`/api/admin/timetable/teacher/${id}${yearId ? `?year=${yearId}` : ''}`}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          📅 {t('exportIcs')}
        </a>
        <a
          href={`/${locale}/admin/persons/${id}/timetable/print${yearId ? `?year=${yearId}` : ''}`}
          target="_blank"
          rel="noopener"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          🖨 {t('print')}
        </a>
      </div>

      {slots.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          {t('noSlots')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
              <tr>
                <th className="px-3 py-3 text-start">{t('slot')}</th>
                {DAYS.map((d) => (
                  <th key={d} className="px-3 py-3 text-start">
                    {t(`days.${d}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {slots.map((s) => (
                <tr key={s.id} className={s.isBreak ? 'bg-amber-50/30' : ''}>
                  <th className="w-32 px-3 py-2 text-start align-top">
                    <div className="font-medium tabular-nums">{s.startTime}</div>
                    <div className="text-[10px] text-slate-400">{s.endTime}</div>
                  </th>
                  {DAYS.map((d) => {
                    if (s.isBreak) {
                      return (
                        <td
                          key={d}
                          className="px-3 py-2 text-center text-[10px] uppercase text-amber-700"
                        >
                          {s.label ?? t('break')}
                        </td>
                      );
                    }
                    const e = byKey.get(`${d}|${s.id}`);
                    const covers = coveringByKey.get(`${d}|${s.id}`) ?? [];
                    const absents = e ? (absentByKey.get(`${d}|${s.id}`) ?? []) : [];
                    return (
                      <td key={d} className="px-2 py-2 align-top">
                        {e ? (
                          <div className="rounded-lg border border-brand-200 bg-brand-50 p-2 text-[11px] leading-tight">
                            <div className="font-semibold text-slate-900">
                              {e.subject?.label ?? t('untitledCourse')}
                            </div>
                            <Link
                              href={`/${locale}/admin/classes/${e.class.id}`}
                              className="mt-0.5 block text-slate-600 hover:text-brand-700"
                            >
                              {localizedLabel(locale, e.class.name, e.class.nameAr)}
                            </Link>
                            {e.room && (
                              <div className="text-slate-500">📍 {localizedLabel(locale, e.room.label, e.room.labelAr)}</div>
                            )}
                          </div>
                        ) : covers.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-slate-100 p-2 text-center text-[10px] text-slate-300">
                            —
                          </div>
                        ) : null}
                        {absents.map((a) => (
                          <div
                            key={a.id}
                            className="mt-1 rounded-lg border border-rose-300 bg-rose-50 px-2 py-1.5 text-[11px] leading-tight"
                          >
                            <div className="text-[10px] font-semibold uppercase text-rose-700">
                              {t('absentMark')} · {new Date(`${a.date}T00:00:00Z`).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', timeZone: 'UTC' })}
                            </div>
                            <div className="text-slate-600">
                              {a.kind === 'CANCELLED'
                                ? t('absentCancelled')
                                : a.substituteName
                                  ? t('absentBy', { name: a.substituteName })
                                  : t('absentToCover')}
                            </div>
                          </div>
                        ))}
                        {covers.map((c) => (
                          <div
                            key={c.id}
                            className={`rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] leading-tight ${e ? 'mt-1' : ''}`}
                          >
                            <div className="text-[10px] font-semibold uppercase text-amber-700">{t('covering')}</div>
                            <div className="font-semibold text-amber-900">{c.subjectName}</div>
                            <div className="text-slate-600">
                              {c.className} · {new Date(`${c.date}T00:00:00Z`).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', timeZone: 'UTC' })}
                            </div>
                            {c.roomLabel && <div className="text-slate-500">📍 {c.roomLabel}</div>}
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
