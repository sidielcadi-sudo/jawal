import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getTeacherPersonId } from '@/lib/teacher';
import { mondayOf } from '@/lib/lesson-book';
import {
  loadTeacherAppel,
  getTeacherWeekAppel,
  type AppelWeekSession,
} from '@/lib/teacher-attendance';
import { AppelFrame } from '../../appel-frame';
import { AppelGrid } from '../../appel-grid';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function TeacherAppelDetailPage({
  params,
}: {
  params: Promise<{ locale: string; entryId: string; date: string }>;
}) {
  const { locale, entryId, date } = await params;
  setRequestLocale(locale);
  if (!ISO_DATE.test(date)) notFound();

  const session = (await auth())!;
  const monday = mondayOf(date);

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const teacherId = await getTeacherPersonId(tx, session.user.id);
    if (!teacherId) return null;
    const detail = await loadTeacherAppel(tx, teacherId, entryId, date);
    if (!detail) return null;
    const week = await getTeacherWeekAppel(tx, teacherId, monday);
    const reasons = await tx.attendanceReason.findMany({
      where: { active: true },
      orderBy: [{ order: 'asc' }, { label: 'asc' }],
      select: { id: true, label: true, color: true },
    });
    return { detail, week, reasons };
  });
  if (!data) notFound();

  const week = data.week as { days: { date: string; dow: string }[]; sessions: AppelWeekSession[] };

  return (
    <AppelFrame
      locale={locale}
      monday={monday}
      days={week.days}
      sessions={week.sessions}
      activeKey={`${entryId}|${date}`}
    >
      <AppelGrid
        locale={locale}
        entryId={entryId}
        date={date}
        sessionId={data.detail.sessionId}
        isFinalized={data.detail.finalizedAt !== null}
        className={data.detail.className}
        subject={data.detail.subject}
        room={data.detail.room}
        slotStart={data.detail.slotStart}
        slotEnd={data.detail.slotEnd}
        rows={data.detail.rows}
        reasons={data.reasons}
      />
    </AppelFrame>
  );
}
