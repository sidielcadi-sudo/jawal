import { auth } from '@/lib/auth';
import { prismaAdmin } from '@/lib/db';
import {
  generateBrandScale,
  brandScaleCss,
  tenantPrimaryColor,
  tenantBandColor,
  tenantTableHeaderColor,
  extraColorsCss,
} from '@/lib/theme';

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
    const band = tenantBandColor(tenant?.settings);
    const tableHeader = tenantTableHeaderColor(tenant?.settings);
    // Palette « brand » + couleurs additionnelles (bande de titre / en-tête de
    // tableau). Chacune est optionnelle : on n'injecte que ce qui est configuré.
    const css = [
      primary ? brandScaleCss(generateBrandScale(primary)) : '',
      extraColorsCss(band, tableHeader),
    ]
      .filter(Boolean)
      .join('');
    if (!css) return null;
    return <style dangerouslySetInnerHTML={{ __html: css }} />;
  } catch {
    return null;
  }
}
