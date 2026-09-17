/**
 * Cases où une classe n'a pas cours.
 *
 * L'établissement ferme des cases à plusieurs niveaux — le cycle décide que le
 * mercredi s'arrête à midi, la classe ajoute ses propres interdits — et le
 * générateur d'emploi du temps en tient compte depuis toujours. Ce qui manquait,
 * c'est que les ÉCRANS de saisie le sachent aussi.
 *
 * Sans cela, on peut déclarer une séance dédoublée le mercredi à 14 h dans une
 * classe qui ne travaille pas l'après-midi. FET reçoit alors une activité
 * verrouillée sur une case fermée, y voit une donnée contradictoire et rejette
 * le fichier ENTIER : « Cannot precompute - data is wrong », sans nommer ni la
 * classe ni la case. Une déclaration de trop, et plus aucun emploi du temps de
 * l'établissement ne se génère.
 *
 * Le calcul est repris ici à l'identique de l'orchestrateur, pour que la grille
 * de saisie, la validation du serveur et le pré-diagnostic parlent de la même
 * chose.
 */
import {
  isSlotAllowedOnDay,
  readEffectiveTimetableSettings,
  readClassTimetableConstraints,
  type DayKey,
} from '@jawal/shared';

export type ClosedCellsInput = {
  /** `Cycle.settings` — il peut redéfinir les journées du cycle. */
  cycleSettings: unknown;
  /** `Tenant.settings` — le défaut de l'établissement. */
  tenantSettings: unknown;
  /** `Class.metadata` — jours et cases fermés propres à la classe. */
  classMetadata: unknown;
  slots: Array<{ id: string; startTime: string; endTime: string; isBreak?: boolean }>;
  days: readonly string[];
};

/** Clé d'une case : `jour|créneau`. */
export const cellKey = (day: string, slotId: string) => `${day}|${slotId}`;

/**
 * Cases fermées pour cette classe, sous forme de clés `jour|créneau`.
 *
 * Les pauses ne sont pas listées : elles ne figurent dans aucune grille de
 * saisie, et les faire apparaître ici les rendrait « fermées » là où elles
 * n'existent simplement pas.
 */
export function classClosedCells(input: ClosedCellsInput): Set<string> {
  const settings = readEffectiveTimetableSettings(input.cycleSettings, input.tenantSettings);
  const cons = readClassTimetableConstraints(input.classMetadata);
  const offDays = new Set<string>(cons.forbiddenDays);
  const offCells = new Set(cons.forbiddenSlots.map((f) => cellKey(f.day, f.slotId)));

  const closed = new Set<string>();
  for (const d of input.days) {
    for (const s of input.slots) {
      if (s.isBreak) continue;
      const allowed = isSlotAllowedOnDay(d as DayKey, s.startTime, s.endTime, settings);
      if (!allowed || offDays.has(d) || offCells.has(cellKey(d, s.id))) {
        closed.add(cellKey(d, s.id));
      }
    }
  }
  return closed;
}
