'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { restorePersonAction, softDeletePersonAction } from '../actions';

export function PersonActions({
  personId,
  isArchived,
  locale,
}: {
  personId: string;
  isArchived: boolean;
  locale: string;
}) {
  const t = useTranslations('admin.persons.actions');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function archive() {
    if (!confirm(t('confirmDelete'))) return;
    startTransition(async () => {
      await softDeletePersonAction(personId);
    });
  }

  function restore() {
    startTransition(async () => {
      await restorePersonAction(personId);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={`/${locale}/admin/persons/${personId}/edit`}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
      >
        {t('edit')}
      </Link>
      {isArchived ? (
        <button
          type="button"
          onClick={restore}
          disabled={isPending}
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
        >
          {t('restore')}
        </button>
      ) : (
        <button
          type="button"
          onClick={archive}
          disabled={isPending}
          className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {t('archive')}
        </button>
      )}
    </div>
  );
}
