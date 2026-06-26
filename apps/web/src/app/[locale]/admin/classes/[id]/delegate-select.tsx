'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { setClassDelegateAction } from '../actions';

/** Sélecteur du délégué de classe (un élève inscrit), choisi à la constitution. */
export function DelegateSelect({
  classId,
  delegateId,
  students,
  disabled,
}: {
  classId: string;
  delegateId: string | null;
  students: { id: string; label: string }[];
  disabled?: boolean;
}) {
  const t = useTranslations('admin.classes.detail');
  const router = useRouter();
  const [pending, start] = useTransition();

  if (students.length === 0) {
    return <p className="text-xs text-slate-500">{t('delegateNoStudents')}</p>;
  }

  return (
    <select
      aria-label={t('delegate')}
      defaultValue={delegateId ?? ''}
      disabled={pending || disabled}
      onChange={(e) => {
        const value = e.target.value || null;
        start(async () => {
          const r = await setClassDelegateAction(classId, value);
          if (r.ok) router.refresh();
          // eslint-disable-next-line no-alert
          else alert(r.error);
        });
      }}
      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
    >
      <option value="">{t('delegateNone')}</option>
      {students.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
