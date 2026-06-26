import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { loadParentChildContext } from '@/lib/parent';
import { DocumentsPanel } from '@/components/documents-panel';

export default async function ParentChildDocumentsPage({
  params,
}: {
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
    <section className="rounded-2xl border border-slate-100 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('documentsTitle')}</h2>
      <DocumentsPanel
        hrefBase={`/api/parent/children/${childId}/document.pdf`}
        years={ctx.year ? [{ id: ctx.year.id, label: ctx.year.label }] : []}
        periods={ctx.periods}
      />
    </section>
  );
}
