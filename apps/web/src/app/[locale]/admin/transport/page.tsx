import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { CreateForm, DeleteButton } from './transport-client';
import {
  createZoneAction,
  deleteZoneAction,
  createBusAction,
  deleteBusAction,
  createLineAction,
  deleteLineAction,
} from './actions';

const inputCls =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

const BUS_STATUS_BADGE: Record<string, string> = {
  EN_SERVICE: 'bg-emerald-100 text-emerald-700',
  PANNE: 'bg-red-100 text-red-700',
  REMPLACEMENT: 'bg-amber-100 text-amber-700',
};

export default async function TransportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.transport');

  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const { zones, buses, lines, currency, todaySessions } = await withTenant(session.user.tenantId, async (tx) => {
    const [zones, buses, lines, tenant, todaySessions] = await Promise.all([
      tx.transportZone.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }] }),
      tx.bus.findMany({ orderBy: { number: 'asc' } }),
      tx.transportLine.findMany({
        orderBy: { name: 'asc' },
        include: {
          bus: { select: { number: true } },
          driver: { select: { firstName: true, lastName: true } },
          attendant: { select: { firstName: true, lastName: true } },
          _count: { select: { stops: true, studentTransports: true } },
        },
      }),
      tx.tenant.findFirst({ select: { currency: true } }),
      tx.transportAttendanceSession.findMany({
        where: { date: today },
        include: { line: { select: { name: true } }, records: { select: { status: true } } },
        orderBy: [{ line: { name: 'asc' } }, { direction: 'asc' }],
      }),
    ]);
    return { zones, buses, lines, currency: tenant?.currency ?? 'MAD', todaySessions };
  });

  // KPI du jour (événementiel : recalculé à chaque visite).
  const allRecords = todaySessions.flatMap((s) => s.records);
  const isPresent = (st: string) => ['PRESENT', 'LATE', 'BOARDED', 'DROPPED'].includes(st);
  const kpi = {
    presence: allRecords.length ? Math.round((allRecords.filter((r) => isPresent(r.status)).length / allRecords.length) * 100) : null,
    late: allRecords.filter((r) => r.status === 'LATE').length,
    notPicked: allRecords.filter((r) => r.status === 'NOT_PICKED_UP').length,
    incidents: allRecords.filter((r) => r.status === 'INCIDENT').length,
  };
  const sessionCounts = (recs: { status: string }[]) => ({
    present: recs.filter((r) => isPresent(r.status)).length,
    absent: recs.filter((r) => ['ABSENT', 'NOT_PICKED_UP'].includes(r.status)).length,
    incident: recs.filter((r) => r.status === 'INCIDENT').length,
  });

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex items-center justify-between gap-3 overflow-hidden rounded-3xl bg-gradient-to-r from-[#e8edff] to-[#eef0ff] px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">🚍 {t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-600">{t('subtitle')}</p>
        </div>
        <Link
          href={`/${locale}/admin/transport/appel`}
          className="shrink-0 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          {t('appel.cta')}
        </Link>
      </header>

      {/* Alerte incidents du jour (alerte direction) */}
      {kpi.incidents > 0 && (
        <Link
          href={`/${locale}/admin/transport/incidents`}
          className="mb-3 flex items-center justify-between rounded-2xl border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm text-purple-800 hover:bg-purple-100"
        >
          <span>⚠ {t('incidents.banner', { n: kpi.incidents })}</span>
          <span className="text-xs font-medium underline">{t('incidents.view')}</span>
        </Link>
      )}

      {/* KPI du jour */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={t('kpi.presence')} value={kpi.presence === null ? '—' : `${kpi.presence}%`} tone="emerald" />
        <Kpi label={t('kpi.late')} value={kpi.late} tone="amber" />
        <Kpi label={t('kpi.notPicked')} value={kpi.notPicked} tone="red" />
        <Link href={`/${locale}/admin/transport/incidents`}>
          <Kpi label={t('kpi.incidents')} value={kpi.incidents} tone="purple" />
        </Link>
      </div>

      {/* Board du jour */}
      {todaySessions.length > 0 && (
        <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">{t('board.title')}</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {todaySessions.map((s) => {
              const c = sessionCounts(s.records);
              return (
                <li key={s.id} className="flex items-center justify-between py-1.5">
                  <span className="text-slate-700">
                    {s.line.name} · <span className="text-xs text-slate-500">{t(`appel.${s.direction === 'MORNING' ? 'morning' : 'evening'}`)}</span>
                  </span>
                  <span className="flex gap-2 text-xs">
                    <span className="text-emerald-700">✓ {c.present}</span>
                    <span className="text-red-700">✗ {c.absent}</span>
                    {c.incident > 0 && <span className="text-purple-700">⚠ {c.incident}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Lignes (principal) */}
        <section className="lg:col-span-2">
          <h2 className="mb-2 text-base font-semibold text-slate-900">{t('lines.title')}</h2>
          <CreateForm action={createLineAction} className="mb-3 flex flex-wrap items-center gap-2">
            <input name="name" required placeholder={t('lines.name')} className={inputCls} />
            <input name="districts" placeholder={t('lines.districts')} className={`${inputCls} flex-1`} />
            <button className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
              {t('add')}
            </button>
          </CreateForm>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 text-start">{t('lines.name')}</th>
                  <th className="px-4 py-2.5 text-start">{t('lines.bus')}</th>
                  <th className="px-4 py-2.5 text-start">{t('lines.driver')}</th>
                  <th className="px-4 py-2.5 text-start">{t('lines.attendant')}</th>
                  <th className="px-4 py-2.5 text-end">{t('lines.stops')}</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2.5">
                      <Link href={`/${locale}/admin/transport/${l.id}`} className="font-medium text-slate-900 hover:text-brand-700 hover:underline">
                        {l.name}
                      </Link>
                      {!l.active && <span className="ms-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">{t('inactive')}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{l.bus?.number ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{l.driver ? `${l.driver.lastName} ${l.driver.firstName}` : '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{l.attendant ? `${l.attendant.lastName} ${l.attendant.firstName}` : '—'}</td>
                    <td className="px-4 py-2.5 text-end tabular-nums text-slate-600">{l._count.stops}</td>
                    <td className="px-4 py-2.5 text-end">
                      <DeleteButton onDelete={deleteLineAction.bind(null, l.id)} />
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">{t('lines.empty')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Zones + Bus */}
        <aside className="space-y-6">
          {/* Zones */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">{t('zones.title')}</h2>
            <CreateForm action={createZoneAction} className="mb-2 grid grid-cols-[1fr_auto_auto] gap-1.5">
              <input name="name" required placeholder={t('zones.name')} className={inputCls} />
              <input name="annualAmount" type="number" min={0} step="0.01" placeholder={t('zones.amount')} className={`${inputCls} w-24`} />
              <button className="rounded-lg bg-brand-600 px-2 text-sm font-medium text-white hover:bg-brand-700">+</button>
            </CreateForm>
            <ul className="divide-y divide-slate-100 text-sm">
              {zones.map((z) => (
                <li key={z.id} className="flex items-center justify-between py-1.5">
                  <span className="text-slate-800">{z.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums text-slate-500">{Number(z.annualAmount).toLocaleString(locale)} {currency}</span>
                    <DeleteButton onDelete={deleteZoneAction.bind(null, z.id)} />
                  </span>
                </li>
              ))}
              {zones.length === 0 && <li className="py-3 text-center text-xs text-slate-400">{t('zones.empty')}</li>}
            </ul>
          </section>

          {/* Bus */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">{t('buses.title')}</h2>
            <CreateForm action={createBusAction} className="mb-2 grid grid-cols-2 gap-1.5">
              <input name="number" required placeholder={t('buses.number')} className={inputCls} />
              <input name="plate" placeholder={t('buses.plate')} className={inputCls} />
              <input name="capacity" type="number" min={0} placeholder={t('buses.capacity')} className={inputCls} />
              <select name="status" defaultValue="EN_SERVICE" className={inputCls}>
                <option value="EN_SERVICE">{t('buses.status.EN_SERVICE')}</option>
                <option value="PANNE">{t('buses.status.PANNE')}</option>
                <option value="REMPLACEMENT">{t('buses.status.REMPLACEMENT')}</option>
              </select>
              <button className="col-span-2 rounded-lg bg-brand-600 px-2 py-1.5 text-sm font-medium text-white hover:bg-brand-700">{t('add')}</button>
            </CreateForm>
            <ul className="divide-y divide-slate-100 text-sm">
              {buses.map((b) => (
                <li key={b.id} className="flex items-center justify-between py-1.5">
                  <span className="text-slate-800">
                    {b.number}
                    {b.plate && <span className="ms-1.5 text-xs text-slate-400">{b.plate}</span>}
                    <span className="ms-1.5 text-xs text-slate-400">· {b.capacity} pl.</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${BUS_STATUS_BADGE[b.status]}`}>
                      {t(`buses.status.${b.status}`)}
                    </span>
                    <DeleteButton onDelete={deleteBusAction.bind(null, b.id)} />
                  </span>
                </li>
              ))}
              {buses.length === 0 && <li className="py-3 text-center text-xs text-slate-400">{t('buses.empty')}</li>}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

const KPI_TONE: Record<string, string> = {
  emerald: 'text-emerald-700',
  amber: 'text-amber-700',
  red: 'text-red-700',
  purple: 'text-purple-700',
};

function Kpi({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className={`text-2xl font-bold tabular-nums ${KPI_TONE[tone]}`}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}
