import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { keepPreviousOnly, loadUnpaidByFamilyYear, type UnpaidFamilyGroup } from '@/lib/unpaid';
import { Pagination } from '@/components/pagination';
import { RelanceButton } from './client';
import { WaiveDebtsButton } from './waive-debts';
import { SettleDebtsButton } from './settle-debts';
import { loadWaiveContext } from '@/lib/school-year';

export default async function UnpaidPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; page?: string; only?: string }>;
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

  const {
    families: allFamilies,
    remindersByStudent,
    currency,
    canWaive,
    canWaivePrevious,
    waiveOpensAt,
    activeYearLabel,
  } = await withTenant(
    session.user.tenantId,
    async (tx) => {
      const u = await loadUnpaidByFamilyYear(tx);
      const ids = u.families.flatMap((f) => f.students.map((s) => s.studentId));
      const rems = ids.length
        ? await tx.paymentReminder.findMany({
            where: { studentId: { in: ids } },
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
          author: r.createdByUserId ? emailById.get(r.createdByUserId) ?? null : null,
        });
      }
      const tenant = await tx.tenant.findFirst({ select: { currency: true } });
      // L'effacement suit la politique de l'établissement (Paramétrage →
      // Frais) : le serveur refuse hors fenêtre, autant griser le bouton et
      // dire pourquoi.
      const waive = await loadWaiveContext(tx);
      return {
        families: u.families,
        remindersByStudent: byStudent,
        currency: tenant?.currency ?? 'MAD',
        canWaive: waive.canWaive,
        canWaivePrevious: waive.canWaivePrevious,
        waiveOpensAt: waive.opensAt,
        activeYearLabel: waive.yearLabel,
      };
    },
  );

  // Filtre « créances antérieures » : il élague les lignes, pas seulement les
  // familles — sinon l'écran affiche encore l'année en cours.
  const scoped = onlyPrevious ? keepPreviousOnly(allFamilies) : allFamilies;

  // Filtre de recherche (famille ou élève).
  const ql = q.toLowerCase();
  const filtered = scoped.filter((f) => {
    if (!q) return true;
    return (
      f.familyName.toLowerCase().includes(ql) ||
      f.students.some((s) => s.studentName.toLowerCase().includes(ql))
    );
  });

  // Pagination PAR FAMILLE : un groupe n'est jamais coupé entre deux pages.
  const totalPages = Math.max(1, Math.ceil(filtered.length / FAMILIES_PER_PAGE));
  const families = filtered.slice((page - 1) * FAMILIES_PER_PAGE, page * FAMILIES_PER_PAGE);

  const fmt = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const totalUnpaid = filtered.reduce((s, f) => s + f.unpaid, 0);
  const totalPrevious = filtered.reduce((s, f) => s + f.previousUnpaid, 0);
  const studentCount = filtered.reduce((s, f) => s + f.students.length, 0);
  // Message affiché dans la fenêtre d'effacement quand elle n'est pas ouverte.
  const tWaive = await getTranslations('admin.studentFinance.waive');
  const waiveClosedHint =
    waiveOpensAt && activeYearLabel
      ? tWaive('closedHint', {
          date: waiveOpensAt.toLocaleDateString(locale),
          year: activeYearLabel,
        })
      : tWaive('noActiveYear');

  const qs = (extra: Record<string, string>) =>
    `?${new URLSearchParams({ ...(q ? { q } : {}), ...(onlyPrevious ? { only: 'previous' } : {}), ...extra })}`;
  const pageHref = (p: number) => qs({ page: String(p) });

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{t('manageTitle')}</h1>
          <p className="mt-0.5 text-sm text-slate-600">
            {t('manageSubtitle', { count: studentCount, amount: `${fmt(totalUnpaid)} ${currency}` })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form method="get" className="flex items-center gap-2">
            {onlyPrevious && <input type="hidden" name="only" value="previous" />}
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder={t('searchPlaceholder')}
              className="focus:border-brand-500 focus:ring-brand-500 w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1"
            />
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              {t('search')}
            </button>
          </form>
          <Link href={`/${locale}/admin/finance`} className="text-xs text-brand-700 hover:underline">
            ← {t('backToFinance')}
          </Link>
        </div>
      </header>

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
          href={onlyPrevious ? qs({}) : qs({ only: 'previous' })}
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
                canWaive={canWaive}
                canWaivePrevious={canWaivePrevious}
                waiveClosedHint={waiveClosedHint}
              />
            ))}
            {families.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                  {q || onlyPrevious ? t('noResult') : t('empty')}
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
  remindersByStudent: Record<
    string,
    { id: string; note: string; createdAt: string; author: string | null }[]
  >;
  canWaive: boolean;
  canWaivePrevious: boolean;
  waiveClosedHint: string;
}) {
  let firstOfFamily = true;
  return (
    <>
      {family.students.map((s) =>
        s.years.map((y, yIdx) => {
          const famCell = firstOfFamily;
          firstOfFamily = false;
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
                <td
                  rowSpan={s.years.length}
                  className="border-e border-slate-100 px-4 py-3 align-middle text-slate-700"
                >
                  {s.studentName}
                  <div className="mt-1 text-xs font-medium tabular-nums text-red-700">
                    {fmt(s.unpaid)} {currency}
                  </div>
                </td>
              )}
              <td className="px-4 py-3 text-xs">
                <span
                  className={
                    y.previous
                      ? 'rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800'
                      : 'text-slate-600'
                  }
                >
                  {y.yearLabel}
                </span>
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
                {t('days', { count: y.daysLate })}
              </td>
              {yIdx === 0 && (
                <td rowSpan={s.years.length} className="px-4 py-3 text-end align-middle">
                  <div className="flex items-center justify-end gap-1">
                    <RelanceButton
                      studentId={s.studentId}
                      studentName={s.studentName}
                      reminders={remindersByStudent[s.studentId] ?? []}
                    />
                    {/* Régler avant Effacer : encaisser est le geste attendu,
                        abandonner la créance est l'exception. */}
                    <SettleDebtsButton
                      studentName={s.studentName}
                      years={s.years}
                      currency={currency}
                    />
                    <WaiveDebtsButton
                      studentName={s.studentName}
                      years={s.years}
                      currency={currency}
                      canWaive={canWaive}
                      canWaivePrevious={canWaivePrevious}
                      closedHint={waiveClosedHint}
                    />
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
