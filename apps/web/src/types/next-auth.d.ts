import type { DefaultSession } from 'next-auth';

type Site = { tenantId: string; name: string };

declare module 'next-auth' {
  interface User {
    tenantId: string;
    /** Tenant « home » du compte (ne change pas au switch de site). */
    homeTenantId: string;
    /** Sites accessibles (home + appartenances UserTenant). */
    sites: Site[];
    isSuperAdmin: boolean;
    /** Compte rattaché au portail parent (rôle `parent`). */
    isParent: boolean;
    /** Compte rattaché au portail enseignant (rôle `enseignant`). */
    isTeacher: boolean;
    isStudent: boolean;
  }

  interface Session {
    user: {
      id: string;
      /** Site actif (peut changer via le sélecteur de site multi-établissements). */
      tenantId: string;
      homeTenantId: string;
      sites: Site[];
      isSuperAdmin: boolean;
      isParent: boolean;
      isTeacher: boolean;
      isStudent: boolean;
    } & DefaultSession['user'];
  }
}

// Auth.js v5 (beta) repose sur @auth/core — augmenter aussi cette source
// sinon l'inférence de type sur les callbacks jwt/session ne récupère pas
// les propriétés ajoutées au User.
declare module '@auth/core/types' {
  interface User {
    tenantId: string;
    homeTenantId: string;
    sites: Site[];
    isSuperAdmin: boolean;
    isParent: boolean;
    isTeacher: boolean;
    isStudent: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid: string;
    tenantId: string;
    homeTenantId: string;
    sites: Site[];
    isSuperAdmin: boolean;
    isParent: boolean;
    isTeacher: boolean;
    isStudent: boolean;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    uid: string;
    tenantId: string;
    homeTenantId: string;
    sites: Site[];
    isSuperAdmin: boolean;
    isParent: boolean;
    isTeacher: boolean;
    isStudent: boolean;
  }
}
