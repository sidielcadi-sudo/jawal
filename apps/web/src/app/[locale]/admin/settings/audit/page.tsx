import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import type { Prisma } from '@/lib/db';

const PAGE_SIZE = 50;

export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ entity?: string; action?: string; page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations('admin.settings.audit');
  // Traduction des valeurs techniques (entité/action) avec repli sur la valeur brute.
  const labelEntity = (e: string) => (t.has(`entities.${e}`) ? t(`entities.${e}`) : e);
  const labelAction = (a: string) => (t.has(`actions.${a}`) ? t(`actions.${a}`) : a);

  const session = (await auth())!;
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const where: Prisma.AuditLogWhereInput = {
    ...(sp.entity ? { entityType: sp.entity } : {}),
    ...(sp.action ? { action: sp.action } : {}),
  };

  const { logs, total, distinctEntities, distinctActions } = await withTenant(
    session.user.tenantId,
    async (tx) => {
      const [logs, total, distinctEntitiesRaw, distinctActionsRaw] = await Promise.all([
        tx.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          include: { user: { select: { email: true } } },
        }),
        tx.auditLog.count({ where }),
        tx.auditLog.findMany({
          distinct: ['entityType'],
          select: { entityType: true },
          orderBy: { entityType: 'asc' },
        }),
        tx.auditLog.findMany({
          distinct: ['action'],
          select: { action: true },
          orderBy: { action: 'asc' },
        }),
      ]);
      return {
        logs,
        total,
        distinctEntities: distinctEntitiesRaw.map((r) => r.entityType),
        distinctActions: distinctActionsRaw.map((r) => r.action),
      };
    },
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const base = `/${locale}/admin/settings/audit`;
  const qs = (overrides: Record<string, string | undefined>) => {
    const usp = new URLSearchParams();
    if (sp.entity && overrides.entity === undefined) usp.set('entity', sp.entity);
    if (overrides.entity) usp.set('entity', overrides.entity);
    if (sp.action && overrides.action === undefined) usp.set('action', sp.action);
    if (overrides.action) usp.set('action', overrides.action);
    if (overrides.page) usp.set('page', overrides.page);
    return `${base}?${usp.toString()}`;
  };

  return (
    <div>
      <header className="mb-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('title')}</h2>
        <p className="text-xs text-slate-500">{t('subtitle', { total })}</p>
      </header>

      <form method="get" className="mb-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-slate-600">{t('filter.entity')}</label>
          <select
            name="entity"
            defaultValue={sp.entity ?? ''}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm"
          >
            <option value="">{t('filter.all')}</option>
            {distinctEntities.map((e) => (
              <option key={e} value={e}>
                {labelEntity(e)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-600">{t('filter.action')}</label>
          <select
            name="action"
            defaultValue={sp.action ?? ''}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm"
          >
            <option value="">{t('filter.all')}</option>
            {distinctActions.map((a) => (
              <option key={a} value={a}>
                {labelAction(a)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          {t('filter.apply')}
        </button>
        {(sp.entity || sp.action) && (
          <Link href={base} className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">
            {t('filter.clear')}
          </Link>
        )}
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-start">{t('table.when')}</th>
              <th className="px-3 py-2 text-start">{t('table.who')}</th>
              <th className="px-3 py-2 text-start">{t('table.action')}</th>
              <th className="px-3 py-2 text-start">{t('table.entity')}</th>
              <th className="px-3 py-2 text-start">{t('table.entityId')}</th>
              <th className="px-3 py-2 text-start">{t('table.diff')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="px-3 py-2 text-slate-600">
                  {new Date(log.createdAt).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'medium' })}
                </td>
                <td className="px-3 py-2 text-slate-700">{log.user?.email ?? '—'}</td>
                <td className="px-3 py-2">
                  <ActionBadge action={log.action} label={labelAction(log.action)} />
                </td>
                <td className="px-3 py-2 font-medium text-slate-900">{labelEntity(log.entityType)}</td>
                <td className="px-3 py-2 font-mono text-[10px] text-slate-500">
                  {log.entityId ? log.entityId.slice(0, 8) : '—'}
                </td>
                <td className="px-3 py-2 max-w-md">
                  <DiffPreview before={log.before} after={log.after} />
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-slate-500">
                  {t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav className="mt-3 flex items-center justify-between text-sm">
          <span className="text-xs text-slate-500">{t('pagination', { page, total: totalPages })}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={qs({ page: String(page - 1) })}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-50"
              >
                ←
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={qs({ page: String(page + 1) })}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-50"
              >
                →
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}

function ActionBadge({ action, label }: { action: string; label: string }) {
  const styles: Record<string, string> = {
    create: 'bg-emerald-100 text-emerald-700',
    update: 'bg-blue-100 text-blue-700',
    delete: 'bg-red-100 text-red-700',
    restore: 'bg-amber-100 text-amber-700',
    enroll: 'bg-purple-100 text-purple-700',
    unenroll: 'bg-orange-100 text-orange-700',
    invite: 'bg-indigo-100 text-indigo-700',
    setActive: 'bg-emerald-100 text-emerald-700',
    approve: 'bg-emerald-100 text-emerald-700',
    reject: 'bg-red-100 text-red-700',
    notify: 'bg-indigo-100 text-indigo-700',
    save: 'bg-blue-100 text-blue-700',
    resubmit: 'bg-amber-100 text-amber-700',
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${styles[action] ?? 'bg-slate-100 text-slate-700'}`}>
      {label}
    </span>
  );
}

function DiffPreview({ before, after }: { before: unknown; after: unknown }) {
  const fmt = (v: unknown) =>
    v === null || v === undefined
      ? '—'
      : typeof v === 'object'
        ? JSON.stringify(v).slice(0, 80)
        : String(v);

  if (after && !before) {
    return <span className="text-emerald-700">+ {fmt(after)}</span>;
  }
  if (before && !after) {
    return <span className="text-red-700">− {fmt(before)}</span>;
  }
  if (before && after) {
    return (
      <div className="space-y-0.5">
        <div className="text-red-700">− {fmt(before)}</div>
        <div className="text-emerald-700">+ {fmt(after)}</div>
      </div>
    );
  }
  return <span className="text-slate-400">—</span>;
}
