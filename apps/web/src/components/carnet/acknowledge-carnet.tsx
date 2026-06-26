'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { acknowledgeCarnetEntryAction } from './parent-actions';

/** Case « J'en ai pris connaissance » pour une observation de carnet. */
export function AcknowledgeCarnet({ entryId }: { entryId: string }) {
  const t = useTranslations('parent.child.carnet');
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-brand-700">
      <input
        type="checkbox"
        disabled={pending}
        onChange={() =>
          start(async () => {
            const r = await acknowledgeCarnetEntryAction(entryId);
            if (r.ok) router.refresh();
          })
        }
        className="h-4 w-4 rounded border-slate-300"
      />
      {t('acknowledge')}
    </label>
  );
}
