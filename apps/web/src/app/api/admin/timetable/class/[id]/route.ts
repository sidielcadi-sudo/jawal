import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import {
  buildIcs,
  type IcsEntry,
  type IcsOverride,
} from '@/lib/timetable-ics';
import type { DayKey } from '@/lib/timetable-conflicts';

/**
 * GET /api/admin/timetable/class/[id].ics
 * Exporte l'EDT semaine type d'une classe au format iCalendar.
 *
 * Note : Next route segments ne supportent pas le suffixe .ics dans l'URL
 * directement, donc la convention pratique est /api/admin/timetable/class/[id]
 * avec Content-Type ics et nom de fichier dans Content-Disposition.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const tenantId = session.user.tenantId;

  const data = await withTenant(tenantId, async (tx) => {
    const cls = await tx.class.findUnique({
      where: { id },
      include: { academicYear: true },
    });
    if (!cls) return null;

    const entries = await tx.timetableEntry.findMany({
      where: { classId: id, academicYearId: cls.academicYearId },
      include: {
        subject: { select: { label: true, labelAr: true } },
        teacher: { select: { firstName: true, lastName: true } },
        room: { select: { label: true, labelAr: true } },
        slot: { select: { startTime: true, endTime: true } },
      },
    });

    const overrides = await tx.timetableOverride.findMany({
      where: {
        entry: { classId: id, academicYearId: cls.academicYearId },
      },
      include: {
        entry: { include: { slot: { select: { startTime: true, endTime: true } } } },
        substituteTeacher: { select: { firstName: true, lastName: true } },
        substituteRoom: { select: { label: true } },
        substituteSubject: { select: { label: true } },
      },
    });

    const tenant = await tx.tenant.findFirstOrThrow();
    return { cls, entries, overrides, tenant };
  });

  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { cls, entries, overrides, tenant } = data;

  const icsEntries: IcsEntry[] = entries.map((e) => ({
    id: e.id,
    uid: `${e.id}@jawal-${tenant.slug}`,
    summary: e.subject?.label ?? 'Cours',
    description: e.teacher
      ? `${e.teacher.lastName} ${e.teacher.firstName}`
      : undefined,
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
        ? `[Remplacement] ${o.substituteSubject?.label ?? ''}`.trim()
        : undefined,
    description: o.substituteTeacher
      ? `${o.substituteTeacher.lastName} ${o.substituteTeacher.firstName}${o.reason ? ' — ' + o.reason : ''}`
      : o.reason ?? undefined,
    location: o.substituteRoom?.label,
    startTime: o.entry.slot.startTime,
    endTime: o.entry.slot.endTime,
  }));

  const ics = buildIcs({
    calName: `${tenant.name} — ${cls.name}`,
    yearStart: cls.academicYear.startDate,
    yearEnd: cls.academicYear.endDate,
    entries: icsEntries,
    overrides: icsOverrides,
    tzid: tenant.timezone,
  });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${cls.name}-edt.ics"`,
    },
  });
}
