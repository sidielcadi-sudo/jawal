'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createTeacherAccessAction } from './teacher-actions';

export function TeacherAccess({
  personId,
  defaultEmail,
  existingEmail,
}: {
  personId: string;
  defaultEmail: string;
  existingEmail: string | null;
}) {
  const t = useTranslations('admin.persons.teacherAccess');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState(defaultEmail);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null);

  if (existingEmail || created) {
    const active = created?.email ?? existingEmail!;
    return (
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase text-emerald-700">
            {t('active')}
          </span>
          <span className="font-medium text-slate-800">{active}</span>
        </div>
        {created && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-800">{t('tempPasswordHint')}</p>
            <p className="mt-1 font-mono text-sm font-semibold text-amber-900">{created.tempPassword}</p>
          </div>
        )}
      </div>
    );
  }

  function submit() {
    setError('');
    const fd = new FormData();
    fd.set('personId', personId);
    fd.set('email', email);
    startTransition(async () => {
      const r = await createTeacherAccessAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setCreated(r.data);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">{t('description')}</p>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t('emailPlaceholder')}
        disabled={isPending}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      {error && <p className="text-xs text-red-700">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={isPending}
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
      >
        {isPending ? t('creating') : t('create')}
      </button>
    </div>
  );
}
