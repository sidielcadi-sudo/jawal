import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { keepPreviousOnly, loadUnpaidLedger, type UnpaidFamilyGroup } from '@/lib/unpaid';
import {
  filterRows,
  filterScope,
  groupFamilies,
  recoveryDelta,
  unpaidKpis,
  type LedgerYearRow,
  type UnpaidStatus,
} from '@/lib/unpaid-filters';
import { localizedLabel } from '@/lib/localized-name';
import { Pagination } from '@/components/pagination';
import { RelanceButton } from './client';
import { WaiveDebtsButton } from './waive-debts';
import { SettleDebtsButton } from './settle-debts';
import { ContentiousButton } from './contentious-button';
import { loadWaiveContext } from '@/lib/school-year';

const STATUSES: UnpaidStatus[] = ['ECHU', 'NON_ECHU', 'CONTENTIEUX'];

/**
 * Gestion des impayés : indicateurs de l'année, filtres, et le tableau de
 * recouvrement famille → élève → année.
 */
export default async function UnpaidPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    only?: string;
    year?: string;
    status?: string;
    cycle?: string;
    class?: string;
    month?: string;
  }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission('finance.write');
  const t = await getTranslations('admin.finance.unpaid');
  const session = (await auth())!;
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  // « only=previous » : ne garder que les familles traînant une créance d'un
  // exercice antérieur — la population à relancer en priorité.
  const onlyPrevious = sp.only === 'previous';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const FAMILIES_PER_PAGE = 25;
  const status = (STATUSES as string[]).includes(sp.status ?? '') ? (sp.status as UnpaidStatus) : '';
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? sp.month! : '';
  const today = new Date();

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const ledger = await loadUnpaidLedger(tx);
    const yearId = ledger.years.some((y) => y.id === sp.year) ? sp.year! : '';
    const classesYearId = yearId || ledger.activeYearId;
    const [cycles, classes, tenant, waive] = await Promise.all([
      tx.cycle.findMany({ orderBy: { order: 'asc' }, select: { id: true, label: true, labelAr: true } }),
      classesYearId
        ? tx.class.findMany({
            where: { academicYearId: classesYearId, deletedAt: null },
            orderBy: [{ level: { order: 'asc' } }, { name: 'asc' }],
            select: { id: true, name: true, nameAr: true, level: { select: { cycleId: true } } },
          })
        : Promise.resolve([]),
      tx.tenant.findFirst({ select: { currency: true } }),
      // L'effacement suit la politique de l'établissement (Paramétrage →
      // Frais) : le serveur refuse hors fenêtre, autant griser le bouton et
      // dire pourquoi.
      loadWaiveContext(tx),
    ]);

    const rems = ledger.rows.length
      ? await tx.paymentReminder.findMany({
          where: { studentId: { in: [...new Set(ledger.rows.map((r) => r.studentId))] } },
          orderBy: { createdAt: 'desc' },
          select: { id: true, studentId: true, note: true, createdAt: true, createdByUserId: true },
        })
      : [];
    const userIds = [...new Set(rems.map((r) => r.createdByUserId).filter((x): x is string => Boolean(x)))];
    const users = userIds.length
      ? await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } })
      : [];
    const emailById = new Map(users.map((u2) => [u2.id, u2.email]));
    const byStudent: Record<string, { id: string; note: string; createdAt: string; author: string | null }[]> = {};
    for (const r of rems) {
      (byStudent[r.studentId] ??= []).push({
        id: r.id,
        note: r.note,
        createdAt: r.createdAt.toISOString(),
        author: r.createdByUserId ? (emailById.get(r.createdByUserId) ?? null) : null,
      });
    }
    return { ledger, yearId, cycles, classes, currency: tenant?.currency ?? 'MAD', waive, remindersByStudent: byStudent };
  });

  const { ledger, yearId, cycles, classes, currency, waive, remindersByStudent } = data;
  const cycleId = cycles.some((c) => c.id === sp.cycle) ? sp.cycle! : '';
  const classOptions = classes.filter((c) => !cycleId || c.level.cycleId === cycleId);
  const classId = classOptions.some((c) => c.id === sp.class) ? sp.class! : '';

  /* ── Indicateurs : l'année choisie, à défaut l'année active ───────────── */
  const kpiYear = ledger.years.find((y) => y.id === (yearId || ledger.activeYearId)) ?? null;
  const kpi = unpaidKpis(filterScope(ledger.rows, { yearId: kpiYear?.id ?? null, cycleId, classId }), today);
  // Même date l'an dernier, sur l'exercice précédent. Une classe n'existe que
  // sur son année : filtrée par classe, la comparaison n'a pas d'équivalent.
  const kpiIndex = kpiYear ? ledger.years.findIndex((y) => y.id === kpiYear.id) : -1;
  const prevYear = kpiIndex > 0 ? ledger.years[kpiIndex - 1]! : null;
  const lastYearToday = new Date(today);
  lastYearToday.setUTCFullYear(today.getUTCFullYear() - 1);
  const prevRate =
    prevYear && !classId
      ? unpaidKpis(filterScope(ledger.rows, { yearId: prevYear.id, cycleId }), lastYearToday).recoveryRate
      : null;
  const delta = recoveryDelta(kpi.recoveryRate, prevRate);

  /* ── Tableau ──────────────────────────────────────────────────────────── */
  const yearOrder = new Map(ledger.years.map((y, i) => [y.id, i]));
  const allFamilies = groupFamilies(
    filterRows(ledger.rows, { yearId, status, cycleId, classId, month, q }, today),
    today,
    yearOrder,
  );
  // Filtre « créances antérieures » : il élague les lignes, pas seulement les
  // familles — sinon l'écran affiche encore l'année en cours.
  const filtered = onlyPrevious ? keepPreviousOnly(allFamilies) : allFamilies;

  // Pagination PAR FAMILLE : un groupe n'est jamais coupé entre deux pages.
  const totalPages = Math.max(1, Math.ceil(filtered.length / FAMILIES_PER_PAGE));
  const families = filtered.slice((page - 1) * FAMILIES_PER_PAGE, page * FAMILIES_PER_PAGE);

  const fmt = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (n: number) => `${Math.round(n).toLocaleString(locale)} ${currency}`;
  const totalUnpaid = filtered.reduce((s, f) => s + f.unpaid, 0);
  const totalPrevious = filtered.reduce((s, f) => s + f.previousUnpaid, 0);
  const studentCount = filtered.reduce((s, f) => s + f.students.length, 0);
  const tWaive = await getTranslations('admin.studentFinance.waive');
  const waiveClosedHint =
    waive.opensAt && waive.yearLabel
      ? tWaive('closedHint', { date: waive.opensAt.toLocaleDateString(locale), year: waive.yearLabel })
      : tWaive('noActiveYear');

  const current: Record<string, string> = {
    ...(q ? { q } : {}),
    ...(onlyPrevious ? { only: 'previous' } : {}),
    ...(yearId ? { year: yearId } : {}),
    ...(status ? { status } : {}),
    ...(cycleId ? { cycle: cycleId } : {}),
    ...(classId ? { class: classId } : {}),
    ...(month ? { month } : {}),
  };
  const qs = (extra: Record<string, string>, drop: string[] = []) => {
    const next = { ...current, ...extra };
    for (const k of drop) delete next[k];
    return `?${new URLSearchParams(next)}`;
  };
  const pageHref = (p: number) => qs({ page: String(p) });
  const monthLabel = (m: string) =>
    new Date(`${m}-01T00:00:00Z`).toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' });
  const field = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm';

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{t('manageTitle')}</h1>
          <p className="mt-0.5 text-sm text-slate-600">
            {t('manageSubtitle', { count: studentCount, amount: `${fmt(totalUnpaid)} ${currency}` })}
          </p>
        </div>
        <Link href={`/${locale}/admin/finance`} className="text-xs text-brand-700 hover:underline">
          ← {t('backToFinance')}
        </Link>
      </header>

      {/* ── Indicateurs ─────────────────────────────────────────────────── */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi title={t('kpi.billed')} icon="🧾" tone="bg-blue-50 text-blue-900">
          <p className="text-2xl font-extrabold tabular-nums text-blue-950">{money(kpi.billed)}</p>
          <p className="text-xs text-slate-500">{t('kpi.billedSub', { year: kpiYear?.label ?? '—' })}</p>
        </Kpi>
        <Kpi title={t('kpi.collected')} icon="✔" tone="bg-emerald-100 text-emerald-600">
          <p className="text-2xl font-extrabold tabular-nums text-emerald-600">{money(kpi.collected)}</p>
          <p className="text-xs font-medium text-emerald-600">
            {kpi.collectedPct === null ? '—' : t('kpi.collectedSub', { pct: kpi.collectedPct.toLocaleString(locale) })}
          </p>
        </Kpi>
        <Kpi title={t('kpi.overdue')} icon="⚠" tone="bg-red-100 text-red-600">
          <p className="text-2xl font-extrabold tabular-nums text-red-500">{money(kpi.overdue)}</p>
          <p className="text-xs font-medium text-red-500">{t('kpi.overdueSub', { count: kpi.overdueFamilies })}</p>
        </Kpi>
        <Kpi title={t('kpi.upcoming')} icon="📅" tone="bg-amber-50 text-amber-500">
          <p className="text-2xl font-extrabold tabular-nums text-amber-500">{money(kpi.upcoming)}</p>
          <p className="text-xs text-slate-500">
            {kpi.upcomingMonths.length === 0
              ? t('kpi.upcomingNone')
              : t('kpi.upcomingSub', {
                  months:
                    kpi.upcomingMonths.slice(0, 4).map(monthLabel).join(' / ') +
                    (kpi.upcomingMonths.length > 4 ? '…' : ''),
                })}
          </p>
        </Kpi>
        <Kpi title={t('kpi.recovery')} icon="📈" tone="bg-sky-50 text-sky-700">
          <p className="text-2xl font-extrabold tabular-nums text-sky-700">
            {kpi.recoveryRate === null ? '—' : `${kpi.recoveryRate.toLocaleString(locale)} %`}
          </p>
          <p className={`text-xs font-medium ${delta === null ? 'text-slate-400' : delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {delta === null
              ? t('kpi.recoveryNoPrev')
              : t('kpi.recoveryDelta', { delta: `${delta >= 0 ? '+' : ''}${delta.toLocaleString(locale)}` })}
          </p>
        </Kpi>
      </div>

      {/* ── Filtres ─────────────────────────────────────────────────────── */}
      <form method="get" className="mb-3 grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-4 xl:grid-cols-7 xl:items-end">
        {onlyPrevious && <input type="hidden" name="only" value="previous" />}
        <label className="block text-xs font-medium text-slate-600">
          {t('filters.year')}
          <select name="year" defaultValue={yearId} className={field}>
            <option value="">{t('filters.allYears')}</option>
            {[...ledger.years].reverse().map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
                {y.id === ledger.activeYearId ? ' ★' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-600">
          {t('filters.status')}
          <select name="status" defaultValue={status} className={field}>
            <option value="">{t('filters.statusAll')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}` as never)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-600">
          {t('filters.cycle')}
          <select name="cycle" defaultValue={cycleId} className={field}>
            <option value="">{t('filters.allCycles')}</option>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {localizedLabel(locale, c.label, c.labelAr)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-600">
          {t('filters.class')}
          <select name="class" defaultValue={classId} className={field}>
            <option value="">{t('filters.allClasses')}</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {localizedLabel(locale, c.name, c.nameAr)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-600">
          {t('filters.month')}
          <input type="month" name="month" defaultValue={month} className={field} />
        </label>
        <label className="col-span-2 block text-xs font-medium text-slate-600 md:col-span-2 xl:col-span-1">
          {t('filters.search')}
          <input type="search" name="q" defaultValue={q} placeholder={t('filters.searchPlaceholder')} className={field} />
        </label>
        <div className="col-span-2 flex items-end gap-2 md:col-span-4 xl:col-span-1">
          <button type="submit" className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
            {t('filters.apply')}
          </button>
          <Link href="?" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            {t('filters.reset')}
          </Link>
        </div>
      </form>

      {/* Créances reportées : le total est mis en avant, et le filtre permet de
          n'afficher que les familles concernées. */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <span className="font-semibold">{t('previousTotal')}</span>{' '}
          <span className="tabular-nums font-bold">
            {fmt(totalPrevious)} {currency}
          </span>
        </div>
        <Link
          href={onlyPrevious ? qs({}, ['only', 'page']) : qs({ only: 'previous' }, ['page'])}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
            onlyPrevious
              ? 'border-amber-500 bg-amber-500 text-white'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          {onlyPrevious ? t('previousFilterOn') : t('previousFilterOff')}
        </Link>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 table-head text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-start">{t('family')}</th>
              <th className="px-4 py-3 text-start">{t('student')}</th>
              <th className="px-4 py-3 text-start">{t('year')}</th>
              <th className="px-4 py-3 text-end">{t('due')}</th>
              <th className="px-4 py-3 text-end">{t('paid')}</th>
              <th className="px-4 py-3 text-end">{t('remaining')}</th>
              <th className="px-4 py-3 text-start">{t('echeances')}</th>
              <th className="px-4 py-3 text-end">{t('daysLate')}</th>
              <th className="px-4 py-3 text-end">{t('action')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {families.map((f) => (
              <FamilyRows
                key={f.familyId}
                family={f}
                currency={currency}
                fmt={fmt}
                t={t}
                remindersByStudent={remindersByStudent}
                canWaive={waive.canWaive}
                canWaivePrevious={waive.canWaivePrevious}
                waiveClosedHint={waiveClosedHint}
              />
            ))}
            {families.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                  {Object.keys(current).length > 0 ? t('noResult') : t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} hrefFor={pageHref} />
    </div>
  );
}

function Kpi({ title, icon, tone, children }: { title: string; icon: string; tone: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2 text-sm font-medium text-slate-600">
        <span>{title}</span>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-base ${tone}`}>{icon}</span>
      </div>
      {children}
    </section>
  );
}

/**
 * Les lignes d'une famille : la cellule « Famille » est fusionnée sur toutes
 * ses lignes (élève × année), et la cellule « Élève » sur ses années.
 */
function FamilyRows({
  family,
  currency,
  fmt,
  t,
  remindersByStudent,
  canWaive,
  canWaivePrevious,
  waiveClosedHint,
}: {
  family: UnpaidFamilyGroup;
  currency: string;
  fmt: (n: number) => string;
  t: (k: string, v?: Record<string, string | number>) => string;
  remindersByStudent: Record<string, { id: string; note: string; createdAt: string; author: string | null }[]>;
  canWaive: boolean;
  canWaivePrevious: boolean;
  waiveClosedHint: string;
}) {
  let firstOfFamily = true;
  return (
    <>
      {family.students.map((s) =>
        s.years.map((y0, yIdx) => {
          const y = y0 as LedgerYearRow;
          const famCell = firstOfFamily;
          firstOfFamily = false;
          const overdueIds = (s.years as LedgerYearRow[]).flatMap((x) => x.overdueIds ?? []);
          const allContentious = (s.years as LedgerYearRow[]).every((x) => x.overdueIds.length === 0 || x.contentious);
          return (
            <tr key={`${s.studentId}-${y.yearId ?? 'none'}`} className="align-top">
              {famCell && (
                <td
                  rowSpan={family.rowCount}
                  className="border-e border-slate-100 bg-slate-50/40 px-4 py-3 align-middle font-medium text-slate-900"
                >
                  {family.familyName}
                  {family.students.length > 1 && (
                    <span className="ms-1 text-xs text-slate-400">({family.students.length})</span>
                  )}
                  <div className="mt-1 text-xs font-semibold tabular-nums text-red-700">
                    {fmt(family.unpaid)} {currency}
                  </div>
                  {family.previousUnpaid > 0 && (
                    <div className="mt-0.5 text-[11px] tabular-nums text-amber-700">
                      {t('previousBadge', { amount: `${fmt(family.previousUnpaid)} ${currency}` })}
                    </div>
                  )}
                </td>
              )}
              {yIdx === 0 && (
                <td rowSpan={s.years.length} className="border-e border-slate-100 px-4 py-3 align-middle text-slate-700">
                  {s.studentName}
                  <div className="mt-1 text-xs font-medium tabular-nums text-red-700">
                    {fmt(s.unpaid)} {currency}
                  </div>
                </td>
              )}
              <td className="px-4 py-3 text-xs">
                <span className={y.previous ? 'rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800' : 'text-slate-600'}>
                  {y.yearLabel}
                </span>
                {y.contentious && (
                  <span className="ms-1 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-800">
                    {t('contentious.badge')}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-end tabular-nums text-slate-700">
                {fmt(y.due)} {currency}
              </td>
              <td className="px-4 py-3 text-end tabular-nums text-emerald-700">
                {fmt(y.paid)} {currency}
              </td>
              <td className="px-4 py-3 text-end tabular-nums font-semibold text-red-700">
                {fmt(y.unpaid)} {currency}
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">{y.echeances.join(' - ')}</td>
              <td className="px-4 py-3 text-end tabular-nums text-amber-700">
                {y.daysLate > 0 ? t('days', { count: y.daysLate }) : '—'}
              </td>
              {yIdx === 0 && (
                <td rowSpan={s.years.length} className="px-4 py-3 text-end align-middle">
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <RelanceButton
                      studentId={s.studentId}
                      studentName={s.studentName}
                      reminders={remindersByStudent[s.studentId] ?? []}
                    />
                    {/* Régler avant Effacer : encaisser est le geste attendu,
                        abandonner la créance est l'exception. */}
                    <SettleDebtsButton studentName={s.studentName} years={s.years} currency={currency} />
                    <WaiveDebtsButton
                      studentName={s.studentName}
                      years={s.years}
                      currency={currency}
                      canWaive={canWaive}
                      canWaivePrevious={canWaivePrevious}
                      closedHint={waiveClosedHint}
                    />
                    <ContentiousButton installmentIds={overdueIds} active={overdueIds.length > 0 && allContentious} />
                  </div>
                </td>
              )}
            </tr>
          );
        }),
      )}
    </>
  );
}
