import type { NextAuthConfig } from 'next-auth';

/**
 * Configuration Auth.js partagée (edge-safe).
 * NE PAS importer Prisma / bcrypt ici — ce module est consommé par le
 * middleware, qui tourne en runtime Edge. Les providers complets sont
 * définis dans `./index.ts` (runtime Node uniquement).
 */
export const authConfig = {
  // L'URL publique vient des en-têtes transmis par le proxy. Ne PAS la figer
  // via AUTH_URL : next-auth remplacerait l'origine de la requête, et la
  // moindre différence avec l'en-tête Host transforme la réécriture de
  // next-intl en redirection vers une « autre » origine — que Next proxifie,
  // vers lui-même, en boucle.
  trustHost: true,
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 8, // 8h
  },
  providers: [], // overridé dans `./index.ts`
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        const u = user as {
          id?: string;
          tenantId: string;
          homeTenantId: string;
          sites: { tenantId: string; name: string }[];
          isSuperAdmin: boolean;
          isParent: boolean;
          isTeacher: boolean;
          isStudent: boolean;
        };
        token.uid = u.id!;
        token.tenantId = u.tenantId;
        token.homeTenantId = u.homeTenantId;
        token.sites = u.sites;
        token.isSuperAdmin = u.isSuperAdmin;
        token.isParent = u.isParent;
        token.isTeacher = u.isTeacher;
        token.isStudent = u.isStudent;
      }
      // Bascule de site (multi-établissements) : on n'autorise qu'un site dont
      // le compte est membre (token.sites = source de vérité).
      if (trigger === 'update') {
        const next = (session as { activeTenantId?: string } | undefined)?.activeTenantId;
        const sites = (token.sites ?? []) as { tenantId: string; name: string }[];
        if (next && sites.some((s) => s.tenantId === next)) {
          token.tenantId = next;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = String(token.uid);
        session.user.tenantId = String(token.tenantId);
        session.user.homeTenantId = String(token.homeTenantId ?? token.tenantId);
        session.user.sites = (token.sites ?? []) as { tenantId: string; name: string }[];
        session.user.isSuperAdmin = Boolean(token.isSuperAdmin);
        session.user.isParent = Boolean(token.isParent);
        session.user.isTeacher = Boolean(token.isTeacher);
        session.user.isStudent = Boolean(token.isStudent);
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
        path.startsWith('/eleve') ||
        path.startsWith('/dashboard');
      const isSuperAdminRoute = path.startsWith('/super-admin');
      const isAdminRoute = path.startsWith('/admin') || path.startsWith('/dashboard');
      const isParentRoute = path.startsWith('/parent');
      const isTeacherRoute = path.startsWith('/enseignant');
      const isStudentRoute = path.startsWith('/eleve');
      const isLoginPage = path.startsWith('/login');

      /** Destination par défaut d'un utilisateur connecté selon son profil. */
      const home = (u: NonNullable<typeof auth>['user']) =>
        u.isSuperAdmin
          ? '/super-admin/tenants'
          : u.isParent
            ? '/parent'
            : u.isTeacher
              ? '/enseignant'
              : u.isStudent
                ? '/eleve'
                : '/admin';

      if (isProtected && !isLoggedIn) return false;
      if (isSuperAdminRoute && !auth?.user.isSuperAdmin) return false;
      // Cloisonnement : chaque profil reste dans son espace.
      if (
        isAdminRoute &&
        isLoggedIn &&
        (auth!.user.isParent || auth!.user.isTeacher || auth!.user.isStudent)
      ) {
        return Response.redirect(new URL(`/${locale}${home(auth!.user)}`, nextUrl));
      }
      if (isParentRoute && isLoggedIn && !auth!.user.isParent && !auth!.user.isSuperAdmin) {
        return Response.redirect(new URL(`/${locale}${home(auth!.user)}`, nextUrl));
      }
      if (isTeacherRoute && isLoggedIn && !auth!.user.isTeacher && !auth!.user.isSuperAdmin) {
        return Response.redirect(new URL(`/${locale}${home(auth!.user)}`, nextUrl));
      }
      if (isStudentRoute && isLoggedIn && !auth!.user.isStudent && !auth!.user.isSuperAdmin) {
        return Response.redirect(new URL(`/${locale}${home(auth!.user)}`, nextUrl));
      }
      if (isLoginPage && isLoggedIn) {
        return Response.redirect(new URL(`/${locale}${home(auth!.user)}`, nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
