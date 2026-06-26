import 'server-only';
import { prismaAdmin } from '@/lib/db';
import { getObjectBuffer } from '@/lib/storage';
import { getCurrentTenant } from '@/lib/tenant';

/**
 * Logo de l'établissement encodé en data URI base64 — pour inlining dans les
 * documents PDF (rendu Playwright) et la page de connexion (pré-auth).
 * Retourne null si l'établissement n'a pas de logo. Tolérant aux pannes MinIO
 * (retourne null plutôt que d'échouer le rendu du document).
 */
export async function getTenantLogoDataUri(tenantId: string): Promise<string | null> {
  try {
    const tenant = await prismaAdmin.tenant.findUnique({
      where: { id: tenantId },
      select: { logoFileId: true },
    });
    if (!tenant?.logoFileId) return null;

    const file = await prismaAdmin.fileObject.findUnique({
      where: { id: tenant.logoFileId },
      select: { s3Key: true, mime: true },
    });
    if (!file) return null;

    const buffer = await getObjectBuffer(file.s3Key);
    return `data:${file.mime};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * Branding (nom + logo) pour les pages pré-auth (login, accueil). Résout le
 * tenant par sous-domaine ; à défaut (ex. localhost), prend le premier
 * établissement disposant d'un logo, puis le premier tout court.
 */
export async function loadPreAuthBranding(): Promise<{ name: string | null; logo: string | null }> {
  const ctx = await getCurrentTenant();
  let id = ctx?.id ?? null;
  let name = ctx?.name ?? null;
  if (!id) {
    const first =
      (await prismaAdmin.tenant.findFirst({
        where: { logoFileId: { not: null } },
        select: { id: true, name: true },
      })) ??
      (await prismaAdmin.tenant.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true },
      }));
    id = first?.id ?? null;
    name = first?.name ?? null;
  }
  const logo = id ? await getTenantLogoDataUri(id) : null;
  return { name, logo };
}
