import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n/routing';
import { loadPreAuthBranding } from '@/lib/tenant-logo';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('home');
  const { name, logo } = await loadPreAuthBranding(locale);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white bg-[url('/login-bg.png')] bg-cover bg-center bg-no-repeat px-4 py-8">
      <div className="w-full max-w-xl rounded-3xl bg-brand-600 bg-[url('/form-bg.png')] bg-cover bg-center p-10 text-center text-white shadow-2xl sm:p-12">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo ?? '/sesame-logo.png'}
          alt={name ?? 'Logo'}
          className="mx-auto mb-6 h-20 w-auto object-contain"
        />
        {name && <p className="mb-1 text-lg font-bold text-white">{name}</p>}
        <h1 className="text-3xl font-normal tracking-tight text-blue-950">{t('title')}</h1>

        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-brand-600 shadow transition-colors hover:bg-white/90"
          >
            {t('cta.login')}
          </Link>
        </div>

        <div className="mt-8 flex justify-center gap-3 text-xs">
          <Link href="/" locale="fr" className="font-semibold text-white/90 hover:text-white">
            Français
          </Link>
          <span className="text-white/40">·</span>
          <Link href="/" locale="ar" className="font-semibold text-white/90 hover:text-white">
            العربية
          </Link>
        </div>

        {/* Signature éditeur, juste au-dessus du logo LeadSchool */}
        <p className="mt-8 text-xs font-medium text-white/80">Edited by LeadTech</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/jawal-logo.png" alt="LeadSchool" className="mx-auto mt-2 h-24 w-auto object-contain" />
      </div>
    </main>
  );
}
