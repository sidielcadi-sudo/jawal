import NextAuth from 'next-auth';
import createIntlMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { authConfig } from '@/lib/auth/config';
import { routing } from '@/lib/i18n/routing';

const { auth } = NextAuth(authConfig);
const intlMiddleware = createIntlMiddleware(routing);

export default auth((request: NextRequest) => {
  return intlMiddleware(request);
});

export const config = {
  matcher: [
    // Tout sauf les assets/api
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
