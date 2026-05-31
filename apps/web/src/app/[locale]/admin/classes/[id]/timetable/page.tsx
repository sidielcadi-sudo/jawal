import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import {
  detectConflicts,
  type EntryLite,
  type DayKey,
} from '@/lib/timetable-conflicts';
import {
  isInAvailability,
  type AvailabilityMap,
} from '@/lib/timetable-validation';
import { TimetableGrid, type GridEntry, type GridSlot, type SubjectOpt, type TeacherOpt, type RoomOpt } from './grid';
import { OverridesPanel } from './overrides';

const DAYS: DayKey[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export default async function ClassTimetablePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.timetable');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const cls = await tx.class.findUnique({
      where: { id },
      include: { academicYear: true, level: { include: { cycle: true } } },
    });
    if (!cls) return null;

    const slots = await tx.timetableSlot.findMany({
      orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
    });

    const entries = await tx.timetableEntry.findMany({
      where: { classId: id, academicYearId: cls.academicYearId },
      include: {
        subject: { select: { id: true, label: true } },
        teacher: {
          select: { id: true, firstName: true, lastName: true, availability: true },
        },
        room: { select: { id: true, code: true, label: true } },
      },
    });

    // Overrides à venir sur les séances de cette classe (à partir d'aujourd'hui)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const overrides = await tx.timetableOverride.findMany({
      where: {
        entry: { classId: id, academicYearId: cls.academicYearId },
        date: { gte: today },
      },
      include: {
        entry: {
          include: {
            subject: { select: { label: true } },
            teacher: { select: { firstName: true, lastName: true } },
            slot: { select: { startTime: true, endTime: true } },
          },
        },
        substituteTeacher: { select: { firstName: true, lastName: true } },
        substituteRoom: { select: { label: true } },
        substituteSubject: { select: { label: true } },
      },
      orderBy: { date: 'asc' },
    });

    // Pour la détection conflits : on charge TOUTES les entries de l'année sur
    // les mêmes slots/days afin de détecter prof/salle déjà occupés ailleurs.
    const allEntriesYear = await tx.timetableEntry.findMany({
      where: { academicYearId: cls.academicYearId },
      include: { class: { select: { name: true } } },
    });

    const subjects = await tx.subject.findMany({ orderBy: { label: 'asc' } });
    const teachers = await tx.person.findMany({
      where: { type: 'TEACHER', deletedAt: null },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const rooms = await tx.room.findMany({ orderBy: { code: 'asc' } });

    return { cls, slots, entries, allEntriesYear, overrides, subjects, teachers, rooms };
  });

  if (!data) notFound();

  const { cls, slots, entries, allEntriesYear, overrides, subjects, teachers, rooms } = data;

  // Détection conflits sur l'année entière (l'UI met en évidence les cases
  // de CETTE classe qui sont en conflit ailleurs)
  const lite: EntryLite[] = allEntriesYear.map((e) => ({
    id: e.id,
    classId: e.classId,
    className: e.class.name,
    dayOfWeek: e.dayOfWeek as DayKey,
    slotId: e.slotId,
    teacherId: e.teacherId,
    roomId: e.roomId,
  }));
  const conflicts = detectConflicts(lite);
  // Restreint aux conflits qui touchent CETTE classe
  const myEntryIds = new Set(entries.map((e) => e.id));
  const relevantConflicts = conflicts.filter((c) =>
    c.entryIds.some((id) => myEntryIds.has(id)),
  );

  // Violations de dispo prof : pour chaque entry de CETTE classe avec un prof,
  // on vérifie que le créneau est inclus dans Person.availability.
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const availabilityWarnings: Array<{
    entryId: string;
    teacherName: string;
    dayOfWeek: DayKey;
    slotLabel: string;
  }> = [];
  for (const e of entries) {
    if (!e.teacher || !e.teacherId) continue;
    const slot = slotById.get(e.slotId);
    if (!slot || slot.isBreak) continue;
    const av = (e.teacher.availability as AvailabilityMap | null) ?? null;
    const dk = e.dayOfWeek as DayKey;
    if (!isInAvailability(dk, slot.startTime, slot.endTime, av)) {
      availabilityWarnings.push({
        entryId: e.id,
        teacherName: `${e.teacher.lastName} ${e.teacher.firstName}`,
        dayOfWeek: dk,
        slotLabel: `${slot.startTime}-${slot.endTime}`,
      });
    }
  }

  const gridSlots: GridSlot[] = slots.map((s) => ({
    id: s.id,
    startTime: s.startTime,
    endTime: s.endTime,
    label: s.label,
    isBreak: s.isBreak,
  }));
  const gridEntries: GridEntry[] = entries.map((e) => ({
    id: e.id,
    dayOfWeek: e.dayOfWeek as DayKey,
    slotId: e.slotId,
    subjectId: e.subjectId,
    subjectLabel: e.subject?.label ?? null,
    teacherId: e.teacherId,
    teacherName: e.teacher ? `${e.teacher.lastName} ${e.teacher.firstName}` : null,
    roomId: e.roomId,
    roomLabel: e.room ? e.room.label : null,
    note: e.note,
  }));

  const subjectOpts: SubjectOpt[] = subjects.map((s) => ({ id: s.id, label: s.label }));
  const teacherOpts: TeacherOpt[] = teachers.map((p) => ({
    id: p.id,
    label: `${p.lastName} ${p.firstName}`,
  }));
  const roomOpts: RoomOpt[] = rooms.map((r) => ({
    id: r.id,
    label: `${r.code} — ${r.label}`,
  }));

  // Options pour le panel overrides : "Lundi 08:00 — Mathématiques"
  const entryOpts = entries
    .map((e) => {
      const slot = slotById.get(e.slotId);
      if (!slot) return null;
      return {
        id: e.id,
        label: `${t(`days.${e.dayOfWeek as DayKey}`)} ${slot.startTime} — ${e.subject?.label ?? '—'}`,
      };
    })
    .filter((v): v is { id: string; label: string } => v !== null);

  const overridesView = overrides.map((o) => {
    const slot = slotById.get(o.entry.slotId);
    return {
      id: o.id,
      date: o.date.toISOString().slice(0, 10),
      kind: o.kind as 'CANCELLED' | 'SUBSTITUTION',
      reason: o.reason,
      entryLabel: `${t(`days.${o.entry.dayOfWeek as DayKey}`)} ${slot?.startTime ?? ''} — ${o.entry.subject?.label ?? '—'}`,
      substituteTeacher: o.substituteTeacher
        ? `${o.substituteTeacher.lastName} ${o.substituteTeacher.firstName}`
        : null,
      substituteRoom: o.substituteRoom?.label ?? null,
      substituteSubject: o.substituteSubject?.label ?? null,
    };
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/classes`} className="hover:text-brand-700">
          {t('breadcrumbClasses')}
        </Link>
        <span className="mx-1.5">›</span>
        <Link href={`/${locale}/admin/classes/${cls.id}`} className="hover:text-brand-700">
          {cls.name}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{t('title')}</span>
      </nav>

      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {t('title')} — {cls.name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {cls.level.cycle.label} · {cls.level.label} · {cls.academicYear.label}
          </p>
        </div>
        <Link
          href={`/${locale}/admin/settings/timetable-slots`}
          className="text-xs text-brand-700 hover:underline"
        >
          {t('manageSlots')} →
        </Link>
      </header>

      {slots.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          {t('noSlots')}{' '}
          <Link
            href={`/${locale}/admin/settings/timetable-slots`}
            className="font-medium text-amber-800 hover:underline"
          >
            {t('createSlots')} →
          </Link>
        </div>
      ) : (
        <>
          {relevantConflicts.length > 0 && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <strong>{t('conflictsHeader', { count: relevantConflicts.length })}</strong>
              <ul className="mt-2 list-disc ps-5 text-xs">
                {relevantConflicts.slice(0, 8).map((c, i) => (
                  <li key={i}>
                    {c.kind === 'TEACHER'
                      ? t('conflictTeacher', {
                          classes: c.classNames.join(', '),
                          day: t(`days.${c.dayOfWeek}`),
                        })
                      : t('conflictRoom', {
                          classes: c.classNames.join(', '),
                          day: t(`days.${c.dayOfWeek}`),
                        })}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {availabilityWarnings.length > 0 && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <strong>{t('availabilityWarningsHeader', { count: availabilityWarnings.length })}</strong>
              <ul className="mt-2 list-disc ps-5 text-xs">
                {availabilityWarnings.slice(0, 8).map((w, i) => (
                  <li key={i}>
                    {t('availabilityWarning', {
                      teacher: w.teacherName,
                      day: t(`days.${w.dayOfWeek}`),
                      slot: w.slotLabel,
                    })}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <OverridesPanel
            classId={cls.id}
            entries={entryOpts}
            teachers={teacherOpts}
            rooms={roomOpts}
            subjects={subjectOpts}
            overrides={overridesView}
          />

          <div className="mb-3 flex flex-wrap justify-end gap-2">
            <a
              href={`/api/admin/timetable/class/${cls.id}`}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              📅 {t('exportIcs')}
            </a>
            <Link
              href={`/${locale}/admin/classes/${cls.id}/timetable/print`}
              target="_blank"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              🖨 {t('print')}
            </Link>
          </div>

          <TimetableGrid
            locale={locale}
            classId={cls.id}
            academicYearId={cls.academicYearId}
            days={DAYS}
            slots={gridSlots}
            entries={gridEntries}
            conflictEntryIds={new Set(
              relevantConflicts.flatMap((c) => c.entryIds).filter((id) => myEntryIds.has(id)),
            )}
            availabilityWarningIds={new Set(availabilityWarnings.map((w) => w.entryId))}
            subjects={subjectOpts}
            teachers={teacherOpts}
            rooms={roomOpts}
          />
        </>
      )}
    </div>
  );
}
