import { headers } from 'next/headers';
import { prisma } from './db';

export type TenantContext = {
  id: string;
  slug: string;
  name: string;
  profile: 'k12' | 'superieur' | 'formation_pro';
  localeDefault: string;
};

/**
 * Résout le tenant courant à partir du sous-domaine de la requête.
 * Exemples : `monecole.jawal.app` → slug = "monecole"
 *            `ecole.exemple.ma` → custom_domain match
 */
export async function getCurrentTenant(): Promise<TenantContext | null> {
  const host = (await headers()).get('host');
  if (!host) return null;

  const rootDomain = process.env.ROOT_DOMAIN ?? 'jawal.local';
  const cleanHost = host.split(':')[0]!;

  let tenant = null;
  if (cleanHost.endsWith(`.${rootDomain}`)) {
    const slug = cleanHost.replace(`.${rootDomain}`, '');
    tenant = await prisma.tenant.findUnique({ where: { slug } });
  } else if (cleanHost !== rootDomain) {
    tenant = await prisma.tenant.findUnique({ where: { customDomain: cleanHost } });
  }

  if (!tenant || tenant.status !== 'ACTIVE') return null;

  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    profile: tenant.profile as TenantContext['profile'],
    localeDefault: tenant.localeDefault,
  };
}
