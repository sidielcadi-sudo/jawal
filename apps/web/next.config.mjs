import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/lib/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  transpilePackages: ['@jawal/db', '@jawal/shared', '@jawal/ui'],
  // Playwright (génération PDF des bulletins) ne doit pas être bundlé par
  // Next : il charge des binaires Chromium au runtime côté serveur.
  serverExternalPackages: ['playwright', 'playwright-core'],
};

export default withNextIntl(nextConfig);
