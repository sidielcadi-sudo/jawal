'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { disableUserAction, enableUserAction, inviteUserAction } from './actions';

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

type Credentials = { email: string; tempPassword: string };

export function InviteUserForm({ roles }: { roles: { code: string; label: string }[] }) {
  const t = useTranslations('admin.settings.users.form');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const ref = useRef<HTMLFormElement>(null);

  function onSubmit(formData: FormData) {
    setError('');
    setCredentials(null);
    startTransition(async () => {
      const r = await inviteUserAction(formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setCredentials(r.data!);
      ref.current?.reset();
      router.refresh();
    });
  }

  return (
    <>
      {credentials && (
        <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm">
          <p className="font-medium text-emerald-900">{t('createdTitle')}</p>
          <p className="mt-1 text-xs text-emerald-800">{t('createdHint')}</p>
          <div className="mt-2 space-y-1 font-mono text-xs text-emerald-900">
            <div>
              <span className="text-emerald-700">email :</span> {credentials.email}
            </div>
            <div>
              <span className="text-emerald-700">mot de passe :</span>{' '}
              <span className="rounded bg-emerald-100 px-1.5 py-0.5">
                {credentials.tempPassword}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(
                `Email : ${credentials.email}\nMot de passe : ${credentials.tempPassword}`,
              );
            }}
            className="mt-2 text-xs text-emerald-700 underline hover:text-emerald-900"
          >
            {t('copy')}
          </button>
        </div>
      )}

      <form ref={ref} action={onSubmit} className="space-y-3">
        <label className="block">
          <span className="block text-xs font-medium text-slate-700">{t('email')}</span>
          <input type="email" name="email" required placeholder="prof@exemple.ma" className={inputCls} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-slate-700">{t('lastName')}</span>
            <input type="text" name="lastName" required className={inputCls} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-700">{t('firstName')}</span>
            <input type="text" name="firstName" required className={inputCls} />
          </label>
        </div>
        <label className="block">
          <span className="block text-xs font-medium text-slate-700">{t('personType')}</span>
          <select name="personType" required defaultValue="TEACHER" className={inputCls}>
            <option value="TEACHER">{t('personTypes.TEACHER')}</option>
            <option value="STAFF">{t('personTypes.STAFF')}</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-700">{t('role')}</span>
          <select name="roleCode" required defaultValue="" className={inputCls}>
            <option value="" disabled>
              —
            </option>
            {roles.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-brand-700 disabled:opacity-50"
        >
          {isPending ? t('creating') : t('create')}
        </button>
      </form>
    </>
  );
}

export function UserActions({
  userId,
  disabled,
  labels,
}: {
  userId: string;
  disabled: boolean;
  labels: { disable: string; enable: string; confirm: string };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function toggle() {
    if (!disabled && !confirm(labels.confirm)) return;
    startTransition(async () => {
      if (disabled) await enableUserAction(userId);
      else await disableUserAction(userId);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      className={[
        'rounded-lg border px-2 py-0.5 text-xs',
        disabled
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          : 'border-red-300 bg-white text-red-700 hover:bg-red-50',
      ].join(' ')}
    >
      {disabled ? labels.enable : labels.disable}
    </button>
  );
}
