import Link from 'next/link';
import { ClassNav } from '../class-nav';
import { notFound, redirect } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { getOrCreateAttendanceSessionAction } from './actions';
import { AttendanceCallSheet } from './call-sheet';

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ date?: string; period?: string }>;
}) {
  const { locale, id } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const sessionAuth = (await auth())!;
  const t = await getTranslations('admin.attendance');

  // Récupère la classe pour afficher le contexte
  const cls = await withTenant(sessionAuth.user.tenantId, (tx) =>
    tx.class.findUnique({
      where: { id },
      include: { level: { include: { cycle: true } }, academicYear: true },
    }),
  );
  if (!cls) notFound();
  if (cls.deletedAt) redirect(`/${locale}/admin/classes/${id}`);

  // Récupère/crée la session
  const result = await getOrCreateAttendanceSessionAction({
    classId: id,
    date: sp.date,
    periodLabel: sp.period,
  });
  if (!result.ok) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
          {result.error}
        </div>
      </div>
    );
  }

  const { sessionId, finalizedAt, date, records } = result.data!;

  // Enrichir avec les justifications existantes + l'ID du record (nécessaire pour les actions)
  const enriched = await withTenant(sessionAuth.user.tenantId, async (tx) => {
    const dbRecords = await tx.attendanceRecord.findMany({
      where: { sessionId },
      include: { justification: true },
    });
    const byStudent = new Map<string, (typeof dbRecords)[number]>();
    for (const r of dbRecords) byStudent.set(r.studentId, r);
    return records.map((r) => {
      const full = byStudent.get(r.studentId);
      return {
        ...r,
        recordId: full?.id ?? '',
        justification: full?.justification
          ? {
              id: full.justification.id,
              reason: full.justification.reason,
              status: full.justification.status as 'PENDING' | 'APPROVED' | 'REJECTED',
              reviewNote: full.justification.reviewNote,
            }
          : null,
      };
    });
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <nav className="mb-4 text-xs text-slate-500">
        <Link href={`/${locale}/admin/classes`} className="hover:text-brand-700">
          {t('classes')}
        </Link>
        <span className="mx-1.5">›</span>
        <Link href={`/${locale}/admin/classes/${id}`} className="hover:text-brand-700">
          {cls.name}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{t('callOf', { date: new Date(date).toLocaleDateString(locale) })}</span>
      </nav>

      <header className="mb-5">
        <header className="mb-4 -mx-6 overflow-hidden rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">
          {t('title')} — {cls.name}
        </h1>
        <ClassNav classId={id} locale={locale} />
      </header>
        <p className="mt-1 text-sm text-slate-500">
          {cls.level.cycle.label} · {cls.level.label} · {cls.academicYear.label}
        </p>
        {finalizedAt && (
          <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {t('finalized', { date: new Date(finalizedAt).toLocaleString(locale) })}
          </div>
        )}
      </header>

      {enriched.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          {t('noStudents')}
        </div>
      ) : (
        <AttendanceCallSheet
          sessionId={sessionId}
          locale={locale}
          isFinalized={!!finalizedAt}
          initialRecords={enriched}
          backUrl={`/${locale}/admin/classes/${id}`}
        />
      )}
    </div>
  );
}
