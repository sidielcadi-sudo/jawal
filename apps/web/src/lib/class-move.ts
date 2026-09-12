/**
 * Règles du changement de classe d'un élève déjà affecté.
 *
 * L'affectation initiale (`affectEnrollmentAction`) n'accepte que les dossiers
 * au statut `INSCRIPTION_VALIDEE` et force le statut à `AFFECTE`. Rejouer cette
 * action pour déplacer un élève **déjà actif** le ferait régresser d'une étape
 * du parcours d'inscription — d'où des règles propres, ici, et une action
 * distincte qui conserve le statut.
 */

export type MoveEnrollment = {
  status: string;
  academicYearId: string;
  levelId: string;
  trackId: string | null;
  classId: string | null;
};

export type MoveTarget = {
  id: string;
  academicYearId: string;
  levelId: string;
  trackId: string | null;
  capacity: number;
  /** Effectif actif de la classe visée, l'élève déplacé non compris. */
  enrolled: number;
};

export type MoveRefusal =
  | 'NOT_ASSIGNED_YET'
  | 'SAME_CLASS'
  | 'OTHER_YEAR'
  | 'OTHER_LEVEL'
  | 'OTHER_TRACK'
  | 'FULL';

/** Statuts pour lesquels un déplacement a un sens. */
const MOVABLE = new Set(['AFFECTE', 'ACTIVE']);

/**
 * Le déplacement est-il permis ?
 *
 * Les garde-fous sont ceux de l'affectation initiale, pour une raison simple :
 * un élève de 2AC ne devient pas élève de 3AC parce qu'on l'a glissé dans la
 * mauvaise classe, et au lycée la filière porte les coefficients — l'y changer
 * par mégarde fausserait toutes ses moyennes.
 */
export function checkMove(
  enrollment: MoveEnrollment,
  target: MoveTarget,
): { ok: true } | { ok: false; reason: MoveRefusal } {
  if (!MOVABLE.has(enrollment.status)) return { ok: false, reason: 'NOT_ASSIGNED_YET' };
  if (enrollment.classId === target.id) return { ok: false, reason: 'SAME_CLASS' };
  if (target.academicYearId !== enrollment.academicYearId) {
    return { ok: false, reason: 'OTHER_YEAR' };
  }
  if (target.levelId !== enrollment.levelId) return { ok: false, reason: 'OTHER_LEVEL' };
  // La filière du dossier fait autorité. Une classe sans filière (collège,
  // primaire) n'oppose rien : la contrainte ne joue qu'entre deux filières.
  if (enrollment.trackId && target.trackId && target.trackId !== enrollment.trackId) {
    return { ok: false, reason: 'OTHER_TRACK' };
  }
  if (target.enrolled >= target.capacity) return { ok: false, reason: 'FULL' };
  return { ok: true };
}

/** Message d'erreur destiné à l'écran. */
export function moveRefusalMessage(reason: MoveRefusal, capacity?: number): string {
  switch (reason) {
    case 'NOT_ASSIGNED_YET':
      return "Le dossier n'est pas encore affecté à une classe : utilisez « Affecter ».";
    case 'SAME_CLASS':
      return "L'élève est déjà dans cette classe.";
    case 'OTHER_YEAR':
      return "La classe n'appartient pas à l'année scolaire du dossier.";
    case 'OTHER_LEVEL':
      return "La classe n'est pas au niveau du dossier — changer de niveau se fait par la réinscription.";
    case 'OTHER_TRACK':
      return "La classe n'est pas de la filière du dossier : les coefficients ne correspondraient pas.";
    case 'FULL':
      return capacity === undefined ? 'Classe pleine.' : `Classe pleine (capacité ${capacity}).`;
  }
}
