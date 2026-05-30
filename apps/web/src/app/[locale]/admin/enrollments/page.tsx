import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';

export default async function EnrollmentsListPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; year?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.enrollments');

  const filterStatus = (sp.status ?? 'ALL') as
    | 'ALL'
    | 'DRAFT'
    | 'ACTIVE'
    | 'WITHDRAWN'
    | 'GRADUATED';

  const { years, currentYearId, items, counts } = await withTenant(
    session.user.tenantId,
    async (tx) => {
      const years = await tx.academicYear.findMany({
        orderBy: { startDate: 'desc' },
        select: { id: true, label: true, active: true },
      });
      const activeYear = years.find((y) => y.active);
      const currentYearId = sp.year ?? activeYear?.id ?? years[0]?.id ?? null;

      const items = currentYearId
        ? await tx.enrollment.findMany({
            where: {
              academicYearId: currentYearId,
              ...(filterStatus !== 'ALL' ? { status: filterStatus } : {}),
            },
            include: {
              student: { select: { id: true, firstName: true, lastName: true } },
              level: { select: { label: true } },
              class: { select: { id: true, name: true } },
            },
            orderBy: [{ status: 'asc' }, { enrolledAt: 'desc' }],
          })
        : [];

      const counts = currentYearId
        ? {
            DRAFT: await tx.enrollment.count({
              where: { academicYearId: currentYearId, status: 'DRAFT' },
            }),
            ACTIVE: await tx.enrollment.count({
              where: { academicYearId: currentYearId, status: 'ACTIVE' },
            }),
            WITHDRAWN: await tx.enrollment.count({
              where: { academicYearId: currentYearId, status: 'WITHDRAWN' },
            }),
            GRADUATED: await tx.enrollment.count({
              where: { academicYearId: currentYearId, status: 'GRADUATED' },
            }),
          }
        : { DRAFT: 0, ACTIVE: 0, WITHDRAWN: 0, GRADUATED: 0 };

      return { years, currentYearId, items, counts };
    },
  );

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex items-center gap-2">
            <label className="text-xs text-slate-500">{t('year')}</label>
            <select
              name="year"
              defaultValue={currentYearId ?? ''}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                  {y.active ? ' ★' : ''}
                </option>
              ))}
            </select>
            <input type="hidden" name="status" value={filterStatus} />
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs hover:bg-slate-50"
            >
              {t('apply')}
            </button>
          </form>
          <Link
            href={`/${locale}/admin/enrollments/bulk-reenroll${currentYearId ? `?source=${currentYearId}` : ''}`}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t('bulkButton')}
          </Link>
          <Link
            href={`/${locale}/admin/enrollments/new${currentYearId ? `?year=${currentYearId}` : ''}`}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            + {t('newButton')}
          </Link>
        </div>
      </header>

      {/* Filtres par statut */}
      <div className="mb-4 flex flex-wrap items-center gap-1 text-xs">
        <FilterPill
          href={`/${locale}/admin/enrollments?year=${currentYearId ?? ''}&status=ALL`}
          active={filterStatus === 'ALL'}
          label={t('filter.all')}
          count={counts.DRAFT + counts.ACTIVE + counts.WITHDRAWN + counts.GRADUATED}
        />
        <FilterPill
          href={`/${locale}/admin/enrollments?year=${currentYearId ?? ''}&status=DRAFT`}
          active={filterStatus === 'DRAFT'}
          label={t('filter.draft')}
          count={counts.DRAFT}
          color="amber"
        />
        <FilterPill
          href={`/${locale}/admin/enrollments?year=${currentYearId ?? ''}&status=ACTIVE`}
          active={filterStatus === 'ACTIVE'}
          label={t('filter.active')}
          count={counts.ACTIVE}
          color="emerald"
        />
        <FilterPill
          href={`/${locale}/admin/enrollments?year=${currentYearId ?? ''}&status=WITHDRAWN`}
          active={filterStatus === 'WITHDRAWN'}
          label={t('filter.withdrawn')}
          count={counts.WITHDRAWN}
          color="red"
        />
        <FilterPill
          href={`/${locale}/admin/enrollments?year=${currentYearId ?? ''}&status=GRADUATED`}
          active={filterStatus === 'GRADUATED'}
          label={t('filter.graduated')}
          count={counts.GRADUATED}
          color="blue"
        />
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
          {t('empty')}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-start">{t('table.student')}</th>
                <th className="px-4 py-3 text-start">{t('table.level')}</th>
                <th className="px-4 py-3 text-start">{t('table.class')}</th>
                <th className="px-4 py-3 text-start">{t('table.status')}</th>
                <th className="px-4 py-3 text-end">{t('table.rank')}</th>
                <th className="px-4 py-3 text-end">{t('table.discount')}</th>
                <th className="px-4 py-3 text-end">{t('table.enrolledAt')}</th>
                <th className="px-4 py-3 text-end"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/${locale}/admin/persons/${e.student.id}`}
                      className="font-medium text-slate-900 hover:text-brand-700"
                    >
                      {e.student.lastName} {e.student.firstName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{e.level.label}</td>
                  <td className="px-4 py-3 text-xs text-slate-700">
                    {e.class ? (
                      <Link
                        href={`/${locale}/admin/classes/${e.class.id}`}
                        className="hover:text-brand-700"
                      >
                        {e.class.name}
                      </Link>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={e.status} t={t} />
                  </td>
                  <td className="px-4 py-3 text-end text-xs tabular-nums">
                    {e.siblingRank ? `#${e.siblingRank}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-end text-xs tabular-nums">
                    {e.discountPct !== null ? `−${Number(e.discountPct)}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-end text-xs text-slate-500">
                    {new Date(e.enrolledAt).toLocaleDateString(locale)}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <Link
                      href={`/${locale}/admin/enrollments/${e.id}`}
                      className="text-xs font-medium text-brand-700 hover:underline"
                    >
                      {t('table.open')} →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterPill({
  href,
  active,
  label,
  count,
  color,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  color?: 'amber' | 'emerald' | 'red' | 'blue';
}) {
  const dot =
    color === 'amber'
      ? 'bg-amber-500'
      : color === 'emerald'
        ? 'bg-emerald-500'
        : color === 'red'
          ? 'bg-red-500'
          : color === 'blue'
            ? 'bg-blue-500'
            : 'bg-slate-400';
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 ${
        active
          ? 'border-brand-300 bg-brand-50 text-brand-700'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      {color && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      <span>{label}</span>
      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600">
        {count}
      </span>
    </Link>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: 'DRAFT' | 'ACTIVE' | 'WITHDRAWN' | 'GRADUATED';
  t: (k: string) => string;
}) {
  const map = {
    DRAFT: 'bg-amber-100 text-amber-700',
    ACTIVE: 'bg-emerald-100 text-emerald-700',
    WITHDRAWN: 'bg-red-100 text-red-700',
    GRADUATED: 'bg-blue-100 text-blue-700',
  } as const;
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${map[status]}`}>
      {t(`status.${status}`)}
    </span>
  );
}
