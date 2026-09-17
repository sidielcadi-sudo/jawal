/**
 * Un enseignant n'est affecté qu'aux classes des cycles déclarés dans sa fiche
 * (« Niveaux enseignés »).
 *
 * Un professeur de collège ne va pas au lycée, et inversement ; celui dont la
 * fiche ouvre les deux cycles peut aller dans les deux. Une fiche sans aucun
 * cycle ne contraint rien : on ne sait pas ce qu'elle voulait dire, et bloquer
 * paralyserait l'affectation d'un établissement qui n'a pas encore renseigné
 * ce champ.
 */
export function teacherCoversCycle(
  teacherCycleIds: ReadonlySet<string> | readonly string[],
  classCycleId: string | null | undefined,
): boolean {
  const cycles = teacherCycleIds instanceof Set ? teacherCycleIds : new Set(teacherCycleIds as readonly string[]);
  if (cycles.size === 0) return true;
  if (!classCycleId) return true;
  return cycles.has(classCycleId);
}
