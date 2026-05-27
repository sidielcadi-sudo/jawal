import type { NextAuthConfig } from 'next-auth';

/**
 * Configuration Auth.js partagée (edge-safe).
 * NE PAS importer Prisma / bcrypt ici — ce module est consommé par le
 * middleware, qui tourne en runtime Edge. Les providers complets sont
 * définis dans `./index.ts` (runtime Node uniquement).
 */
export const authConfig = {
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 8, // 8h
  },
  providers: [], // overridé dans `./index.ts`
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id!;
        token.tenantId = user.tenantId;
        token.isSuperAdmin = user.isSuperAdmin;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.uid;
        session.user.tenantId = token.tenantId;
        session.user.isSuperAdmin = token.isSuperAdmin;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = Boolean(auth?.user);
      // Routes nues (sans /[locale] prefix) — le middleware i18n redirige
      const path = nextUrl.pathname.replace(/^\/(fr|ar)/, '') || '/';
      const isProtected =
        path.startsWith('/admin') ||
        path.startsWith('/super-admin') ||
        path.startsWith('/dashboard');
      const isSuperAdminRoute = path.startsWith('/super-admin');
      const isLoginPage = path.startsWith('/login');

      if (isProtected && !isLoggedIn) return false;
      if (isSuperAdminRoute && !auth?.user.isSuperAdmin) return false;
      if (isLoginPage && isLoggedIn) {
        const target = auth!.user.isSuperAdmin ? '/super-admin/tenants' : '/admin';
        const locale = nextUrl.pathname.match(/^\/(fr|ar)/)?.[1] ?? 'fr';
        return Response.redirect(new URL(`/${locale}${target}`, nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
