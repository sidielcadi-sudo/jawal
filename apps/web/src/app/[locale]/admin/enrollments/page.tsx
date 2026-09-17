import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { Pagination } from '@/components/pagination';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';
import { loadStudentDetail } from '@/lib/student-detail';
import { StudentDetailPanel, StudentDetailEmpty } from '../persons/student-detail';

const PAGE_SIZE = 20;

/**
 * Statuts du dossier d'inscription, dans l'ordre du parcours.
 *
 * L'ordre suit le cycle réel : dossier ouvert → pièces → acceptation →
 * paiement → affectation → activation, puis les sorties. Trier par volume
 * ferait sauter les pastilles de place d'une année sur l'autre.
 */
const ENROLLMENT_STATUSES = [
  'ALL',
  'DRAFT',
  'DOCUMENTS_MANQUANTS',
  'DOSSIER_COMPLET',
  'ACCEPTE',
  'INSCRIPTION_VALIDEE',
  'AFFECTE',
  'ACTIVE',
  'WITHDRAWN',
  'GRADUATED',
  'REFUSE',
] as const;
type EnrollmentStatusKey = (typeof ENROLLMENT_STATUSES)[number];

const STATUS_PILL_COLOR: Partial<Record<EnrollmentStatusKey, 'amber' | 'emerald' | 'red' | 'blue'>> = {
  DRAFT: 'amber',
  DOCUMENTS_MANQUANTS: 'amber',
  DOSSIER_COMPLET: 'blue',
  ACCEPTE: 'blue',
  INSCRIPTION_VALIDEE: 'blue',
  AFFECTE: 'amber',
  ACTIVE: 'emerald',
  WITHDRAWN: 'red',
  GRADUATED: 'blue',
  REFUSE: 'red',
};

