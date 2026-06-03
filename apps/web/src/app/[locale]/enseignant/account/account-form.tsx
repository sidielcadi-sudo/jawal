'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { changeTeacherPasswordAction } from './actions';

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

export function PasswordForm() {
  const t = useTranslations('enseignant.account');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError('');
    setDone(false);
    startTransition(async () => {
      const r = await changeTeacherPasswordAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDone(true);
      form.reset();
    });
  }

  return (
    <form onSubmit={submit} className="max-w-sm space-y-3">
      <label className="block text-sm">
        <span className="text-xs font-medium text-slate-700">{t('current')}</span>
        <input type="password" name="currentPassword" required disabled={isPending} className={inputCls} />
      </label>
      <label className="block text-sm">
        <span className="text-xs font-medium text-slate-700">{t('new')}</span>
        <input type="password" name="newPassword" required minLength={8} disabled={isPending} className={inputCls} />
      </label>
      <label className="block text-sm">
        <span className="text-xs font-medium text-slate-700">{t('confirm')}</span>
        <input type="password" name="confirm" required disabled={isPending} className={inputCls} />
      </label>
      {error && <p className="text-xs text-red-700">{error}</p>}
      {done && <p className="text-xs text-emerald-700">{t('done')}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
      >
        {isPending ? t('saving') : t('save')}
      </button>
    </form>
  );
}
