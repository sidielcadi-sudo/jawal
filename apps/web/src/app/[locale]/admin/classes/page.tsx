import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import type { Prisma } from '@/lib/db';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';
import { DuplicateClassesButton } from './duplicate-classes';

export default async function ClassesListPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ year?: string; cycle?: string; level?: string; archived?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const session = (await auth())!;
  const tenantId = session.user.tenantId;
  const t = await getTranslations('admin.classes');

  const showArchived = sp.archived === '1';

  const { classes, years, cycles, levels, activeYear } = await withTenant(tenantId, async (tx) => {
    const [years, cycles, levels, activeYear] = await Promise.all([
      tx.academicYear.findMany({ orderBy: { startDate: 'desc' } }),
      tx.cycle.findMany({ orderBy: { order: 'asc' } }),
      tx.level.findMany({ orderBy: [{ cycle: { order: 'asc' } }, { order: 'asc' }] }),
      tx.academicYear.findFirst({ where: { active: true } }),
    ]);

    // Le niveau est plus précis que le cycle : quand les deux sont posés, le
    // niveau gagne — sinon un lien de niveau resterait sans effet tant qu'un
    // cycle est sélectionné.
    const levelScope = sp.level
      ? { levelId: sp.level }
      : sp.cycle
        ? { level: { cycleId: sp.cycle } }
        : {};

    const where: Prisma.ClassWhereInput = {
      deletedAt: showArchived ? { not: null } : null,
      ...(sp.year ? { academicYearId: sp.year } : activeYear ? { academicYearId: activeYear.id } : {}),
      ...levelScope,
    };

    const classes = await tx.class.findMany({
      where,
      orderBy: [{ level: { order: 'asc' } }, { name: 'asc' }],
      include: {
        level: true,
        academicYear: true,
        mainTeacher: true,
        _count: { select: { students: { where: { unenrolledAt: null } } } },
      },
    });

    return { classes, years, cycles, levels, activeYear };
  });

  const baseHref = `/${locale}/admin/classes`;

  // Cycle courant : celui demandé, ou celui du niveau sélectionné — arriver sur
  // un niveau sans que son cycle soit surligné serait déroutant.
  const currentCycleId =
    sp.cycle ?? (sp.level ? (levels.find((l) => l.id === sp.level)?.cycleId ?? null) : null);
  const cycleLevels = currentCycleId ? levels.filter((l) => l.cycleId === currentCycleId) : [];
  const cycleTabs = cycles.filter((c) => levels.some((l) => l.cycleId === c.id));

  /** Lien de filtre : conserve l'année et le mode archivé. */
  const filterHref = (patch: { cycle?: string | null; level?: string | null }) => {
    const qs = new URLSearchParams();
    if (sp.year) qs.set('year', sp.year);
    const cycle = patch.cycle === undefined ? currentCycleId : patch.cycle;
    const level = patch.level === undefined ? (sp.level ?? null) : patch.level;
    if (cycle) qs.set('cycle', cycle);
    if (level) qs.set('level', level);
    if (showArchived) qs.set('archived', '1');
    const q = qs.toString();
    return q ? `${baseHref}?${q}` : baseHref;
  };

  const tabCls = (active: boolean) =>
    [
      'rounded-lg px-3 py-1.5 text-sm transition-colors',
      active
        ? 'bg-brand-600 text-white shadow'
        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
    ].join(' ');

  return (
    <div className="px-3 py-3">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-600">{t('count', { count: classes.length })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DuplicateClassesButton
            years={years.map((y) => ({ id: y.id, label: y.label, active: y.active }))}
            activeYear={activeYear ? { id: activeYear.id, label: activeYear.label } : null}
          />
          <Link
            href={`${baseHref}/new`}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700"
          >
            {t('actions.new')}
          </Link>
        </div>
      </div>

      {/* Cycle puis niveau, comme dans Paramétrage → Programme par niveau :
          deux clics au lieu d'un menu déroulant qu'il faut ouvrir pour voir
          ce qu'il contient. */}
      <div className="mb-2 flex flex-wrap gap-2">
        <Link href={filterHref({ cycle: null, level: null })} className={tabCls(!currentCycleId)}>
          {t('filters.allCycles')}
        </Link>
        {cycleTabs.map((c) => (
          <Link
            key={c.id}
            href={filterHref({ cycle: c.id, level: null })}
            className={tabCls(currentCycleId === c.id)}
          >
            {localizedLabel(locale, c.label, c.labelAr)}
          </Link>
        ))}
      </div>

      {cycleLevels.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
          <Link href={filterHref({ level: null })} className={tabCls(!sp.level)}>
            {t('filters.allLevels')}
          </Link>
          {cycleLevels.map((l) => (
            <Link
              key={l.id}
              href={filterHref({ level: l.id })}
              className={tabCls(sp.level === l.id)}
            >
              {localizedLabel(locale, l.label, l.labelAr)}
            </Link>
          ))}
        </div>
      )}

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="year" className="block text-xs font-medium text-slate-600">
            {t('filters.year')}
          </label>
          <select
            name="year"
            id="year"
            defaultValue={sp.year ?? activeYear?.id ?? ''}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label} {y.active ? '(actif)' : ''}
              </option>
            ))}
          </select>
        </div>
        {currentCycleId && <input type="hidden" name="cycle" value={currentCycleId} />}
        {sp.level && <input type="hidden" name="level" value={sp.level} />}
        {showArchived && <input type="hidden" name="archived" value="1" />}
        <button
          type="submit"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          {t('filters.apply')}
        </button>
        <Link
          href={`${baseHref}?${new URLSearchParams({
            ...(sp.year ? { year: sp.year } : {}),
            ...(currentCycleId ? { cycle: currentCycleId } : {}),
            ...(sp.level ? { level: sp.level } : {}),
            archived: showArchived ? '0' : '1',
          }).toString()}`}
          className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-700"
        >
          {showArchived ? t('filters.showActive') : t('filters.showArchived')}
        </Link>
      </form>

      <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-4 py-3 text-start">{t('table.name')}</th>
              <th className="px-4 py-3 text-start">{t('table.level')}</th>
              <th className="px-4 py-3 text-start">{t('table.year')}</th>
              <th className="px-4 py-3 text-start">{t('table.mainTeacher')}</th>
              <th className="px-4 py-3 text-end">{t('table.enrolled')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {classes.map((c) => {
              const pct = (c._count.students / c.capacity) * 100;
              const pctColor =
                pct >= 100 ? 'bg-red-500' : pct >= 90 ? 'bg-amber-500' : 'bg-emerald-500';
              return (
                <tr key={c.id} className={c.deletedAt ? 'bg-slate-50/60 text-slate-500' : ''}>
                  <td className="px-4 py-3">
                    <Link
                      href={`${baseHref}/${c.id}`}
                      className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                    >
                      {localizedLabel(locale, c.name, c.nameAr)}
                    </Link>
                    {c.deletedAt && (
                      <span className="ms-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">
                        {t('archived')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">{localizedLabel(locale, c.level.label, c.level.labelAr)}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{c.academicYear.label}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {c.mainTeacher
                      ? personDisplayName(locale, c.mainTeacher)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-xs tabular-nums text-slate-600">
                        {c._count.students}/{c.capacity}
                      </span>
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full ${pctColor}`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
            {classes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
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
