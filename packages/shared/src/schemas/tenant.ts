import { z } from 'zod';

export const tenantProfileSchema = z.enum(['K12', 'SUPERIEUR', 'FORMATION_PRO', 'MIXED']);
export type TenantProfile = z.infer<typeof tenantProfileSchema>;

export const tenantCreateSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Lettres minuscules, chiffres et tirets uniquement'),
  name: z.string().min(2).max(200),
  profile: tenantProfileSchema.default('K12'),
  localeDefault: z.enum(['fr', 'ar', 'en']).default('fr'),
  currency: z.string().length(3).default('MAD'),
  timezone: z.string().default('Africa/Casablanca'),
  customDomain: z.string().optional(),
});

export type TenantCreate = z.infer<typeof tenantCreateSchema>;
