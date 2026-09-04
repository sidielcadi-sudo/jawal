import Link from 'next/link';
import { ClassNav } from '../class-nav';
import { notFound, redirect } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getClassDaySessions, loadClassAppel } from '@/lib/teacher-attendance';
import { AttendanceCallSheet } from './call-sheet';
import { SessionPicker } from './session-picker';
import { localizedLabel } from '@/lib/localized-name';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ date?: string; entry?: string }>;
}) {
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
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={`/${locale}/admin/classes`} className="hover:text-brand-700">
          {t('classes')}
        </Link>
        <span className="mx-1.5">›</span>
        <Link href={`/${locale}/admin/classes/${id}`} className="hover:text-brand-700">
          {displayName}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{t('callOf', { date: new Date(`${date}T00:00:00.000Z`).toLocaleDateString(locale) })}</span>
      </nav>

      <header className="mb-5">
        <div className="-mx-6 mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-2xl border border-brand-200 title-band px-4 py-3 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">
            {t('title')} — {displayName}
          </h1>
          <ClassNav classId={id} locale={locale} />
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {localizedLabel(locale, cls.level.cycle.label, cls.level.cycle.labelAr)} ·{' '}
          {localizedLabel(locale, cls.level.label, cls.level.labelAr)} · {cls.academicYear.label}
        </p>
      </header>

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
