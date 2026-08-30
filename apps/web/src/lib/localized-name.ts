/**
 * Affichage bilingue FR / AR des libellés métier.
 *
 * L'état civil et la scolarité sont saisis dans les deux langues (colonnes
 * dédiées `*_ar` : `Person.firstNameAr`, `Level.labelAr`, `Class.nameAr`…).
 * Les listes doivent donc afficher la version arabe dès que l'interface est en
 * arabe — et retomber sur le français quand l'arabe n'a pas été renseigné,
 * plutôt que d'afficher une case vide.
 *
 * Fonctions pures, sans dépendance : utilisables côté serveur comme client.
 */

/** Libellé simple (niveau, classe, matière…) selon la langue de l'interface. */
export function localizedLabel(
  locale: string,
  label: string | null | undefined,
  labelAr: string | null | undefined,
): string {
  if (locale === 'ar') return labelAr?.trim() || label?.trim() || '';
  return label?.trim() || '';
}

/**
 * Les quatre champs sont obligatoires — y compris les colonnes arabes. C'est
 * volontaire : un `select` Prisma qui oublie `firstNameAr` échoue au typecheck
 * au lieu de retomber silencieusement sur le français à l'exécution.
 */
export type BilingualPerson = {
  firstName: string | null | undefined;
  lastName: string | null | undefined;
  firstNameAr: string | null | undefined;
  lastNameAr: string | null | undefined;
};

/**
 * Les mêmes champs, mais non nullables côté français — à intercaler dans un
 * type métier (`ContractAlert`, `ParentChild`…) sans en relâcher le contrat.
 */
export type BilingualNameFields = {
  firstName: string;
  lastName: string;
  firstNameAr: string | null;
  lastNameAr: string | null;
};

/**
 * Ordre d'affichage du nom. « NOM Prénom » est la convention par défaut des
 * listes ; certains écrans (fils d'Ariane, en-têtes de fiche) affichent
 * « Prénom NOM » — on le conserve tel quel plutôt que d'uniformiser.
 */
export type NameOrder = 'last-first' | 'first-last';

/**
 * Nom d'une personne dans la langue de l'interface.
 *
 * En arabe on n'accepte l'état civil arabe que s'il est complet (nom ET
 * prénom) : un mélange « النسب Prénom » se lit mal et trahirait une fiche à
 * moitié saisie. Sinon on retombe sur le français.
 */
export function personDisplayName(
  locale: string,
  p: BilingualPerson,
  order: NameOrder = 'last-first',
): string {
  const first = order === 'first-last';
  const fr = (first ? `${p.firstName ?? ''} ${p.lastName ?? ''}` : `${p.lastName ?? ''} ${p.firstName ?? ''}`).trim();
  if (locale !== 'ar') return fr;
  const lastAr = p.lastNameAr?.trim();
  const firstAr = p.firstNameAr?.trim();
  if (!lastAr || !firstAr) return fr;
  return first ? `${firstAr} ${lastAr}` : `${lastAr} ${firstAr}`;
}
