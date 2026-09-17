import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { requirePermission } from '@/lib/auth/rbac';
import { personDisplayName } from '@/lib/localized-name';
import { FIN_CATS, type FinCat } from '@/lib/group-finance';

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/**
 * Rapport direction : créances annulées (remises gracieuses) avec motif,
 * montant, élève, date et auteur. Trace exigée par le CGNC.
 *
 * Même écran que Gestion des impayés — bandeau de tête, filtres, tableau pleine
 * largeur — parce qu'on y vient pour la même raison : retrouver une créance.
 */
export default async function WaivedDebtsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ year?: string; cat?: string; month?: string; q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission('finance.read');
  const t = await getTranslations('admin.finance.waived');
  const tu = await getTranslations('admin.finance.unpaid');
  const tCat = await getTranslations('admin.group.finance.cats');
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? sp.month! : '';

  const session = (await auth())!;
  const data = await withTenant(session.user.tenantId, async (tx) => {
    const [years, installments, feeItems, tenant] = await Promise.all([
      tx.academicYear.findMany({
        orderBy: { startDate: 'desc' },
        select: { id: true, label: true, active: true, startDate: true, endDate: true },
      }),
      tx.installment.findMany({
        where: { waivedAt: { not: null } },
        select: {
          id: true,
          label: true,
          dueDate: true,
          waivedAmount: true,
          waivedReason: true,
          waivedAt: true,
          waivedByUserId: true,
          feeScheduleItemId: true,
          supportCourseId: true,
          exceptionalFeeAssignment: { select: { exceptionalFee: { select: { academicYearId: true } } } },
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              firstNameAr: true,
              lastNameAr: true,
              relationsAsChild: {
                select: { parent: { select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } } },
              },
            },
          },
        },
        orderBy: { waivedAt: 'desc' },
      }),
      tx.feeScheduleItem.findMany({ select: { id: true, category: true } }),
      tx.tenant.findFirst({ select: { currency: true } }),
    ]);

    const userIds = [...new Set(installments.map((r) => r.waivedByUserId).filter(Boolean) as string[])];
    const users = userIds.length
      ? await tx.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            email: true,
            userPersons: {
              include: {
                person: { select: { firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } },
              },
            },
          },
        })
      : [];
    const userLabel = new Map<string, string>();
    for (const u of users) {
      const p = u.userPersons[0]?.person;
      userLabel.set(u.id, p ? personDisplayName(locale, p) : u.email);
    }
    return { years, installments, feeItems, userLabel, currency: tenant?.currency ?? 'MAD' };
  });

  const catOf = new Map(data.feeItems.map((f) => [f.id, f.category as FinCat]));
  const yearId = data.years.some((y) => y.id === sp.year) ? sp.year! : '';
  const cat = (FIN_CATS as readonly string[]).includes(sp.cat ?? '') ? (sp.cat as FinCat) : '';

  /** Une remise porte l'année de son frais exceptionnel, sinon celle de sa date d'échéance. */
  const yearOf = (r: (typeof data.installments)[number]) => {
    const declared = r.exceptionalFeeAssignment?.exceptionalFee.academicYearId;
    if (declared) return data.years.find((y) => y.id === declared) ?? null;
    return data.years.find((y) => r.dueDate >= y.startDate && r.dueDate <= y.endDate) ?? null;
  };

  const rows = data.installments.map((r) => {
    const category: FinCat = r.exceptionalFeeAssignment
      ? 'EXCEPTIONAL'
      : r.supportCourseId
        ? 'SUPPORT'
        : ((r.feeScheduleItemId ? catOf.get(r.feeScheduleItemId) : undefined) ?? 'OTHER');
    const guardians = r.student.relationsAsChild.map((x) => personDisplayName(locale, x.parent));
    return {
      id: r.id,
      label: r.label,
      dueDate: r.dueDate,
      amount: Number(r.waivedAmount ?? 0),
      reason: r.waivedReason,
      waivedAt: r.waivedAt,
      by: r.waivedByUserId ? (data.userLabel.get(r.waivedByUserId) ?? null) : null,
      studentId: r.student.id,
      studentName: personDisplayName(locale, r.student),
      searchKey: strip([personDisplayName(locale, r.student), ...guardians].join(' ')),
      category,
      year: yearOf(r),
    };
  });

  const needle = strip(q);
  const shown = rows.filter(
    (r) =>
      (!yearId || r.year?.id === yearId) &&
      (!cat || r.category === cat) &&
      (!month || r.dueDate.toISOString().slice(0, 7) === month) &&
      (!needle || r.searchKey.includes(needle)),
  );

  const total = shown.reduce((s, r) => s + r.amount, 0);
  const students = new Set(shown.map((r) => r.studentId)).size;
  // Types réellement présents : un menu qui propose des catégories absentes
  // donne des filtres qui ne ramènent jamais rien.
  const presentCats = FIN_CATS.filter((c) => rows.some((r) => r.category === c));
  const current: Record<string, string> = {
    ...(yearId ? { year: yearId } : {}),
    ...(cat ? { cat } : {}),
    ...(month ? { month } : {}),
    ...(q ? { q } : {}),
  };
  const money = (n: number) => `${n.toFixed(2)} ${data.currency}`;
  const field = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm';

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-600">
            {t('summary', { students, count: shown.length, amount: money(total) })}
          </p>
        </div>
        <Link href={`/${locale}/admin/finance`} className="text-xs text-brand-700 hover:underline">
          ← {t('financeCrumb')}
        </Link>
      </header>

      <form
        method="get"
        className="mb-3 grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-4 xl:grid-cols-5 xl:items-end"
      >
        <label className="block text-xs font-medium text-slate-600">
          {tu('filters.year')}
          <select name="year" defaultValue={yearId} className={field}>
            <option value="">{tu('filters.allYears')}</option>
            {data.years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
                {y.active ? ' ★' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-600">
          {t('type')}
          <select name="cat" defaultValue={cat} className={field}>
            <option value="">{t('allTypes')}</option>
            {presentCats.map((c) => (
              <option key={c} value={c}>
                {tCat(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-600">
          {tu('filters.month')}
          <input type="month" name="month" defaultValue={month} className={field} />
        </label>
        <label className="col-span-2 block text-xs font-medium text-slate-600 md:col-span-1">
          {tu('filters.search')}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={tu('filters.searchPlaceholder')}
            className={field}
          />
        </label>
        <div className="col-span-2 flex items-end gap-2 md:col-span-4 xl:col-span-1">
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            {tu('filters.apply')}
          </button>
          <Link
            href="?"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            {tu('filters.reset')}
          </Link>
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-4 py-3 text-start">{t('date')}</th>
              <th className="px-4 py-3 text-start">{t('student')}</th>
              <th className="px-4 py-3 text-start">{t('fee')}</th>
              <th className="px-4 py-3 text-start">{t('type')}</th>
              <th className="px-4 py-3 text-start">{tu('year')}</th>
              <th className="px-4 py-3 text-end">{t('amount')}</th>
              <th className="px-4 py-3 text-start">{t('reason')}</th>
              <th className="px-4 py-3 text-start">{t('by')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {r.waivedAt ? new Date(r.waivedAt).toLocaleDateString(locale) : '—'}
                </td>
                <td className="px-4 py-3 text-slate-800">{r.studentName}</td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {r.label}
                  <div className="text-[11px] text-slate-400">
                    {t('dueDate', { date: r.dueDate.toLocaleDateString(locale) })}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">{tCat(r.category)}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{r.year?.label ?? '—'}</td>
                <td className="px-4 py-3 text-end font-medium tabular-nums text-amber-700">{money(r.amount)}</td>
                <td className="px-4 py-3 text-slate-700">{r.reason ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{r.by ?? '—'}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  {Object.keys(current).length > 0 ? tu('noResult') : t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
