import { z } from 'zod';

export const timetableConstraintKindSchema = z.enum([
  'MAX_SAME_SUBJECT_PER_DAY',
  'NO_GAPS',
  'REQUIRES_CONSECUTIVE_SUBJECTS',
  'MAX_HOURS_PER_DAY_TEACHER',
  'MAX_CONSECUTIVE_HOURS_TEACHER',
  'TEACHER_LUNCH_BREAK',
  'REQUIRE_SUBJECT_ROOM_TYPE',
]);
export type TimetableConstraintKindInput = z.infer<
  typeof timetableConstraintKindSchema
>;

/**
 * Schémas de config par type de contrainte. On les valide côté serveur
 * avant chaque appel solveur.
 */
export const maxSameSubjectPerDayConfigSchema = z.object({
  max: z.coerce.number().int().min(1).max(10),
});

export const noGapsConfigSchema = z.object({
  weight: z.coerce.number().int().min(1).max(100),
});

export const requiresConsecutiveSubjectsConfigSchema = z.object({
  subjectIds: z.array(z.string().uuid()).default([]),
});

export const maxHoursPerDayTeacherConfigSchema = z.object({
  max: z.coerce.number().int().min(1).max(12),
});

const timeHHMM = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format HH:MM 24h attendu');

export const maxConsecutiveHoursTeacherConfigSchema = z.object({
  max: z.coerce.number().int().min(1).max(8),
});

export const teacherLunchBreakConfigSchema = z
  .object({
    from: timeHHMM.default('12:00'),
    to: timeHHMM.default('14:00'),
  })
  .refine((c) => c.from < c.to, { message: 'L’heure de fin doit suivre l’heure de début.' });

/** Contrainte sans paramètre : simple bascule on/off. */
export const requireSubjectRoomTypeConfigSchema = z.object({}).default({});

/** Valeurs par défaut suggérées dans l'UI quand on active la contrainte. */
export const TIMETABLE_CONSTRAINT_DEFAULTS = {
  MAX_SAME_SUBJECT_PER_DAY: { max: 2 },
  NO_GAPS: { weight: 5 },
  REQUIRES_CONSECUTIVE_SUBJECTS: { subjectIds: [] as string[] },
  MAX_HOURS_PER_DAY_TEACHER: { max: 6 },
  MAX_CONSECUTIVE_HOURS_TEACHER: { max: 3 },
  TEACHER_LUNCH_BREAK: { from: '12:00', to: '14:00' },
  REQUIRE_SUBJECT_ROOM_TYPE: {},
} as const;

/** Schéma d'écriture (UI → action). */
export const timetableConstraintUpsertSchema = z.object({
  kind: timetableConstraintKindSchema,
  enabled: z.preprocess(
    (v) => v === 'on' || v === true || v === 'true',
    z.boolean(),
  ),
  config: z.record(z.string(), z.unknown()).default({}),
});
export type TimetableConstraintUpsertInput = z.infer<
  typeof timetableConstraintUpsertSchema
>;
