import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { loadParentChildContext } from '@/lib/parent';

export default async function ParentChildLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string; childId: string }>;
}) {
  const { locale, childId } = await params;
  setRequestLocale(locale);
  const session = (await auth())!;
  const t = await getTranslations('parent.child');

  const ctx = await withTenant(session.user.tenantId, (tx) =>
    loadParentChildContext(tx, session.user.id, childId),
  );
  if (!ctx) notFound();

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex items-center gap-2.5 rounded-3xl bg-gradient-to-r from-[#e8edff] to-[#eef0ff] px-4 py-2.5">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/70 text-sm font-semibold text-[#1A56DB]">
          {(ctx.child.firstName[0] ?? '') + (ctx.child.lastName[0] ?? '')}
        </div>
        <div>
          <h1 className="text-base font-bold text-slate-900">
            {ctx.child.firstName} {ctx.child.lastName}
          </h1>
          <p className="mt-0.5 text-sm text-slate-600">
            {ctx.className
              ? `${ctx.cycleLabel ? `${ctx.cycleLabel} · ` : ''}${ctx.className}${
                  ctx.year ? ` · ${ctx.year.label}` : ''
                }`
              : t('noClass')}
          </p>
        </div>
      </header>
      {children}
    </div>
  );
}
