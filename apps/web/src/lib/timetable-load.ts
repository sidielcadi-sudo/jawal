/**
 * Charge horaire hebdomadaire d'une classe : combien d'heures de chaque
 * matière le solveur doit placer.
 *
 * Fonctions pures — l'appelant fournit ce qu'il a lu en base. Les tests
 * portent donc sur la règle, pas sur des requêtes.
 */

/** Une affectation pédagogique : qui enseigne quoi dans cette classe. */
export type AssignmentInput = {
  id: string;
  teacherId: string;
  subjectId: string;
  subjectLabel: string;
  /** Volume négocié avec l'enseignant. Prime sur le programme. */
  hoursPerWeek: number | null;
};

/** Volume déclaré par le programme, indexé par matière. */
export type HoursBySubject = Map<string, number | null>;

export type HoursSource = 'ASSIGNMENT' | 'TRACK' | 'CURRICULUM' | 'NONE';

export type ResolvedHours = {
  subjectId: string;
  subjectLabel: string;
  hours: number;
  source: HoursSource;
};

/**
 * Résout le volume horaire d'une matière, par cascade.
 *
 *   1. `TeacherAssignment.hoursPerWeek` — un volume saisi à la main sur
 *      l'affectation fait toujours autorité : c'est un arbitrage explicite.
 *   2. **La filière**, quand la classe en a une. Au lycée marocain, le
 *      programme est porté par la filière et non par le niveau : « Tronc
 *      commun » ne dit rien, TC Sciences fait 25 h et TC Lettres 21 h.
 *   3. Le programme du niveau — le cas du primaire et du collège.
 *   4. Rien : la matière n'est pas au programme, 0 h.
 *
 * L'ordre compte : interroger le niveau avant la filière écraserait la
 * distinction entre deux filières d'un même niveau.
 */
export function resolveWeeklyHours(
  assignment: AssignmentInput,
  trackHours: HoursBySubject | null,
  curriculumHours: HoursBySubject,
): ResolvedHours {
  const base = {
    subjectId: assignment.subjectId,
    subjectLabel: assignment.subjectLabel,
  };

  if (assignment.hoursPerWeek != null) {
    return { ...base, hours: norm(assignment.hoursPerWeek), source: 'ASSIGNMENT' };
  }

  const fromTrack = trackHours?.get(assignment.subjectId);
  if (fromTrack != null) return { ...base, hours: norm(fromTrack), source: 'TRACK' };

  const fromCurriculum = curriculumHours.get(assignment.subjectId);
  if (fromCurriculum != null) {
    return { ...base, hours: norm(fromCurriculum), source: 'CURRICULUM' };
  }

  return { ...base, hours: 0, source: 'NONE' };
}

const norm = (n: number) => Math.max(0, Math.round(n));

export type LoadReport = {
  rows: ResolvedHours[];
  /** Somme des heures à placer. */
  totalHours: number;
  /** Matières affectées à un prof mais sans volume déclaré nulle part. */
  missing: ResolvedHours[];
};

/**
 * Charge complète d'une classe, avec le compte-rendu de ce qui manque.
 *
 * `missing` distingue « 0 h volontaire » (le programme le déclare à zéro, comme
 * « Assiduité et conduite ») de « aucune source ne dit rien » : seule la seconde
 * est une lacune de paramétrage, et c'est celle qu'il faut remonter à l'agent.
 */
export function buildLoadReport(
  assignments: AssignmentInput[],
  trackHours: HoursBySubject | null,
  curriculumHours: HoursBySubject,
): LoadReport {
  const rows = assignments.map((a) => resolveWeeklyHours(a, trackHours, curriculumHours));
  return {
    rows,
    totalHours: rows.reduce((s, r) => s + r.hours, 0),
    missing: rows.filter((r) => r.source === 'NONE'),
  };
}

/**
 * Pourquoi une classe n'a-t-elle rien à placer ?
 *
 * Générer un emploi du temps vide sans rien dire est le pire résultat : l'agent
 * conclut que le solveur a échoué, alors que c'est le paramétrage qui est
 * incomplet. On nomme donc la cause exacte.
 */
export function explainEmptyLoad(opts: {
  hasTrack: boolean;
  isLycee: boolean;
  missingCount: number;
}): string {
  if (opts.isLycee && !opts.hasTrack) {
    return "Cette classe de lycée n'a pas de filière : le programme du lycée est porté par la filière, aucun volume horaire ne peut être déterminé. Renseignez-la sur la fiche de la classe.";
  }
  if (opts.missingCount > 0) {
    return "Aucun volume horaire n'est déclaré pour les matières de cette classe. Complétez Paramétrage → Cycles et niveaux → Programme par niveau.";
  }
  return 'Toutes les matières de cette classe sont déclarées à 0 h : il n’y a rien à placer.';
}
