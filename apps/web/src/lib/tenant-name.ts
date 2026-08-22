/**
 * Nom d'établissement à afficher selon la langue de l'interface.
 *
 * En arabe on privilégie `Tenant.nameAr` (saisi dans Paramétrage →
 * Établissement) ; s'il n'est pas renseigné, on retombe sur le nom français
 * plutôt que d'afficher un vide. Dans toute autre langue, le nom français.
 *
 * Fonction pure et sans dépendance : utilisable côté serveur comme client
 * (en-têtes de portail, page de connexion, sélecteur multi-sites).
 */
export function tenantDisplayName(
  locale: string,
  name: string | null | undefined,
  nameAr?: string | null,
): string {
  if (locale === 'ar') return (nameAr?.trim() || name?.trim() || '') as string;
  return (name?.trim() || '') as string;
}
