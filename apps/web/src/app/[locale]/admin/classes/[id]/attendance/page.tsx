import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getClassDaySessions, loadClassAppel } from '@/lib/teacher-attendance';
import { AttendanceCallSheet } from './call-sheet';
import { SessionPicker } from './session-picker';
import { localizedLabel } from '@/lib/localized-name';
import { ClassHeader, CLASS_PAGE_SHELL } from '../class-header';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ date?: string; entry?: string }>;
}) {
  const tCrumb = await getTranslations('admin.classes.detail');
  const { locale, id } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const sessionAuth = (await auth())!;
  const t = await getTranslations('admin.attendance');

  const date = sp.date && ISO_DATE.test(sp.date) ? sp.date : new Date().toISOString().slice(0, 10);

  const data = await withTenant(sessionAuth.user.tenantId, async (tx) => {
    const cls = await tx.class.findUnique({
      where: { id },
      include: { level: { include: { cycle: true } }, academicYear: true },
    });
    if (!cls) return null;

    // Séances de la classe ce jour : le créneau choisi porte la matière et le
    // professeur, et donne la clé (classe × date × créneau) sur laquelle le
    // portail prof écrit lui aussi.
    const daySessions = await getClassDaySessions(tx, id, date);
    const selected = daySessions.find((s) => s.entryId === sp.entry) ?? null;

    // Rien n'est écrit à l'ouverture : la séance naît à l'enregistrement,
    // exactement comme dans le portail enseignant.
    const appel = await loadClassAppel(tx, id, date, selected?.periodLabel ?? null);
    const reasons = await tx.attendanceReason.findMany({
      where: { active: true },
      orderBy: [{ order: 'asc' }, { label: 'asc' }],
      select: { id: true, label: true, color: true },
    });
    return { cls, appel, reasons, daySessions, selected };
  });

  if (!data) notFound();
  const { cls, appel, reasons, daySessions, selected } = data;
  if (cls.deletedAt) redirect(`/${locale}/admin/classes/${id}`);

  const displayName = localizedLabel(locale, cls.name, cls.nameAr);

  return (
    <div className={CLASS_PAGE_SHELL}>
      <ClassHeader cls={cls} locale={locale} current={tCrumb('takeAttendance')} />

      <SessionPicker
        basePath={`/${locale}/admin/classes/${id}/attendance`}
        date={date}
        sessions={daySessions}
        selectedEntryId={selected?.entryId ?? null}
      />

      {appel.rows.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          {t('noStudents')}
        </div>
      ) : (
        <AttendanceCallSheet
          locale={locale}
          classId={id}
          date={date}
          periodLabel={selected?.periodLabel ?? null}
          sessionId={appel.sessionId}
          isFinalized={appel.finalizedAt !== null}
          className={displayName}
          subject={selected?.subject ?? null}
          teacherName={selected?.teacherName ?? null}
          room={selected?.room ?? null}
          slotStart={selected?.slotStart ?? null}
          slotEnd={selected?.slotEnd ?? null}
          rows={appel.rows}
          reasons={reasons}
        />
      )}
    </div>
  );
}