export default async function EnrollmentsListPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; year?: string; page?: string; cycle?: string; selected?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const session = (await auth())!;
  const t = await getTranslations('admin.enrollments');
  const tp = await getTranslations('admin.persons');

  const filterStatus = ENROLLMENT_STATUSES.includes(sp.status as EnrollmentStatusKey)
    ? (sp.status as EnrollmentStatusKey)
    : 'ALL';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const { years, currentYearId, items, counts, cycles, cycleId, detail } = await withTenant(
    session.user.tenantId,
    async (tx) => {
      const years = await tx.academicYear.findMany({
        orderBy: { startDate: 'desc' },
        select: { id: true, label: true, active: true, startDate: true, endDate: true },
      });
      const activeYear = years.find((y) => y.active);
      const currentYearId = sp.year ?? activeYear?.id ?? years[0]?.id ?? null;
      // Tous · Primaire · Collège · Lycée, comme la page Élèves : le dossier
      // porte le niveau demandé, donc son cycle.
      const cycles = await tx.cycle.findMany({
        orderBy: { order: 'asc' },
        select: { id: true, label: true, labelAr: true },
      });
      const cycleId = cycles.find((c) => c.id === sp.cycle)?.id ?? null;
      const cycleWhere = cycleId ? { level: { cycleId } } : {};

      const items = currentYearId
        ? await tx.enrollment.findMany({
            where: {
              academicYearId: currentYearId,
              ...cycleWhere,
              ...(filterStatus !== 'ALL' ? { status: filterStatus } : {}),
            },
            include: {
              student: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  firstNameAr: true,
                  lastNameAr: true,
                },
              },
              level: { select: { label: true, labelAr: true } },
              class: { select: { id: true, name: true, nameAr: true } },
            },
            orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
            skip: (page - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
          })
        : [];

      // Un comptage par statut, tous statuts confondus.
      //
      // Cinq compteurs étaient écrits à la main (brouillon, inscrit, retiré,
      // diplômé, refusé) : les dossiers AFFECTE — et tous les états
      // intermédiaires du dossier — n'étaient comptés nulle part. « Tous »
      // annonçait donc 561 là où la liste en affichait 610, et la pagination,
      // calculée sur 561, rendait les derniers dossiers inatteignables.
      const grouped = currentYearId
        ? await tx.enrollment.groupBy({
            by: ['status'],
            where: { academicYearId: currentYearId, ...cycleWhere },
            _count: { _all: true },
          })
        : [];
      const counts: Record<string, number> = {};
      for (const st of ENROLLMENT_STATUSES) if (st !== 'ALL') counts[st] = 0;
      for (const g of grouped) counts[g.status] = g._count._all;

      // Fiche de l'élève ouvert dans le panneau latéral, comme dans Élèves.
      const year = years.find((y) => y.id === currentYearId) ?? null;
      const detail = sp.selected ? await loadStudentDetail(tx, sp.selected, locale, year) : null;

      return { years, currentYearId, items, counts, cycles, cycleId, detail };
    },
  );

  const total =
    filterStatus === 'ALL'
      ? Object.values(counts).reduce((n, v) => n + v, 0)
      : (counts[filterStatus] ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  /** Lien de la liste : conserve année, statut, cycle, page et fiche ouverte. */
  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (currentYearId) p.set('year', currentYearId);
    p.set('status', filterStatus);
    if (cycleId) p.set('cycle', cycleId);
    if (sp.page) p.set('page', sp.page);
    if (sp.selected) p.set('selected', sp.selected);
    for (const [k, v] of Object.entries(over)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `/${locale}/admin/enrollments?${p.toString()}`;
  };
  const statusHref = (st: EnrollmentStatusKey) => qs({ status: st, page: undefined });
  const pageHref = (p: number) => qs({ page: String(p) });
  const cycleHref = (id: string | null) => qs({ cycle: id ?? undefined, page: undefined });

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-600">{t('subtitle')}</p>
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
            {cycleId && <input type="hidden" name="cycle" value={cycleId} />}
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
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t('reenrollButton')}
          </Link>
          <Link
            href={`/${locale}/admin/persons/new?type=STUDENT&admission=1`}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            + {t('newAdmissionButton')}
          </Link>
          <Link
            href={`/${locale}/admin/enrollments/import-massar`}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
          >
            {t('massarButton')}
          </Link>
          <Link
            href={`/${locale}/admin/timetable`}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            {t('timetableButton')}
          </Link>
        </div>
      </header>

      {cycles.length > 0 && (
        <nav className="mb-3 flex flex-wrap items-center gap-2">
          {[{ id: null as string | null, label: tp('tabs.all') }, ...cycles.map((c) => ({ id: c.id as string | null, label: localizedLabel(locale, c.label, c.labelAr) }))].map((c) => (
            <Link
              key={c.id ?? 'all'}
              href={cycleHref(c.id)}
              aria-current={cycleId === c.id ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                cycleId === c.id
                  ? 'bg-brand-600 text-white'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {c.label}
            </Link>
          ))}
        </nav>
      )}

      {/* Filtres par statut — tous les statuts du dossier, pas une sélection.
          Sans « Affecté », impossible d'isoler les élèves qui ont une classe
          mais ne sont pas encore actifs, ce qui est précisément la population
          qu'on vient chercher ici. */}
      <div className="mb-4 flex flex-wrap items-center gap-1 text-xs">
        <FilterPill
          href={statusHref('ALL')}
          active={filterStatus === 'ALL'}
          label={t('filter.all')}
          count={total}
        />
        {ENROLLMENT_STATUSES.filter((st) => st !== 'ALL').map((st) => (
          <FilterPill
            key={st}
            href={statusHref(st)}
            active={filterStatus === st}
            label={t(`filter.status.${st}` as never)}
            count={counts[st] ?? 0}
            color={STATUS_PILL_COLOR[st]}
          />
        ))}
      </div>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1">
      {items.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
          {t('empty')}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
              <tr>
                <th className="px-4 py-3 text-start">{t('table.student')}</th>
                <th className="px-4 py-3 text-start">{t('table.level')}</th>
                <th className="px-4 py-3 text-start">{t('table.class')}</th>
                <th className="px-4 py-3 text-start">{t('table.status')}</th>
                <th className="px-4 py-3 text-end">{t('table.discount')}</th>
                <th className="px-4 py-3 text-end"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3">
                    {/* Le nom ouvre la fiche latérale : on consulte sans quitter
                        la liste ni perdre ses filtres. */}
                    <Link
                      href={qs({ selected: e.student.id })}
                      className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                    >
                      {personDisplayName(locale, e.student)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {localizedLabel(locale, e.level.label, e.level.labelAr)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">
                    {e.class ? (
                      <Link
                        href={`/${locale}/admin/classes/${e.class.id}`}
                        className="hover:text-brand-700"
                      >
                        {localizedLabel(locale, e.class.name, e.class.nameAr)}
                      </Link>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={e.status} t={t} />
                  </td>
                  <td className="px-4 py-3 text-end text-xs tabular-nums">
                    {e.discountPct !== null ? `−${Number(e.discountPct)}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <Link
                      href={`/${locale}/admin/enrollments/${e.id}`}
                      className="inline-flex whitespace-nowrap rounded-lg border border-brand-300 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
                    >
                      {tp('actions.view')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} hrefFor={pageHref} />
        </div>

        {detail ? (
          <StudentDetailPanel detail={detail} locale={locale} baseHref={`/${locale}/admin/persons`} />
        ) : (
          <StudentDetailEmpty />
        )}
      </div>
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

const ENROLLMENT_STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  DOCUMENTS_MANQUANTS: 'bg-amber-100 text-amber-700',
  DOSSIER_COMPLET: 'bg-sky-100 text-sky-700',
  ACCEPTE: 'bg-indigo-100 text-indigo-700',
  REFUSE: 'bg-red-100 text-red-700',
  INSCRIPTION_VALIDEE: 'bg-teal-100 text-teal-700',
  AFFECTE: 'bg-violet-100 text-violet-700',
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  WITHDRAWN: 'bg-red-100 text-red-700',
  GRADUATED: 'bg-blue-100 text-blue-700',
};

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-[11px] font-medium ${
        ENROLLMENT_STATUS_BADGE[status] ?? 'bg-slate-100 text-slate-700'
      }`}
    >
      {t(`status.${status}`)}
    </span>
  );
}
