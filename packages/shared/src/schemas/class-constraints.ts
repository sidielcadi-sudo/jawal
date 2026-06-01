import { z } from 'zod';

/**
 * Contraintes propres à une classe pour la génération d'EDT.
 * Stockées dans `Class.metadata.timetableConstraints` (Json).
 *
 * Toutes optionnelles : un champ null/absent ⇒ pas de contrainte côté classe,
 * on retombe sur les défauts globaux (settings établissement + cycle).
 */

const dayKeyEnum = z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
export type ClassDayKey = z.infer<typeof dayKeyEnum>;

export const classTimetableConstraintsSchema = z.object({
  /** Max heures de cours / jour pour cette classe (élèves). */
  maxHoursPerDay: z
    .preprocess(
      (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
      z.number().int().min(1).max(12).nullable(),
    )
    .nullable()
    .default(null),
  /** Min heures de cours / jour (force au moins N cours dans une journée
   *  où il y a au moins 1 cours — utile pour éviter "1 cours isolé"). */
  minHoursPerDay: z
    .preprocess(
      (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
      z.number().int().min(1).max(12).nullable(),
    )
    .nullable()
    .default(null),
  /** Jours OFF additionnels pour CETTE classe (en plus de ceux du cycle/tenant). */
  forbiddenDays: z.array(dayKeyEnum).default([]),
  /** (day, slot_id)[] additionnels interdits pour cette classe. */
  forbiddenSlots: z
    .array(
      z.object({
        day: dayKeyEnum,
        slotId: z.string().uuid(),
      }),
    )
    .default([]),
});
export type ClassTimetableConstraints = z.infer<
  typeof classTimetableConstraintsSchema
>;

export const CLASS_TIMETABLE_CONSTRAINTS_DEFAULTS: ClassTimetableConstraints = {
  maxHoursPerDay: null,
  minHoursPerDay: null,
  forbiddenDays: [],
  forbiddenSlots: [],
};

/** Lit les contraintes depuis Class.metadata, fallback defaults. */
export function readClassTimetableConstraints(
  metadata: unknown,
): ClassTimetableConstraints {
  if (!metadata || typeof metadata !== 'object')
    return CLASS_TIMETABLE_CONSTRAINTS_DEFAULTS;
  const tt = (metadata as Record<string, unknown>).timetableConstraints;
  if (!tt || typeof tt !== 'object') return CLASS_TIMETABLE_CONSTRAINTS_DEFAULTS;
  const parsed = classTimetableConstraintsSchema.safeParse(tt);
  if (!parsed.success) return CLASS_TIMETABLE_CONSTRAINTS_DEFAULTS;
  return parsed.data;
}

/** Helper : la classe a-t-elle au moins une contrainte personnalisée ? */
export function classHasTimetableConstraints(metadata: unknown): boolean {
  const c = readClassTimetableConstraints(metadata);
  return (
    c.maxHoursPerDay !== null ||
    c.minHoursPerDay !== null ||
    c.forbiddenDays.length > 0 ||
    c.forbiddenSlots.length > 0
  );
}
