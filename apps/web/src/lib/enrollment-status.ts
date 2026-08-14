/**
 * Statuts d'un dossier d'inscription — union et pastilles de couleur.
 *
 * Le `Record` est **exhaustif sur l'enum Prisma** : ajouter une valeur à
 * `EnrollmentStatus` sans l'ajouter ici devient une erreur de compilation.
 * C'est ce qui manquait auparavant — la fiche élève restreignait le statut à
 * 4 valeurs par un `as`, si bien qu'un dossier « Dossier complet » plantait le
 * rendu sur une clé de traduction absente.
 */
import type { EnrollmentStatus } from '@jawal/db';

export type EnrollmentStatusValue = EnrollmentStatus;

/** Classes Tailwind de la pastille, par statut. */
export const ENROLLMENT_BADGE: Record<EnrollmentStatusValue, string> = {
  DRAFT: 'bg-amber-100 text-amber-700',
  DOCUMENTS_MANQUANTS: 'bg-orange-100 text-orange-700',
  DOSSIER_COMPLET: 'bg-sky-100 text-sky-700',
  ACCEPTE: 'bg-teal-100 text-teal-700',
  REFUSE: 'bg-red-100 text-red-700',
  INSCRIPTION_VALIDEE: 'bg-indigo-100 text-indigo-700',
  AFFECTE: 'bg-violet-100 text-violet-700',
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  WITHDRAWN: 'bg-slate-200 text-slate-600',
  GRADUATED: 'bg-blue-100 text-blue-700',
};
