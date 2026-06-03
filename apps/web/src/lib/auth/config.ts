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
        const u = user as {
          id?: string;
          tenantId: string;
          isSuperAdmin: boolean;
          isParent: boolean;
          isTeacher: boolean;
        };
        token.uid = u.id!;
        token.tenantId = u.tenantId;
        token.isSuperAdmin = u.isSuperAdmin;
        token.isParent = u.isParent;
        token.isTeacher = u.isTeacher;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = String(token.uid);
        session.user.tenantId = String(token.tenantId);
        session.user.isSuperAdmin = Boolean(token.isSuperAdmin);
        session.user.isParent = Boolean(token.isParent);
        session.user.isTeacher = Boolean(token.isTeacher);
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = Boolean(auth?.user);
      // Routes nues (sans /[locale] prefix) — le middleware i18n redirige
      const path = nextUrl.pathname.replace(/^\/(fr|ar)/, '') || '/';
      const locale = nextUrl.pathname.match(/^\/(fr|ar)/)?.[1] ?? 'fr';
      const isProtected =
        path.startsWith('/admin') ||
        path.startsWith('/super-admin') ||
        path.startsWith('/parent') ||
        path.startsWith('/enseignant') ||
        path.startsWith('/dashboard');
      const isSuperAdminRoute = path.startsWith('/super-admin');
      const isAdminRoute = path.startsWith('/admin') || path.startsWith('/dashboard');
      const isParentRoute = path.startsWith('/parent');
      const isTeacherRoute = path.startsWith('/enseignant');
      const isLoginPage = path.startsWith('/login');

      /** Destination par défaut d'un utilisateur connecté selon son profil. */
      const home = (u: NonNullable<typeof auth>['user']) =>
        u.isSuperAdmin
          ? '/super-admin/tenants'
          : u.isParent
            ? '/parent'
            : u.isTeacher
              ? '/enseignant'
              : '/admin';

      if (isProtected && !isLoggedIn) return false;
      if (isSuperAdminRoute && !auth?.user.isSuperAdmin) return false;
      // Cloisonnement : chaque profil reste dans son espace.
      if (isAdminRoute && isLoggedIn && (auth!.user.isParent || auth!.user.isTeacher)) {
        return Response.redirect(new URL(`/${locale}${home(auth!.user)}`, nextUrl));
      }
      if (isParentRoute && isLoggedIn && !auth!.user.isParent && !auth!.user.isSuperAdmin) {
        return Response.redirect(new URL(`/${locale}${home(auth!.user)}`, nextUrl));
      }
      if (isTeacherRoute && isLoggedIn && !auth!.user.isTeacher && !auth!.user.isSuperAdmin) {
        return Response.redirect(new URL(`/${locale}${home(auth!.user)}`, nextUrl));
      }
      if (isLoginPage && isLoggedIn) {
        return Response.redirect(new URL(`/${locale}${home(auth!.user)}`, nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
