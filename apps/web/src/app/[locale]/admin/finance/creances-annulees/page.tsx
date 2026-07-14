import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { requirePermission } from '@/lib/auth/rbac';

/**
 * Rapport direction : tableau des créances annulées (remises gracieuses) avec
 * motif, montant, élève, date et auteur. Trace exigée par le CGNC.
 */
export default async function WaivedDebtsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission('finance.read');
  const t = await getTranslations('admin.finance.waived');

  const session = (await auth())!;
  const data = await withTenant(session.user.tenantId, async (tx) => {
    const rows = await tx.installment.findMany({
      where: { waivedAt: { not: null } },
      select: {
        id: true,
        label: true,
        waivedAmount: true,
        waivedReason: true,
        waivedAt: true,
        waivedByUserId: true,
        student: { select: { firstName: true, lastName: true } },
      },
      orderBy: { waivedAt: 'desc' },
    });
    const userIds = [...new Set(rows.map((r) => r.waivedByUserId).filter(Boolean) as string[])];
    const users = userIds.length
      ? await tx.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, userPersons: { include: { person: { select: { firstName: true, lastName: true } } } } },
        })
      : [];
    const userLabel = new Map<string, string>();
    for (const u of users) {
      const p = u.userPersons[0]?.person;
      userLabel.set(u.id, p ? `${p.lastName} ${p.firstName}` : u.email);
    }
    const tenant = await tx.tenant.findFirst({ select: { currency: true } });
    return { rows, userLabel, currency: tenant?.currency ?? 'MAD' };
  });

  const total = data.rows.reduce((s, r) => s + Number(r.waivedAmount ?? 0), 0);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/finance`} className="hover:text-brand-700">
          {t('financeCrumb')}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{t('title')}</span>
      </nav>

      <header className="mb-5">
        <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      </header>

      <div className="mb-4 inline-flex rounded-2xl border border-slate-200 bg-white px-5 py-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">{t('total')}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-amber-700">
            {total.toFixed(2)} {data.currency}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-[#A9EAFE] text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-4 py-3 text-start">{t('date')}</th>
              <th className="px-4 py-3 text-start">{t('student')}</th>
              <th className="px-4 py-3 text-start">{t('fee')}</th>
              <th className="px-4 py-3 text-end">{t('amount')}</th>
              <th className="px-4 py-3 text-start">{t('reason')}</th>
              <th className="px-4 py-3 text-start">{t('by')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {r.waivedAt ? new Date(r.waivedAt).toLocaleDateString(locale) : '—'}
                </td>
                <td className="px-4 py-3 text-slate-800">{r.student.lastName} {r.student.firstName}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{r.label}</td>
                <td className="px-4 py-3 text-end tabular-nums font-medium text-amber-700">
                  {Number(r.waivedAmount ?? 0).toFixed(2)} {data.currency}
                </td>
                <td className="px-4 py-3 text-slate-700">{r.waivedReason ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {r.waivedByUserId ? data.userLabel.get(r.waivedByUserId) ?? '—' : '—'}
                </td>
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">{t('empty')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
