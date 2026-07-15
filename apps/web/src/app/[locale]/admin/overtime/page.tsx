import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { CreateOvertimeForm, GenerateButton, WorkflowButtons, ExportCsvButton } from './overtime-client';

const STATUS_BADGE: Record<string, string> = {
  DECLARED: 'bg-slate-100 text-slate-600',
  RH_VALIDATED: 'bg-sky-100 text-sky-700',
  DIRECTION_APPROVED: 'bg-indigo-100 text-indigo-700',
  PROCESSED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
};
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export default async function OvertimePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.overtime');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const now = new Date();
    const year =
      (await tx.academicYear.findFirst({ where: { startDate: { lte: now }, endDate: { gte: now } } })) ??
      (await tx.academicYear.findFirst({ orderBy: { startDate: 'desc' } }));

    const [staff, entries, teachers, schedEntries] = await Promise.all([
      tx.person.findMany({ where: { type: { in: ['STAFF', 'TEACHER'] }, deletedAt: null }, orderBy: [{ lastName: 'asc' }], select: { id: true, firstName: true, lastName: true } }),
      tx.overtimeEntry.findMany({ orderBy: { date: 'desc' }, take: 200, include: { person: { select: { firstName: true, lastName: true } } } }),
      tx.person.findMany({ where: { type: 'TEACHER', deletedAt: null, contractualHoursPerWeek: { not: null } }, select: { id: true, firstName: true, lastName: true, contractualHoursPerWeek: true } }),
      year
        ? tx.timetableEntry.findMany({ where: { academicYearId: year.id, teacherId: { not: null }, slot: { isBreak: false } }, select: { teacherId: true, slot: { select: { startTime: true, endTime: true } } } })
        : Promise.resolve([] as { teacherId: string | null; slot: { startTime: string; endTime: string } }[]),
    ]);

    // Heures planifiées / semaine par enseignant.
    const sched = new Map<string, number>();
    for (const e of schedEntries) {
      const h = (toMin(e.slot.endTime) - toMin(e.slot.startTime)) / 60;
      sched.set(e.teacherId!, (sched.get(e.teacherId!) ?? 0) + h);
    }
    const overQuota = teachers
      .map((te) => {
        const scheduled = Math.round((sched.get(te.id) ?? 0) * 100) / 100;
        const quota = te.contractualHoursPerWeek ?? 0;
        return { name: `${te.lastName} ${te.firstName}`, scheduled, quota, over: Math.round((scheduled - quota) * 100) / 100 };
      })
      .filter((x) => x.over > 0)
      .sort((a, b) => b.over - a.over);

    return { staff, entries, overQuota };
  });

  const { staff, entries, overQuota } = data;
  const csvRows = entries.map((e) => [
    `${e.person.lastName} ${e.person.firstName}`,
    new Date(e.date).toISOString().slice(0, 10),
    e.hours,
    t(`source.${e.source}`),
    t(`statusLabel.${e.status}`),
  ]);

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">⏱️ {t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-600">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <GenerateButton />
          <ExportCsvButton rows={csvRows} />
        </div>
      </header>

      {/* Saisie manuelle */}
      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">{t('manual')}</h2>
        <CreateOvertimeForm staff={staff.map((s) => ({ id: s.id, label: `${s.lastName} ${s.firstName}` }))} />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Heures sup */}
        <section className="lg:col-span-2">
          <h2 className="mb-2 text-base font-semibold text-slate-900">{t('entries')}</h2>
          <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                <tr>
                  <th className="px-3 py-2.5 text-start">{t('employee')}</th>
                  <th className="px-3 py-2.5 text-start">{t('date')}</th>
                  <th className="px-3 py-2.5 text-end">{t('hours')}</th>
                  <th className="px-3 py-2.5 text-start">{t('sourceLabel')}</th>
                  <th className="px-3 py-2.5 text-center">{t('status')}</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="px-3 py-2 font-medium text-slate-800">{e.person.lastName} {e.person.firstName}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{new Date(e.date).toLocaleDateString(locale)}</td>
                    <td className="px-3 py-2 text-end tabular-nums text-slate-700">{e.hours} h</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{t(`source.${e.source}`)}</td>
                    <td className="px-3 py-2 text-center"><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE[e.status]}`}>{t(`statusLabel.${e.status}`)}</span></td>
                    <td className="px-3 py-2 text-end"><WorkflowButtons id={e.id} status={e.status} /></td>
                  </tr>
                ))}
                {entries.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">{t('empty')}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        {/* Dépassement de quota (informatif) */}
        <aside>
          <h2 className="mb-2 text-base font-semibold text-slate-900">{t('overQuota')}</h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="mb-2 text-[11px] text-slate-400">{t('overQuotaHint')}</p>
            <ul className="divide-y divide-slate-100 text-sm">
              {overQuota.map((q) => (
                <li key={q.name} className="flex items-center justify-between py-1.5">
                  <span className="text-slate-700">{q.name}</span>
                  <span className="tabular-nums text-amber-700">
                    +{q.over} h
                    <span className="ms-1 text-[11px] font-normal text-slate-400">({q.scheduled}/{q.quota})</span>
                  </span>
                </li>
              ))}
              {overQuota.length === 0 && <li className="py-3 text-center text-xs text-slate-400">{t('overQuotaEmpty')}</li>}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
