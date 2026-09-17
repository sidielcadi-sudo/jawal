import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { requireRoleCode } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { pickPeriodId, schoolPeriods } from '@/lib/periods';
import { localizedLabel } from '@/lib/localized-name';
import {
  summarizeAttendance,
  absenceVolume,
  slotMinutes,
  formatMinutes,
  type AttendanceEntry,
} from '@/lib/student-record';
import { PersonHeader, PERSON_PAGE_SHELL } from '../person-header';
import { PeriodTabs } from '../period-tabs';
import { resolveStudentSchooling } from '../schooling';

const TYPE_TONE: Record<string, string> = {
  ABSENT: 'bg-red-100 text-red-800',
  LATE: 'bg-amber-100 text-amber-800',
  EXCUSED: 'bg-sky-100 text-sky-800',
};

/**
 * Absences & retards d'un élève, sur un trimestre.
 *
 * Le détail vient des feuilles d'appel ; la justification et son traitement
 * viennent de la vie scolaire. On rapproche les deux ici, parce que c'est la
 * question qu'on pose devant un dossier : combien d'heures, et lesquelles sont
 * couvertes.
 */
export default async function StudentAbsencesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { locale, id } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireRoleCode(['tenant_admin', 'direction', 'scolarite', 'cpe']);
  const session = (await auth())!;
  const t = await getTranslations('admin.studentAbsences');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const student = await tx.person.findFirst({
      where: { id, type: 'STUDENT' },
      select: { id: true },
    });
    if (!student) return null;

    const schooling = await resolveStudentSchooling(tx, id);
    const year = schooling?.year ?? null;
    // Trimestres seulement : une session d'examen n'est pas une période d'absences.
    const periods = schoolPeriods(schooling?.periods ?? []);
    const periodId = pickPeriodId(periods, sp.period);
    const period = periods.find((p) => p.id === periodId) ?? null;

    // Sans trimestre défini, on prend l'année : mieux vaut un écran qui montre
    // l'assiduité de l'année qu'un écran vide parce qu'un paramétrage manque.
    const window = period
      ? { gte: period.startDate, lte: period.endDate }
      : year
        ? { gte: year.startDate, lte: year.endDate }
        : undefined;

    const records = await tx.attendanceRecord.findMany({
      where: {
        studentId: id,
        ...(window ? { session: { date: window } } : {}),
      },
      orderBy: { session: { date: 'desc' } },
      select: {
        id: true,
        status: true,
        lateMinutes: true,
        note: true,
        lateReason: { select: { label: true } },
        justification: {
          select: { reason: true, status: true, attachmentUrl: true },
        },
        event: {
          select: { status: true, justifReason: true, processedByUserId: true },
        },
        session: {
          select: {
            date: true,
            periodLabel: true,
            class: { select: { name: true, nameAr: true } },
          },
        },
      },
    });

    // « Traité par » : seul l'événement vie scolaire porte un utilisateur.
    const userIds = [...new Set(records.map((r) => r.event?.processedByUserId).filter(Boolean))] as string[];
    const users = userIds.length
      ? await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } })
      : [];
    const userById = new Map(users.map((u) => [u.id, u.email]));

    return { periods, periodId, period, records, userById, year, fallback: schooling?.fallback ?? false };
  });

  if (!data) notFound();

  const { periods, periodId, period, records, userById } = data;

  const entries: AttendanceEntry[] = records.map((r) => ({
    status: r.status as AttendanceEntry['status'],
    periodLabel: r.session.periodLabel,
    lateMinutes: r.lateMinutes,
    justified: r.justification?.status === 'APPROVED',
  }));
  const s = summarizeAttendance(entries);
  const total = absenceVolume(s.absences, s.absenceMinutes);
  const unjustified = absenceVolume(s.unjustifiedAbsences, s.unjustifiedMinutes);

  // Seuls les incidents : une feuille d'appel de 180 présences n'apprend rien.
  const incidents = records.filter((r) => r.status !== 'PRESENT');

  return (
    <div className={PERSON_PAGE_SHELL}>
      <PersonHeader personId={id} locale={locale} active="absences" />

      {/* Même repli que sur l'écran Notes : l'année active sans trimestre
          rendrait un bilan vide alors que l'historique existe. */}
      {data.fallback && data.year && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          {t('fallbackYear', { year: data.year.label })}
        </p>
      )}

      <PeriodTabs periods={periods} current={periodId ?? ''} />

      {!period && periods.length === 0 && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          {t('noPeriodFallback')}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Mini
          label={total.unit === 'hours' ? t('kpi.totalHours') : t('kpi.totalSessions')}
          value={total.value}
          tone={s.absences > 0 ? 'text-amber-700' : 'text-slate-400'}
        />
        <Mini
          label={t('kpi.unjustified')}
          value={unjustified.value}
          tone={s.unjustifiedAbsences > 0 ? 'text-red-700' : 'text-emerald-700'}
        />
        <Mini
          label={t('kpi.lates')}
          value={
            s.lateMinutes > 0
              ? t('kpi.lateWithMinutes', { count: s.lates, minutes: formatMinutes(s.lateMinutes) })
              : t('kpi.lateCount', { count: s.lates })
          }
        />
        <Mini
          label={t('kpi.attendance')}
          value={s.attendanceRate === null ? '—' : `${s.attendanceRate} %`}
          tone={
            s.attendanceRate === null
              ? 'text-slate-400'
              : s.attendanceRate >= 95
                ? 'text-emerald-700'
                : s.attendanceRate >= 90
                  ? 'text-amber-700'
                  : 'text-red-700'
          }
        />
      </div>

      <h2 className="mb-3 mt-6 text-base font-semibold text-slate-900">{t('tableTitle')}</h2>

      <div className="overflow-x-auto rounded-2xl border border-brand-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-4 py-3 text-start">{t('table.date')}</th>
              <th className="px-4 py-3 text-start">{t('table.type')}</th>
              <th className="px-4 py-3 text-start">{t('table.duration')}</th>
              <th className="px-4 py-3 text-start">{t('table.reason')}</th>
              <th className="px-4 py-3 text-start">{t('table.justification')}</th>
              <th className="px-4 py-3 text-start">{t('table.handledBy')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {incidents.map((r) => {
              const mins = slotMinutes(r.session.periodLabel);
              const handler = r.event?.processedByUserId
                ? userById.get(r.event.processedByUserId)
                : null;
              return (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">
                      {r.session.date.toLocaleDateString(locale)}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {r.session.periodLabel ?? '—'} ·{' '}
                      {localizedLabel(locale, r.session.class.name, r.session.class.nameAr)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        TYPE_TONE[r.status] ?? 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {t(`type.${r.status}` as never)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {r.status === 'LATE'
                      ? r.lateMinutes
                        ? formatMinutes(r.lateMinutes)
                        : '—'
                      : mins !== null
                        ? formatMinutes(mins)
                        : t('oneSession')}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {r.justification?.reason ??
                      r.event?.justifReason ??
                      r.lateReason?.label ??
                      r.note ??
                      t('noReason')}
                  </td>
                  <td className="px-4 py-3">
                    <JustificationBadge
                      status={r.justification?.status ?? null}
                      hasAttachment={Boolean(r.justification?.attachmentUrl)}
                      t={t}
                    />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{handler ?? '—'}</td>
                </tr>
              );
            })}
            {incidents.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                  {t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-slate-400">{t('handledByNote')}</p>
    </div>
  );
}

/**
 * État du justificatif.
 *
 * Quatre états et non deux : « déposé, en attente » n'est pas « refusé », et
 * « rien de déposé » n'est pas « refusé » non plus — les confondre ferait
 * relancer des familles qui ont déjà fourni leur certificat.
 */
function JustificationBadge({
  status,
  hasAttachment,
  t,
}: {
  status: string | null;
  hasAttachment: boolean;
  t: (k: string) => string;
}) {
  if (status === 'APPROVED') {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
        {hasAttachment ? t('justif.approvedWithDoc') : t('justif.approved')}
      </span>
    );
  }
  if (status === 'PENDING') {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
        {hasAttachment ? t('justif.pending') : t('justif.pendingNoDoc')}
      </span>
    );
  }
  if (status === 'REJECTED') {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800">
        {t('justif.rejected')}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700">
      {t('justif.none')}
    </span>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className={`text-2xl font-extrabold tabular-nums ${tone ?? 'text-brand-800'}`}>
        {value}
      </div>
    </div>
  );
}
