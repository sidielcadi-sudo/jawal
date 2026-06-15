import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { requirePermission } from '@/lib/auth/rbac';
import { EventRowActions } from './client';

const STATUSES = ['PENDING', 'CONFIRMED', 'JUSTIFIED', 'CANCELLED'] as const;

export default async function AbsenceManagementPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; class?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations('admin.absenceMgmt');
  const session = (await auth())!;
  await requirePermission('attendance.write');

  const status = STATUSES.includes(sp.status as never) ? sp.status! : 'PENDING';

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const year = await tx.academicYear.findFirst({ where: { active: true }, select: { id: true } });
    const classes = year
      ? await tx.class.findMany({
          where: { academicYearId: year.id, deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : [];
    const events = await tx.attendanceEvent.findMany({
      where: { status: status as never, ...(sp.class ? { classId: sp.class } : {}) },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { student: { select: { firstName: true, lastName: true } } },
      take: 300,
    });
    const classMap = new Map(classes.map((c) => [c.id, c.name]));
    return {
      classes,
      counts: Object.fromEntries(
        await Promise.all(
          STATUSES.map(async (s) => [s, await tx.attendanceEvent.count({ where: { status: s } })] as const),
        ),
      ) as Record<string, number>,
      events: events.map((e) => ({
        id: e.id,
        student: `${e.student.lastName} ${e.student.firstName}`,
        className: classMap.get(e.classId) ?? '—',
        date: e.date.toISOString(),
        signaledCategory: e.signaledCategory,
        category: e.category,
        status: e.status,
        lateMinutes: e.lateMinutes,
        justifReason: e.justifReason,
      })),
    };
  });

  const base = `/${locale}/admin/attendance/management`;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
      <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>

      {/* Onglets statut */}
      <div className="mt-4 flex flex-wrap gap-1 border-b border-slate-200">
        {STATUSES.map((s) => (
          <a
            key={s}
            href={`${base}?status=${s}${sp.class ? `&class=${sp.class}` : ''}`}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              status === s
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t(`status.${s}`)} <span className="text-xs text-slate-400">({data.counts[s] ?? 0})</span>
          </a>
        ))}
      </div>

      {/* Filtre classe */}
      <form method="get" className="mt-3 flex items-center gap-2">
        <input type="hidden" name="status" value={status} />
        <select
          name="class"
          defaultValue={sp.class ?? ''}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm"
        >
          <option value="">{t('allClasses')}</option>
          {data.classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
          {t('filter')}
        </button>
      </form>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-start">{t('col.student')}</th>
              <th className="px-4 py-3 text-start">{t('col.class')}</th>
              <th className="px-4 py-3 text-start">{t('col.date')}</th>
              <th className="px-4 py-3 text-start">{t('col.category')}</th>
              <th className="px-4 py-3 text-start">{t('col.status')}</th>
              <th className="px-4 py-3 text-end">{t('col.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.events.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2 font-medium text-slate-900">{e.student}</td>
                <td className="px-4 py-2 text-xs text-slate-600">{e.className}</td>
                <td className="px-4 py-2 text-xs text-slate-600">
                  {new Date(e.date).toLocaleDateString(locale)}
                </td>
                <td className="px-4 py-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                    {t(`category.${e.category}`)}
                    {e.category === 'RETARD' && e.lateMinutes ? ` ${e.lateMinutes}′` : ''}
                  </span>
                  {e.category !== e.signaledCategory && (
                    <span className="ms-1 text-[10px] text-amber-600">
                      ({t('converted')} : {t(`category.${e.signaledCategory}`)})
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-xs">
                  {t(`status.${e.status}`)}
                  {e.justifReason && <span className="ms-1 text-slate-400">· {e.justifReason}</span>}
                </td>
                <td className="px-4 py-2 text-end">
                  <EventRowActions id={e.id} category={e.category} status={e.status} />
                </td>
              </tr>
            ))}
            {data.events.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  {t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
