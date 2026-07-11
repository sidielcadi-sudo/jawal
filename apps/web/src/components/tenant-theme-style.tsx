import { auth } from '@/lib/auth';
import { prismaAdmin } from '@/lib/db';
import { generateBrandScale, brandScaleCss, tenantPrimaryColor } from '@/lib/theme';

/**
 * Injecte les variables CSS « brand » du thème de l'établissement (couleur
 * principale configurée dans Paramètres → Apparence). À rendre dans les layouts
 * de portail (déjà dynamiques) — surtout PAS dans le layout racine `[locale]`
 * qui est statique (`generateStaticParams`), sous peine d'un conflit de
 * génération statique. Best-effort : rend `null` si non configuré / erreur.
 */
export async function TenantThemeStyle() {
  try {
    const session = await auth();
    if (!session?.user) return null;
    const tenant = await prismaAdmin.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { settings: true },
    });
    const primary = tenantPrimaryColor(tenant?.settings);
    if (!primary) return null;
    return <style dangerouslySetInnerHTML={{ __html: brandScaleCss(generateBrandScale(primary)) }} />;
  } catch {
    return null;
  }
}
