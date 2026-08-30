import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { AppelGrid } from '../appel-grid';
import { LineEventButtons } from '../line-event-buttons';
import { personDisplayName } from '@/lib/localized-name';

const inputCls = 'rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm';
type Direction = 'MORNING' | 'EVENING';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default async function TransportAppelPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ lineId?: string; date?: string; direction?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('admin.transport');
  const ta = await getTranslations('admin.transport.appel');

  const date = sp.date ?? todayStr();
  const direction: Direction = sp.direction === 'EVENING' ? 'EVENING' : 'MORNING';
  const lineId = sp.lineId ?? '';

  const { lines, students } = await withTenant(session.user.tenantId, async (tx) => {
    const lines = await tx.transportLine.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    if (!lineId) return { lines, students: [] as never[] };
    const [assigned, appelSession] = await Promise.all([
      tx.studentTransport.findMany({
        where: { lineId, status: 'ACTIVE' },
        include: { student: { select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } }, stop: { select: { name: true } } },
        orderBy: { student: { lastName: 'asc' } },
      }),
      tx.transportAttendanceSession.findUnique({
        where: { lineId_date_direction: { lineId, date: new Date(`${date}T00:00:00.000Z`), direction } },
        include: { records: true },
      }),
    ]);
    const recByStudent = new Map(appelSession?.records.map((r) => [r.studentId, r]) ?? []);
    const students = assigned.map((a) => {
      const rec = recByStudent.get(a.studentId);
      return {
        studentId: a.studentId,
        name: personDisplayName(locale, a.student),
        stopName: a.stop?.name ?? null,
        status: (rec?.status as never) ?? null,
        note: rec?.note ?? null,
      };
    });
    return { lines, students };
  });

  return (
    <div className="mx-auto max-w-3xl px-3 py-3">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/transport`} className="hover:text-brand-700">🚍 {t('title')}</Link>
        <span className="mx-1.5">›</span>
        <span>{ta('title')}</span>
      </nav>

      {/* Sélecteurs */}
      <form className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        <label className="text-xs font-medium text-slate-600">
          <span className="mb-1 block">{t('lines.title')}</span>
          <select name="lineId" defaultValue={lineId} className={inputCls}>
            <option value="">—</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          <span className="mb-1 block">{ta('date')}</span>
          <input type="date" name="date" defaultValue={date} className={inputCls} />
        </label>
        <label className="text-xs font-medium text-slate-600">
          <span className="mb-1 block">{ta('direction')}</span>
          <select name="direction" defaultValue={direction} className={inputCls}>
            <option value="MORNING">{ta('morning')}</option>
            <option value="EVENING">{ta('evening')}</option>
          </select>
        </label>
        <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900">
          {ta('load')}
        </button>
      </form>

      {lineId ? (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <LineEventButtons lineId={lineId} />
            <Link href={`/${locale}/admin/transport/notifications`} className="text-xs text-slate-500 hover:text-brand-700 hover:underline">
              {ta('logLink')}
            </Link>
          </div>
          <AppelGrid lineId={lineId} date={date} direction={direction} students={students} />
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          {ta('pickLine')}
        </p>
      )}
    </div>
  );
}
