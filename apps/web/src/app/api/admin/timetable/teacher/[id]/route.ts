import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import {
  buildIcs,
  type IcsEntry,
  type IcsOverride,
} from '@/lib/timetable-ics';
import type { DayKey } from '@/lib/timetable-conflicts';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const url = new URL(req.url);
  const yearParam = url.searchParams.get('year');
  const tenantId = session.user.tenantId;

  const data = await withTenant(tenantId, async (tx) => {
    const teacher = await tx.person.findUnique({
      where: { id },
      select: { firstName: true, lastName: true, type: true },
    });
    if (!teacher) return null;

    const year = yearParam
      ? await tx.academicYear.findUnique({ where: { id: yearParam } })
      : await tx.academicYear.findFirst({ where: { active: true } });
    if (!year) return null;

    const entries = await tx.timetableEntry.findMany({
      where: { teacherId: id, academicYearId: year.id },
      include: {
        subject: { select: { label: true } },
        class: { select: { name: true } },
        room: { select: { label: true } },
        slot: { select: { startTime: true, endTime: true } },
      },
    });

    // Overrides où ce prof est l'original OU le remplaçant
    const overrides = await tx.timetableOverride.findMany({
      where: {
        OR: [
          { entry: { teacherId: id, academicYearId: year.id } },
          { substituteTeacherId: id },
        ],
      },
      include: {
        entry: {
          include: {
            slot: { select: { startTime: true, endTime: true } },
            subject: { select: { label: true } },
            class: { select: { name: true } },
          },
        },
        substituteTeacher: { select: { firstName: true, lastName: true } },
        substituteRoom: { select: { label: true } },
        substituteSubject: { select: { label: true } },
      },
    });

    const tenant = await tx.tenant.findFirstOrThrow();
    return { teacher, year, entries, overrides, tenant };
  });

  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { teacher, year, entries, overrides, tenant } = data;

  const icsEntries: IcsEntry[] = entries.map((e) => ({
    id: e.id,
    uid: `${e.id}@jawal-${tenant.slug}-teacher`,
    summary: `${e.subject?.label ?? 'Cours'} — ${e.class.name}`,
    description: e.room ? `Salle ${e.room.label}` : undefined,
    location: e.room?.label,
    dayOfWeek: e.dayOfWeek as DayKey,
    startTime: e.slot.startTime,
    endTime: e.slot.endTime,
  }));

  const icsOverrides: IcsOverride[] = overrides.map((o) => ({
    entryId: o.entryId,
    date: o.date.toISOString().slice(0, 10),
    kind: o.kind as 'CANCELLED' | 'SUBSTITUTION',
    summary:
      o.kind === 'SUBSTITUTION'
        ? `[Remplacement] ${o.substituteSubject?.label ?? o.entry.subject?.label ?? ''} — ${o.entry.class.name}`.trim()
        : undefined,
    description: o.reason ?? undefined,
    location: o.substituteRoom?.label,
    startTime: o.entry.slot.startTime,
    endTime: o.entry.slot.endTime,
  }));

  const ics = buildIcs({
    calName: `${tenant.name} — ${teacher.lastName} ${teacher.firstName}`,
    yearStart: year.startDate,
    yearEnd: year.endDate,
    entries: icsEntries,
    overrides: icsOverrides,
    tzid: tenant.timezone,
  });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${teacher.lastName}-${teacher.firstName}-edt.ics"`,
    },
  });
}
