import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prismaAdmin } from '@jawal/db';
import { authConfig } from './config';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  // Form HTML envoie toujours une string ; on traite "" et "   " comme absent.
  tenantSlug: z
    .preprocess(
      (v) => (typeof v === 'string' ? v.trim() || undefined : v),
      z.string().min(1).optional(),
    )
    .optional(),
});

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
        tenantSlug: { label: 'Établissement', type: 'text' },
      },
      async authorize(rawCredentials) {
        const parsed = loginSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;
        const { email, password, tenantSlug } = parsed.data;

        // prismaAdmin pour traverser les tenants à l'authentification
        // (sinon le RLS bloque le lookup user — on n'a pas encore de contexte)
        let user = null;
        if (tenantSlug) {
          const tenant = await prismaAdmin.tenant.findUnique({
            where: { slug: tenantSlug },
          });
          if (!tenant || tenant.status !== 'ACTIVE') return null;
          user = await prismaAdmin.user.findFirst({
            where: { email, tenantId: tenant.id, disabledAt: null },
          });
        } else {
          // Pas de tenantSlug → on tente un compte super-admin
          user = await prismaAdmin.user.findFirst({
            where: { email, isSuperAdmin: true, disabledAt: null },
          });
        }

        if (!user?.passwordHash) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        // Profil portail : un compte porteur du rôle `parent` est routé vers
        // l'espace parent (cloisonné de l'admin). Déterministe — le rôle est
        // posé au provisioning du compte parent.
        const roles = await prismaAdmin.userRole.findMany({
          where: { userId: user.id },
          select: { role: { select: { code: true } } },
        });
        const isParent =
          !user.isSuperAdmin && roles.some((r) => r.role.code === 'parent');

        await prismaAdmin.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          tenantId: user.tenantId,
          isSuperAdmin: user.isSuperAdmin,
          isParent,
        };
      },
    }),
  ],
});
