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

declare module 'next-auth/jwt' {
  interface JWT {
    uid: string;
    tenantId: string;
    isSuperAdmin: boolean;
  }
}
