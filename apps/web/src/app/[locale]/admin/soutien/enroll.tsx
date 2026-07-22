'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { enrollSupportStudentAction, unenrollSupportStudentAction } from './actions';

type Student = { id: string; label: string };

export function EnrollStudent({ courseId, students }: { courseId: string; students: Student[] }) {
  const t = useTranslations('admin.soutien');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [studentId, setStudentId] = useState('');
  const [recommended, setRecommended] = useState(false);
  const [err, setErr] = useState('');

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="block text-sm">
        <span className="text-xs text-slate-500">{t('enroll.student')}</span>
        <select
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className="mt-1 w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
        >
          <option value="">{t('form.choose')}</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" checked={recommended} onChange={(e) => setRecommended(e.target.checked)} className="h-4 w-4" />
        {t('enroll.recommended')}
      </label>
      <button
        type="button"
        disabled={pending || !studentId}
        onClick={() =>
          start(async () => {
            setErr('');
            const r = await enrollSupportStudentAction(courseId, studentId, recommended);
            if (!r.ok) setErr(r.error);
            else {
              setStudentId('');
              setRecommended(false);
              router.refresh();
            }
          })
        }
        className="mb-0.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {t('enroll.add')}
      </button>
      {err && <span className="pb-2 text-xs text-red-700">{err}</span>}
    </div>
  );
}

export function UnenrollButton({ courseId, studentId }: { courseId: string; studentId: string }) {
  const t = useTranslations('admin.soutien');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(t('enroll.removeConfirm'))) return;
        start(async () => {
          await unenrollSupportStudentAction(courseId, studentId);
          router.refresh();
        });
      }}
      className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50"
    >
      {t('enroll.remove')}
    </button>
  );
}
