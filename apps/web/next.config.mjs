import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/lib/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  transpilePackages: ['@jawal/db', '@jawal/shared', '@jawal/ui'],
};

export default withNextIntl(nextConfig);
