import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface User {
    tenantId: string;
    isSuperAdmin: boolean;
  }

  interface Session {
    user: {
      id: string;
      tenantId: string;
      isSuperAdmin: boolean;
    } & DefaultSession['user'];
  }
}

// Auth.js v5 (beta) repose sur @auth/core — augmenter aussi cette source
// sinon l'inférence de type sur les callbacks jwt/session ne récupère pas
// les propriétés ajoutées au User.
declare module '@auth/core/types' {
  interface User {
    tenantId: string;
    isSuperAdmin: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid: string;
    tenantId: string;
    isSuperAdmin: boolean;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    uid: string;
    tenantId: string;
    isSuperAdmin: boolean;
  }
}
