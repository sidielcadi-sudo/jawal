'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { enrollStudentAction } from '../actions';

export function EnrollmentManager({
  classId,
  students,
  disabled,
}: {
  classId: string;
  students: { id: string; label: string }[];
  disabled?: boolean;
}) {
  const t = useTranslations('admin.classes.detail');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [studentId, setStudentId] = useState('');

  function onSubmit() {
    if (!studentId) return;
    setError('');
    const formData = new FormData();
    formData.set('studentId', studentId);
    startTransition(async () => {
      const result = await enrollStudentAction(classId, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStudentId('');
      router.refresh();
    });
  }

  if (disabled) {
    return <p className="text-xs text-slate-500">{t('cannotEnroll')}</p>;
  }

  if (students.length === 0) {
    return <p className="text-xs text-slate-500">{t('noAvailable')}</p>;
  }

  return (
    <div className="space-y-2">
      <select
        value={studentId}
        onChange={(e) => setStudentId(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      >
        <option value="">{t('selectStudent')}</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onSubmit}
        disabled={isPending || !studentId}
        className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
      >
        {isPending ? t('enrolling') : t('enrollButton')}
      </button>
      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p>
      )}
    </div>
  );
}
