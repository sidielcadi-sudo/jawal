import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import type { Prisma } from '@/lib/db';

const PAGE_SIZE = 20;
const VALID_TYPES = ['STUDENT', 'TEACHER', 'STAFF', 'PARENT'] as const;
type PersonTypeLiteral = (typeof VALID_TYPES)[number];

function isPersonType(value: string | undefined): value is PersonTypeLiteral {
  return !!value && (VALID_TYPES as readonly string[]).includes(value);
}

export default async function PersonsListPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ type?: string; search?: string; page?: string; archived?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const session = (await auth())!;
  const tenantId = session.user.tenantId;
  const t = await getTranslations('admin.persons');

  const typeFilter = isPersonType(sp.type) ? sp.type : undefined;
  const search = sp.search?.trim() ?? '';
  const showArchived = sp.archived === '1';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const where: Prisma.PersonWhereInput = {
    deletedAt: showArchived ? { not: null } : null,
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { cin: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const { persons, total } = await withTenant(tenantId, async (tx) => {
    const [persons, total] = await Promise.all([
      tx.person.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      tx.person.count({ where }),
    ]);
    return { persons, total };
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const baseHref = `/${locale}/admin/persons`;
  const qs = (overrides: Record<string, string | undefined>) => {
    const usp = new URLSearchParams();
    if (typeFilter && overrides.type === undefined) usp.set('type', typeFilter);
    if (overrides.type) usp.set('type', overrides.type);
    if (search && overrides.search === undefined) usp.set('search', search);
    if (overrides.search) usp.set('search', overrides.search);
    if (showArchived && overrides.archived === undefined) usp.set('archived', '1');
    if (overrides.archived) usp.set('archived', overrides.archived);
    if (overrides.page) usp.set('page', overrides.page);
    const s = usp.toString();
    return s ? `${baseHref}?${s}` : baseHref;
  };

  const title = typeFilter ? t(`title.${typeFilter}`) : t('title.ALL');

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('count', { count: total })}</p>
        </div>
        <Link
          href={`${baseHref}/new${typeFilter ? `?type=${typeFilter}` : ''}`}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700"
        >
          {t('actions.new')}
        </Link>
      </div>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        {typeFilter && <input type="hidden" name="type" value={typeFilter} />}
        {showArchived && <input type="hidden" name="archived" value="1" />}
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="search" className="block text-xs font-medium text-slate-600">
            {t('filters.search')}
          </label>
          <input
            type="search"
            id="search"
            name="search"
            defaultValue={search}
            placeholder={t('filters.searchPlaceholder')}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          {t('filters.apply')}
        </button>
        <Link
          href={qs({ search: '', archived: showArchived ? '0' : '1' })}
          className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-700"
        >
          {showArchived ? t('filters.showActive') : t('filters.showArchived')}
        </Link>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-start">{t('table.name')}</th>
              <th className="px-4 py-3 text-start">{t('table.type')}</th>
              <th className="px-4 py-3 text-start">{t('table.contact')}</th>
              <th className="px-4 py-3 text-start">{t('table.birthDate')}</th>
              <th className="px-4 py-3 text-end">{t('table.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {persons.map((p) => {
              const contacts = (p.contacts ?? {}) as { email?: string; phone?: string };
              return (
                <tr key={p.id} className={p.deletedAt ? 'bg-slate-50/60 text-slate-500' : ''}>
                  <td className="px-4 py-3">
                    <Link
                      href={`${baseHref}/${p.id}`}
                      className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                    >
                      {p.lastName} {p.firstName}
                    </Link>
                    {p.deletedAt && (
                      <span className="ms-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">
                        {t('archived')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge type={p.type} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {contacts.email ?? contacts.phone ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {p.birthDate ? new Date(p.birthDate).toLocaleDateString(locale) : '—'}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <Link
                      href={`${baseHref}/${p.id}`}
                      className="text-xs text-slate-500 hover:text-brand-700"
                    >
                      {t('actions.view')}
                    </Link>
                  </td>
                </tr>
              );
            })}
            {persons.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  {t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm">
          <span className="text-slate-500">
            {t('pagination.page', { page, total: totalPages })}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={qs({ page: String(page - 1) })}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50"
              >
                {t('pagination.prev')}
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={qs({ page: String(page + 1) })}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50"
              >
                {t('pagination.next')}
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    STUDENT: 'bg-blue-100 text-blue-700',
    TEACHER: 'bg-purple-100 text-purple-700',
    STAFF: 'bg-amber-100 text-amber-700',
    PARENT: 'bg-emerald-100 text-emerald-700',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${styles[type] ?? 'bg-slate-100'}`}>
      {type}
    </span>
  );
}
