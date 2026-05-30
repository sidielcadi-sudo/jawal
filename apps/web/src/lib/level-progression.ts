/**
 * Détermine le niveau « suivant » dans la progression scolaire.
 *
 * Stratégie : on regarde le `cycleId` + `order` du niveau source et on
 * propose le niveau immédiatement après dans le même cycle. Si on est sur
 * le dernier niveau du cycle, on propose le premier niveau du cycle suivant
 * (ordonné par `Cycle.order`). Sinon, null = fin de scolarité → GRADUATED.
 */

export type LevelLite = {
  id: string;
  cycleId: string;
  order: number;
  cycle: { id: string; order: number };
};

export function proposeNextLevel(
  currentLevelId: string,
  allLevels: LevelLite[],
): LevelLite | null {
  const current = allLevels.find((l) => l.id === currentLevelId);
  if (!current) return null;

  // Niveaux du même cycle, ordonnés
  const sameCycle = allLevels
    .filter((l) => l.cycleId === current.cycleId)
    .sort((a, b) => a.order - b.order);
  const idx = sameCycle.findIndex((l) => l.id === current.id);
  const nextInCycle = idx >= 0 && idx + 1 < sameCycle.length ? sameCycle[idx + 1] : null;
  if (nextInCycle) return nextInCycle;

  // Sinon : premier niveau du cycle suivant (par cycle.order)
  const cycles = Array.from(
    new Map(allLevels.map((l) => [l.cycle.id, l.cycle])).values(),
  ).sort((a, b) => a.order - b.order);
  const cycleIdx = cycles.findIndex((c) => c.id === current.cycleId);
  const nextCycle = cycleIdx >= 0 && cycleIdx + 1 < cycles.length ? cycles[cycleIdx + 1] : null;
  if (!nextCycle) return null;

  const firstNextCycle = allLevels
    .filter((l) => l.cycleId === nextCycle.id)
    .sort((a, b) => a.order - b.order)[0];
  return firstNextCycle ?? null;
}
