import { getTranslations } from 'next-intl/server';

export default async function GraphesPage() {
  const t = await getTranslations('enseignant.notes');
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-10 text-center text-sm text-slate-500">
      {t('comingSoon')}
    </div>
  );
}
