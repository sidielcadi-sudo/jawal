import { setRequestLocale, getTranslations } from 'next-intl/server';
import { loadPreAuthBranding } from '@/lib/tenant-logo';
import { LoginForm } from './login-form';
import { SchoolIllustration } from './school-illustration';

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sp = await searchParams;
  const t = await getTranslations('login');
  const tApp = await getTranslations('app');

  const { name, logo } = await loadPreAuthBranding(locale);

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-50 px-4 py-8">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl shadow-2xl md:grid-cols-2">
        {/* ── Colonne gauche : accueil + formulaire ────────────────────── */}
        <div className="relative overflow-hidden bg-gradient-to-br from-brand-700 to-brand-900 p-8 text-white sm:p-10">
          {/* Vagues décoratives, en filigrane */}
          <svg
            className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full text-white/[0.07]"
            viewBox="0 0 400 160"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M0 60c60-30 120 30 200 10s140-40 200-10v100H0z" fill="currentColor" />
            <path d="M0 110c70-26 130 18 200 6s130-30 200-6v50H0z" fill="currentColor" />
          </svg>

          <div className="relative">
            <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
              {t('welcome', { app: tApp('name') })}
            </h1>
            <p className="mt-3 text-sm text-white/80">{t('subtitle')}</p>

            <div className="mt-8">
              <LoginForm error={sp.error} callbackUrl={sp.callbackUrl} locale={locale} />
            </div>
          </div>
        </div>

        {/* ── Colonne droite : identité visuelle ───────────────────────── */}
        <div className="flex flex-col items-center justify-between bg-white p-8 sm:p-10">
          {/* Logo de l'établissement, aligné à droite */}
          <div className="flex w-full items-center justify-end gap-3">
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={name ?? ''} className="h-11 w-auto object-contain" />
            )}
            {name && (
              <span className="max-w-[14rem] text-end text-sm font-bold leading-tight text-brand-800">
                {name}
              </span>
            )}
          </div>

          <SchoolIllustration className="my-8 w-full max-w-sm" />

          <div className="w-full text-center">
            <p className="text-3xl font-bold tracking-[0.12em] text-brand-800">
              {tApp('name').toUpperCase()}
            </p>
            <div className="mt-3 flex items-center justify-center gap-3">
              <span className="h-px w-10 bg-amber-400" />
              <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                {tApp('tagline')}
              </span>
              <span className="h-px w-10 bg-amber-400" />
            </div>

            {/* Signature éditeur, juste au-dessus du logo LeadSchool */}
            <p className="mt-8 text-xs font-medium text-slate-400">Edited by LeadTech</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/jawal-logo.png"
              alt={tApp('name')}
              className="mx-auto mt-2 h-10 w-auto object-contain"
            />
          </div>
        </div>
      </div>
    </main>
  );
}
