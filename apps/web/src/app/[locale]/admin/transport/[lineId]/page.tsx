import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { CreateForm, DeleteButton } from '../transport-client';
import {
  updateLineAction,
  createStopAction,
  deleteStopAction,
  assignStudentAction,
  unassignStudentAction,
} from '../actions';
import { TRANSPORT_DAYS } from '../constants';
import { personDisplayName, type BilingualPerson } from '@/lib/localized-name';

const inputCls =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

export default async function TransportLinePage({
  params,
}: {
  params: Promise<{ locale: string; lineId: string }>;
}) {
  const { locale, lineId } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.transport');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const line = await tx.transportLine.findUnique({
      where: { id: lineId },
      include: { stops: { orderBy: { order: 'asc' }, include: { zone: { select: { name: true } } } } },
    });
    if (!line) return null;
    const [buses, staff, zones, assigned, unassigned, tenant] = await Promise.all([
      tx.bus.findMany({ orderBy: { number: 'asc' }, select: { id: true, number: true } }),
      tx.person.findMany({
        where: { type: 'STAFF', deletedAt: null },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: { id: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true },
      }),
      tx.transportZone.findMany({ orderBy: { order: 'asc' }, select: { id: true, name: true, annualAmount: true } }),
      tx.studentTransport.findMany({
        where: { lineId },
        include: {
          student: { select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } },
          stop: { select: { name: true } },
          zone: { select: { name: true, annualAmount: true } },
        },
      }),
      tx.person.findMany({
        where: { type: 'STUDENT', deletedAt: null, transportAssignment: { is: null } },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: { id: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true },
      }),
      tx.tenant.findFirst({ select: { currency: true } }),
    ]);
    return { line, buses, staff, zones, assigned, unassigned, currency: tenant?.currency ?? 'MAD' };
  });
  if (!data) notFound();
  const { line, buses, staff, zones, assigned, unassigned, currency } = data;
  const staffName = (s: BilingualPerson) => personDisplayName(locale, s);
  const dayLabel = (d: string) => t(`days.${d}`);

  return (
    <div className="px-3 py-3">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/transport`} className="hover:text-brand-700">
          🚍 {t('title')}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{line.name}</span>
      </nav>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Édition de la ligne */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('lines.edit')}</h2>
          <CreateForm action={updateLineAction} className="space-y-3">
            <input type="hidden" name="id" value={line.id} />
            <Field label={t('lines.name')}>
              <input name="name" defaultValue={line.name} required className={`w-full ${inputCls}`} />
            </Field>
            <Field label={t('lines.districts')}>
              <input name="districts" defaultValue={line.districts ?? ''} className={`w-full ${inputCls}`} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('lines.bus')}>
                <select name="busId" defaultValue={line.busId ?? ''} className={`w-full ${inputCls}`}>
                  <option value="">—</option>
                  {buses.map((b) => (
                    <option key={b.id} value={b.id}>{b.number}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('lines.capacity')}>
                <input name="capacity" type="number" min={0} defaultValue={line.capacity} className={`w-full ${inputCls}`} />
              </Field>
              <Field label={t('lines.driver')}>
                <select name="driverId" defaultValue={line.driverId ?? ''} className={`w-full ${inputCls}`}>
                  <option value="">—</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{staffName(s)}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('lines.attendant')}>
                <select name="attendantId" defaultValue={line.attendantId ?? ''} className={`w-full ${inputCls}`}>
                  <option value="">—</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{staffName(s)}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('lines.morningDep')}>
                <input name="morningDeparture" type="time" defaultValue={line.morningDeparture ?? ''} className={`w-full ${inputCls}`} />
              </Field>
              <Field label={t('lines.morningArr')}>
                <input name="morningArrival" type="time" defaultValue={line.morningArrival ?? ''} className={`w-full ${inputCls}`} />
              </Field>
              <Field label={t('lines.eveningDep')}>
                <input name="eveningDeparture" type="time" defaultValue={line.eveningDeparture ?? ''} className={`w-full ${inputCls}`} />
              </Field>
              <Field label={t('lines.eveningArr')}>
                <input name="eveningArrival" type="time" defaultValue={line.eveningArrival ?? ''} className={`w-full ${inputCls}`} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="active" defaultChecked={line.active} className="h-4 w-4 rounded border-slate-300" />
              {t('lines.active')}
            </label>
            <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              {t('save')}
            </button>
          </CreateForm>
        </section>

        {/* Arrêts */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('stops.title')}</h2>
          <CreateForm action={createStopAction} className="mb-3 space-y-2">
            <input type="hidden" name="lineId" value={line.id} />
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <input name="order" type="number" min={0} defaultValue={line.stops.length + 1} placeholder="#" className={`w-16 ${inputCls}`} title={t('stops.order')} />
              <input name="name" required placeholder={t('stops.name')} className={inputCls} />
            </div>
            <input name="address" placeholder={t('stops.address')} className={`w-full ${inputCls}`} />
            <div className="grid grid-cols-2 gap-2">
              <input name="plannedTime" type="time" className={inputCls} title={t('stops.time')} />
              <select name="zoneId" defaultValue="" className={inputCls}>
                <option value="">{t('stops.zone')}</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            </div>
            <button className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
              {t('stops.add')}
            </button>
          </CreateForm>

          <ul className="divide-y divide-slate-100 text-sm">
            {line.stops.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="me-1.5 inline-grid h-5 w-5 place-items-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
                    {s.order}
                  </span>
                  <span className="font-medium text-slate-800">{s.name}</span>
                  <span className="ms-1.5 text-xs text-slate-400">
                    {s.plannedTime ? ` · ${s.plannedTime}` : ''}
                    {s.zone ? ` · ${s.zone.name}` : ''}
                    {s.address ? ` · ${s.address}` : ''}
                  </span>
                </span>
                <DeleteButton onDelete={deleteStopAction.bind(null, s.id, line.id)} />
              </li>
            ))}
            {line.stops.length === 0 && <li className="py-3 text-center text-xs text-slate-400">{t('stops.empty')}</li>}
          </ul>
        </section>
      </div>

      {/* Élèves affectés */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">{t('students.title')}</h2>
          <span className="text-xs text-slate-500">
            {t('students.capacity', { used: assigned.length, total: line.capacity || '∞' })}
          </span>
        </div>

        {/* Formulaire d'affectation */}
        <CreateForm action={assignStudentAction} className="mb-4 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
          <input type="hidden" name="lineId" value={line.id} />
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
            <Field label={t('students.student')}>
              <select name="studentId" required defaultValue="" className={`w-full ${inputCls}`}>
                <option value="" disabled>—</option>
                {unassigned.map((u) => (
                  <option key={u.id} value={u.id}>{staffName(u)}</option>
                ))}
              </select>
            </Field>
            <Field label={t('students.stop')}>
              <select name="stopId" defaultValue="" className={`w-full ${inputCls}`}>
                <option value="">—</option>
                {line.stops.map((st) => (
                  <option key={st.id} value={st.id}>{st.name}</option>
                ))}
              </select>
            </Field>
            <Field label={t('students.zone')}>
              <select name="zoneId" defaultValue="" className={`w-full ${inputCls}`}>
                <option value="">—</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} ({Number(z.annualAmount).toLocaleString(locale)} {currency})
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('students.billingCount')}>
              <input name="billingCount" type="number" min={1} max={24} defaultValue={9} className={`w-full ${inputCls}`} />
            </Field>
          </div>
          <div className="mt-2">
            <span className="mb-1 block text-xs font-medium text-slate-600">{t('students.days')}</span>
            <div className="flex flex-wrap gap-3">
              {TRANSPORT_DAYS.map((d) => (
                <label key={d} className="flex items-center gap-1.5 text-sm text-slate-700">
                  <input type="checkbox" name="days" value={d} defaultChecked={d !== 'SAT'} className="h-4 w-4 rounded border-slate-300" />
                  {dayLabel(d)}
                </label>
              ))}
            </div>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
            <Field label={t('students.authorized')}>
              <textarea name="authorizedPickups" rows={2} placeholder={t('students.authorizedHint')} className={`w-full ${inputCls}`} />
            </Field>
            <div className="space-y-2">
              <label className="flex items-center gap-2 pt-6 text-sm text-slate-700">
                <input type="checkbox" name="exitAlone" className="h-4 w-4 rounded border-slate-300" />
                {t('students.exitAlone')}
              </label>
              <input name="securityNotes" placeholder={t('students.notes')} className={`w-full ${inputCls}`} />
            </div>
          </div>
          <button className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            {t('students.assign')}
          </button>
        </CreateForm>

        {/* Liste des élèves affectés */}
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
              <tr>
                <th className="px-3 py-2 text-start">{t('students.student')}</th>
                <th className="px-3 py-2 text-start">{t('students.stop')}</th>
                <th className="px-3 py-2 text-start">{t('students.zone')}</th>
                <th className="px-3 py-2 text-start">{t('students.days')}</th>
                <th className="px-3 py-2 text-center">{t('students.security')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assigned.map((a) => {
                const pickups = Array.isArray(a.authorizedPickups) ? a.authorizedPickups.length : 0;
                return (
                  <tr key={a.id}>
                    <td className="px-3 py-2 font-medium text-slate-800">{personDisplayName(locale, a.student)}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{a.stop?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {a.zone ? `${a.zone.name} · ${Number(a.zone.annualAmount).toLocaleString(locale)} ${currency}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{a.days.map(dayLabel).join(', ') || '—'}</td>
                    <td className="px-3 py-2 text-center text-xs">
                      {a.exitAlone && <span title={t('students.exitAlone')}>🚶</span>}
                      {pickups > 0 && <span className="ms-1" title={t('students.authorized')}>👤{pickups}</span>}
                    </td>
                    <td className="px-3 py-2 text-end">
                      <DeleteButton
                        onDelete={unassignStudentAction.bind(null, a.studentId, line.id)}
                        confirmText={t('students.unassignConfirm')}
                      />
                    </td>
                  </tr>
                );
              })}
              {assigned.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-400">{t('students.empty')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
