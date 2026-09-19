import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { can } from '@/lib/auth/rbac';
import { SeedTypesButton, LeaveHeader, RequestRowActions } from './leave-client';
import { personDisplayName } from '@/lib/localized-name';
import { JustificationUpload } from '@/components/leave/justification-upload';

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

export default async function LeavePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.leave');
  // L'approbation/refus/annulation reste réservée aux gestionnaires (tenants.manage).
  // La vie scolaire voit la liste et les remplacements, sans ces actions.
  const canManage = await can('tenants.manage');
  const justifLabels = {
    view: t('justificationView'),
    add: t('justificationAdd'),
    replace: t('justificationReplace'),
  };

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const activeYear = await tx.academicYear.findFirst({
      where: { active: true },
      select: { startDate: true, endDate: true },
    });
    const [types, staff, requests] = await Promise.all([
      tx.leaveType.findMany({ where: { active: true }, orderBy: { order: 'asc' } }),
      tx.person.findMany({
        where: { type: { in: ['STAFF', 'TEACHER'] }, deletedAt: null },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: { id: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true, hireDate: true },
      }),
      tx.leaveRequest.findMany({
        // Année active seulement : les congés des exercices clos encombrent
        // la liste et faussent les compteurs.
        where: activeYear ? { startDate: { gte: activeYear.startDate, lte: activeYear.endDate } } : {},
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { person: { select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true, type: true } }, leaveType: { select: { labelFr: true, labelAr: true } } },
      }),
    ]);
    const annual = types.find((t) => t.code === 'ANNUAL') ?? null;

    // Absences du personnel sur l'année scolaire en cours : on compte les
    // journées pointées ABSENT. EXCUSED et LEAVE sont exclus — un congé
    // approuvé n'est pas une absence, il est déjà suivi plus haut.
    const year = activeYear;
    const absenceByPerson = await tx.staffAttendance.groupBy({
      by: ['personId', 'status'],
      where: {
        // Les congés approuvés comptent aussi : ils viennent des demandes de
        // cette page, et les voir absents d'ici n'avait pas de sens.
        status: { in: ['ABSENT', 'LATE', 'LEAVE'] },
        ...(year ? { date: { gte: year.startDate, lte: year.endDate } } : {}),
      },
      _count: { _all: true },
    });
    const takenByPerson = annual
      ? await tx.leaveRequest.groupBy({
          by: ['personId'],
          where: { status: 'APPROVED', leaveTypeId: annual.id },
          _sum: { days: true },
        })
      : [];
    return { types, staff, requests, annual, takenByPerson, absenceByPerson };
  });

  const { types, staff, requests, annual, takenByPerson, absenceByPerson } = data;
  // Trois compteurs distincts : un jour de congé approuvé n'est ni une
  // absence ni un retard (le « else » d'origine le comptait en retard).
  const absMap = new Map<string, { absent: number; late: number; leave: number }>();
  for (const g of absenceByPerson) {
    const cur = absMap.get(g.personId) ?? { absent: 0, late: 0, leave: 0 };
    if (g.status === 'ABSENT') cur.absent += g._count._all;
    else if (g.status === 'LATE') cur.late += g._count._all;
    else if (g.status === 'LEAVE') cur.leave += g._count._all;
    absMap.set(g.personId, cur);
  }
  // Le plus absent en tête : c'est ce que le bloc sert à repérer.
  const absRows = staff
    .map((sp) => ({ person: sp, ...(absMap.get(sp.id) ?? { absent: 0, late: 0, leave: 0 }) }))
    .filter((r) => r.absent + r.late + r.leave > 0)
    .sort((a, b) => b.absent + b.leave - (a.absent + a.leave) || b.late - a.late);
  const totalAbsent = absRows.reduce((n, r) => n + r.absent + r.leave, 0);
  const typeLabel = (fr: string, ar: string) => (locale === 'ar' ? ar : fr);

  return (
    <div className="px-3 py-3">
      <LeaveHeader
        title={t('title')}
        subtitle={t('subtitle')}
        reportHref={`/${locale}/admin/leave/rapport`}
        reportLabel={t('report.title')}
        staff={staff.map((s) => ({ id: s.id, label: personDisplayName(locale, s) }))}
        types={types.map((x) => ({ id: x.id, label: typeLabel(x.labelFr, x.labelAr) }))}
        canCreate={canManage}
      />

      {types.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
          <p className="mb-3 text-sm text-slate-600">{t('noTypes')}</p>
          {canManage && <SeedTypesButton />}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Demandes */}
            <section className="lg:col-span-2">
              <h2 className="mb-2 text-base font-semibold text-slate-900">{t('requests')}</h2>
              <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                    <tr>
                      <th className="px-3 py-2.5 text-start">{t('employee')}</th>
                      <th className="px-3 py-2.5 text-start">{t('type')}</th>
                      <th className="px-3 py-2.5 text-start">{t('period')}</th>
                      <th className="px-3 py-2.5 text-end">{t('days')}</th>
                      <th className="px-3 py-2.5 text-center">{t('status')}</th>
                      <th className="px-3 py-2.5 text-center">{t('justification')}</th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {requests.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2.5 font-medium text-slate-800">{personDisplayName(locale, r.person)}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-600">{typeLabel(r.leaveType.labelFr, r.leaveType.labelAr)}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">
                          {new Date(r.startDate).toLocaleDateString(locale)} → {new Date(r.endDate).toLocaleDateString(locale)}
                        </td>
                        <td className="px-3 py-2.5 text-end tabular-nums text-slate-600">
                          {r.days}
                          {r.dayPart !== 'FULL' && (
                            <span className="ms-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                              {r.dayPart === 'SESSIONS'
                                ? t('sessionsShort', { count: r.sessionCount ?? 0 })
                                : t(`dayParts.${r.dayPart}`)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE[r.status]}`}>{t(`statusLabel.${r.status}`)}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <JustificationUpload
                            requestId={r.id}
                            hasFile={!!r.justificationFileId}
                            editable={r.status === 'PENDING'}
                            labels={justifLabels}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-end">
                          <span className="flex items-center justify-end gap-2">
                            {/* Remplacements : validation des séances (profs). L'approbation
                                du congé (Approuver/Refuser) met à jour le pointage. */}
                            {r.person.type === 'TEACHER' &&
                              (r.status === 'APPROVED' || r.status === 'PENDING') && (
                                <a href={`/${locale}/admin/leave/${r.id}/remplacements`} className="text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline">
                                  {t('subs.link')}
                                </a>
                              )}
                            {canManage && <RequestRowActions id={r.id} status={r.status} />}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {requests.length === 0 && (
                      <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">{t('empty')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Absences du personnel — jours pointés ABSENT sur l'année. */}
            <aside>
              <h2 className="mb-2 flex items-baseline justify-between gap-2 text-base font-semibold text-slate-900">
                <span>{t('absencesTitle')}</span>
                <span className="text-sm font-normal tabular-nums text-slate-500">
                  {t('absencesTotal', { days: totalAbsent })}
                </span>
              </h2>
              <div className="rounded-2xl border border-brand-200 bg-white p-4">
                <p className="mb-2 text-[11px] text-slate-400">{t('absencesHint')}</p>
                <ul className="divide-y divide-slate-100 text-sm">
                  {absRows.map((r) => (
                    <li key={r.person.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="min-w-0 truncate text-slate-700">
                        {personDisplayName(locale, r.person)}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span
                          className={`tabular-nums font-medium ${r.absent > 0 ? 'text-red-600' : 'text-slate-400'}`}
                        >
                          {r.absent} {t('daysUnit')}
                        </span>
                        {r.leave > 0 && (
                          <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
                            {t('leaveCount', { count: r.leave })}
                          </span>
                        )}
                        {r.late > 0 && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                            {t('lateCount', { count: r.late })}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                  {absRows.length === 0 && (
                    <li className="py-4 text-center text-xs text-slate-400">{t('absencesEmpty')}</li>
                  )}
                </ul>
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
