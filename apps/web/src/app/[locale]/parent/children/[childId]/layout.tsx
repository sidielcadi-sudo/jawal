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

  // Radiation approuvée → documents remis à la famille (attestation, certificat, relevé).
  const radiation = await withTenant(session.user.tenantId, (tx) =>
    tx.radiationRequest.findFirst({
      where: { studentId: childId, status: 'APPROVED' },
      orderBy: { approvedAt: 'desc' },
      select: { noteRequested: true, enrollment: { select: { academicYearId: true } } },
    }),
  );
  const docBase = `/api/parent/children/${childId}`;
  const docYear = radiation?.enrollment.academicYearId ?? ctx.year?.id;

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex items-center gap-2.5 rounded-3xl bg-gradient-to-r from-brand-100 to-brand-50 px-4 py-2.5">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/70 text-sm font-semibold text-brand-600">
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

      {radiation && (
        <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('radiationDocs.title')}</h2>
          <div className="flex flex-wrap gap-2">
            <a href={`${docBase}/document.pdf?type=CERTIFICAT_SCOLARITE${docYear ? `&year=${docYear}` : ''}`} target="_blank" rel="noreferrer" className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
              {t('radiationDocs.scolarite')}
            </a>
            <a href={`${docBase}/radiation-certificate.pdf`} target="_blank" rel="noreferrer" className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
              {t('radiationDocs.certificate')}
            </a>
            {radiation.noteRequested && (
              <a href={`${docBase}/bulletin.pdf${docYear ? `?year=${docYear}` : ''}`} target="_blank" rel="noreferrer" className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
                {t('radiationDocs.bulletin')}
              </a>
            )}
          </div>
        </section>
      )}

      {children}
    </div>
  );
}
