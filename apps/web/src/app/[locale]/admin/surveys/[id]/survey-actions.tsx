'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { openSurveyAction, closeSurveyAction, deleteSurveyAction } from '../actions';

export function SurveyStatusActions({
  id,
  status,
  locale,
}: {
  id: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
  locale: string;
}) {
  const t = useTranslations('admin.surveys');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const btn = 'rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50';

  function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    confirmMsg?: string,
    redirect?: boolean,
  ) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        alert(r.error ?? 'Erreur');
        return;
      }
      if (redirect) router.push(`/${locale}/admin/surveys`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'DRAFT' && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => openSurveyAction(id))}
          className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}
        >
          {t('actions.open')}
        </button>
      )}
      {status === 'OPEN' && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => closeSurveyAction(id))}
          className={`${btn} bg-amber-600 text-white hover:bg-amber-700`}
        >
          {t('actions.close')}
        </button>
      )}
      <button
        type="button"
        disabled={isPending}
        onClick={() => run(() => deleteSurveyAction(id), t('confirmDelete'), true)}
        className={`${btn} border border-red-200 bg-red-50 text-red-700 hover:bg-red-100`}
      >
        {t('actions.delete')}
      </button>
    </div>
  );
}
