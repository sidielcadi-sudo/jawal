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

export const { auth, handlers, signIn, signOut, unstable_update } = NextAuth({
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
        const roleCodes = roles.map((r) => r.role.code);
        const isParent = !user.isSuperAdmin && roleCodes.includes('parent');
        const isTeacher =
          !user.isSuperAdmin && !isParent && roleCodes.includes('enseignant');
        const isStudent =
          !user.isSuperAdmin && !isParent && !isTeacher && roleCodes.includes('eleve');

        await prismaAdmin.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        // Sites accessibles (multi-établissements) : home + appartenances UserTenant.
        // Concerne surtout les comptes de groupe ; les autres ont sites = [home].
        const homeTenant = await prismaAdmin.tenant.findUnique({
          where: { id: user.tenantId },
          select: { name: true },
        });
        const memberships = user.isSuperAdmin
          ? []
          : await prismaAdmin.userTenant.findMany({
              where: { userId: user.id },
              include: { tenant: { select: { id: true, name: true } } },
            });
        const sitesMap = new Map<string, { tenantId: string; name: string }>();
        sitesMap.set(user.tenantId, { tenantId: user.tenantId, name: homeTenant?.name ?? '' });
        for (const m of memberships)
          sitesMap.set(m.tenant.id, { tenantId: m.tenant.id, name: m.tenant.name });

        return {
          id: user.id,
          email: user.email,
          tenantId: user.tenantId,
          homeTenantId: user.tenantId,
          sites: [...sitesMap.values()],
          isSuperAdmin: user.isSuperAdmin,
          isParent,
          isTeacher,
          isStudent,
        };
      },
    }),
  ],
});
