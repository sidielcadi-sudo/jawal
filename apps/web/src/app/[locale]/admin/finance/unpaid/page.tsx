import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { loadUnpaidByFamily } from '@/lib/unpaid';
import { Pagination } from '@/components/pagination';
import { RelanceButton } from './client';

export default async function UnpaidPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission('finance.write');
  const t = await getTranslations('admin.finance.unpaid');
  const session = (await auth())!;
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const FAMILIES_PER_PAGE = 25;

  const { rows: allRows, remindersByStudent, currency } = await withTenant(session.user.tenantId, async (tx) => {
    const u = await loadUnpaidByFamily(tx);
    const ids = u.rows.map((r) => r.studentId);
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
    return { rows: u.rows, remindersByStudent: byStudent, currency: tenant?.currency ?? 'MAD' };
  });

  // Filtre de recherche (famille ou élève).
  const ql = q.toLowerCase();
  const filtered = q
    ? allRows.filter(
        (r) => r.familyName.toLowerCase().includes(ql) || r.studentName.toLowerCase().includes(ql),
      )
    : allRows;

  // Pagination PAR FAMILLE (les lignes d'une même famille sont consécutives et
  // fusionnées par rowSpan : on ne coupe jamais un groupe entre deux pages).
  const families: (typeof filtered)[] = [];
  for (let i = 0; i < filtered.length; ) {
    let j = i;
    while (j < filtered.length && filtered[j]!.familyId === filtered[i]!.familyId) j++;
    families.push(filtered.slice(i, j));
    i = j;
  }
  const totalPages = Math.max(1, Math.ceil(families.length / FAMILIES_PER_PAGE));
  const rows = families.slice((page - 1) * FAMILIES_PER_PAGE, page * FAMILIES_PER_PAGE).flat();

  // Fusion des cellules « Famille » : rowSpan sur la 1ʳᵉ ligne de chaque famille (page courante).
  const familySpan = new Map<number, number>();
  for (let i = 0; i < rows.length; ) {
    let j = i;
    while (j < rows.length && rows[j]!.familyId === rows[i]!.familyId) j++;
    familySpan.set(i, j - i);
    i = j;
  }

  const fmt = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const totalUnpaid = filtered.reduce((s, r) => s + r.unpaid, 0);
  const pageHref = (p: number) => `?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-100 to-brand-50 shadow-sm px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{t('manageTitle')}</h1>
          <p className="mt-0.5 text-sm text-slate-600">
            {t('manageSubtitle', { count: filtered.length, amount: `${fmt(totalUnpaid)} ${currency}` })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form method="get" className="flex items-center gap-2">
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

      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-start">{t('family')}</th>
              <th className="px-4 py-3 text-start">{t('student')}</th>
              <th className="px-4 py-3 text-end">{t('amount')}</th>
              <th className="px-4 py-3 text-start">{t('echeances')}</th>
              <th className="px-4 py-3 text-end">{t('daysLate')}</th>
              <th className="px-4 py-3 text-end">{t('action')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, idx) => {
              const span = familySpan.get(idx);
              return (
                <tr key={r.studentId} className="align-top">
                  {span !== undefined && (
                    <td
                      rowSpan={span}
                      className="border-e border-slate-100 bg-slate-50/40 px-4 py-3 align-middle font-medium text-slate-900"
                    >
                      {r.familyName}
                      {span > 1 && <span className="ms-1 text-xs text-slate-400">({span})</span>}
                    </td>
                  )}
                  <td className="px-4 py-3 text-slate-700">{r.studentName}</td>
                  <td className="px-4 py-3 text-end tabular-nums font-semibold text-red-700">
                    {fmt(r.unpaid)} {currency}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{r.echeances.join(' - ')}</td>
                  <td className="px-4 py-3 text-end tabular-nums text-amber-700">
                    {t('days', { count: r.daysLate })}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <RelanceButton
                      studentId={r.studentId}
                      studentName={r.studentName}
                      reminders={remindersByStudent[r.studentId] ?? []}
                    />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  {q ? t('noResult') : t('empty')}
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
