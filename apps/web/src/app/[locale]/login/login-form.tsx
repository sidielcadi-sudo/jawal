'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/routing';

type Props = {
  error?: string;
  callbackUrl?: string;
  locale: string;
};

/**
 * Champ de saisie sur fond clair, icône en tête — le libellé reste présent
 * pour les lecteurs d'écran, seul l'affichage passe en placeholder.
 */
function IconField({
  id,
  label,
  icon,
  children,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="flex items-center gap-3 rounded-xl bg-white/95 px-4 py-3 shadow-sm ring-1 ring-white/40 focus-within:ring-2 focus-within:ring-amber-400">
        <span className="shrink-0 text-brand-600" aria-hidden="true">
          {icon}
        </span>
        {children}
      </div>
    </div>
  );
}

const inputCls =
  'w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none';

export function LoginForm({ error: initialError, callbackUrl, locale }: Props) {
  const t = useTranslations('login');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(initialError ?? '');
  const [isSuperAdminMode, setSuperAdminMode] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const formData = new FormData(e.currentTarget);
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');
    const tenantSlug = isSuperAdminMode ? '' : String(formData.get('tenantSlug') ?? '');

    startTransition(async () => {
      const result = await signIn('credentials', {
        email,
        password,
        tenantSlug,
        redirect: false,
      });

      if (result?.error) {
        setError(t('errors.invalidCredentials'));
        return;
      }
      const defaultTarget = isSuperAdminMode ? '/super-admin/tenants' : '/admin';
      router.push(callbackUrl ?? `/${locale}${defaultTarget}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {!isSuperAdminMode && (
        <IconField id="tenantSlug" label={t('fields.tenantSlug')} icon={<BuildingIcon />}>
          <input
            id="tenantSlug"
            name="tenantSlug"
            type="text"
            required
            defaultValue="demo"
            placeholder={t('fields.tenantSlug')}
            className={inputCls}
          />
        </IconField>
      )}

      <IconField id="email" label={t('fields.email')} icon={<MailIcon />}>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder={t('fields.email')}
          className={inputCls}
        />
      </IconField>

      <IconField id="password" label={t('fields.password')} icon={<LockIcon />}>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder={t('fields.password')}
          className={inputCls}
        />
      </IconField>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-xl bg-amber-500 px-7 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-800 disabled:opacity-60"
        >
          {isPending ? t('actions.signingIn') : t('actions.signIn')}
        </button>

        {!isSuperAdminMode && (
          <Link
            href={`/${locale}/forgot-password`}
            className="text-sm text-white/85 underline-offset-4 hover:text-white hover:underline"
          >
            {t('forgotPassword')}
          </Link>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          setSuperAdminMode((v) => !v);
          setError('');
        }}
        className="pt-2 text-xs text-white/60 transition-colors hover:text-white/90"
      >
        {isSuperAdminMode ? t('toggleToTenant') : t('toggleToSuperAdmin')}
      </button>
    </form>
  );
}

/* ── Icônes (traits, 18px, héritent de la couleur du parent) ─────────── */

const iconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function BuildingIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 21h18M5 21V7l7-4 7 4v14" />
      <path d="M9 21v-5h6v5M9 10h.01M15 10h.01M9 13h.01M15 13h.01" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg {...iconProps}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m2 7 10 6 10-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
