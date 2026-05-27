'use server';

import { z } from 'zod';
import { prismaAdmin, TenantProfile, TenantStatus } from '@jawal/db';
import { auth } from '@/lib/auth';

const createTenantSchema = z.object({
  name: z.string().min(2).max(200),
  slug: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Lettres minuscules, chiffres et tirets uniquement'),
  profile: z.nativeEnum(TenantProfile),
});

const DEFAULT_MODULES = [
  'core',
  'admissions',
  'scolarite',
  'edt',
  'presences',
  'notes',
  'communication',
  'finance',
];

const DEFAULT_ROLES = [
  { code: 'tenant_admin', label: 'Administrateur établissement', permissions: ['*'] },
  { code: 'direction', label: 'Direction', permissions: ['*.read'] },
  { code: 'scolarite', label: 'Scolarité', permissions: ['students.*', 'classes.*'] },
  { code: 'enseignant', label: 'Enseignant', permissions: ['attendance.write', 'grades.write'] },
  { code: 'parent', label: 'Parent', permissions: ['self.read'] },
];

export async function createTenantAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.isSuperAdmin) {
    return { error: 'Non autorisé.' as const };
  }

  const parsed = createTenantSchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug'),
    profile: formData.get('profile'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }

  const { name, slug, profile } = parsed.data;

  // Unicité du slug (prismaAdmin contourne le RLS pour voir tous les tenants)
  const existing = await prismaAdmin.tenant.findUnique({ where: { slug } });
  if (existing) {
    return { error: `Le slug « ${slug} » est déjà utilisé.` };
  }

  const tenant = await prismaAdmin.tenant.create({
    data: {
      name,
      slug,
      profile,
      status: TenantStatus.TRIAL,
      localeDefault: 'fr',
      currency: 'MAD',
      timezone: 'Africa/Casablanca',
      modules: {
        create: DEFAULT_MODULES.map((code) => ({ code, enabled: true })),
      },
      roles: {
        create: DEFAULT_ROLES.map((r) => ({
          code: r.code,
          label: r.label,
          permissions: r.permissions,
          isSystem: true,
        })),
      },
    },
  });

  return { tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug } };
}
