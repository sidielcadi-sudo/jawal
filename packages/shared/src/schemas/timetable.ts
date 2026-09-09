import { z } from 'zod';

export const dayOfWeekSchema = z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
export type DayOfWeekInput = z.infer<typeof dayOfWeekSchema>;

const timeHHMM = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format attendu HH:MM (24h)');

const optionalString = (max = 200) =>
  z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().max(max).optional(),
    )
    .optional();

export const timetableSlotCreateSchema = z
  .object({
    startTime: timeHHMM,
    endTime: timeHHMM,
    label: optionalString(120),
    isBreak: z.preprocess((v) => v === 'on' || v === true || v === 'true', z.boolean()),
    order: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? 0 : Number(v)),
      z.number().int().min(0).max(999),
    ),
  })
  .refine((d) => d.startTime < d.endTime, {
    message: 'L\'heure de fin doit être après l\'heure de début.',
    path: ['endTime'],
  });
export type TimetableSlotCreate = z.infer<typeof timetableSlotCreateSchema>;

export const timetableSlotUpdateSchema = timetableSlotCreateSchema.innerType().extend({
  id: z.string().uuid(),
});
export type TimetableSlotUpdate = z.infer<typeof timetableSlotUpdateSchema>;

/**
 * Saisie d'une case d'EDT. subjectId/teacherId/roomId tous optionnels :
 * un brouillon peut n'avoir que la matière sans encore le prof affecté.
 */
export const timetableEntryUpsertSchema = z.object({
  academicYearId: z.string().uuid(),
  classId: z.string().uuid(),
  slotId: z.string().uuid(),
  dayOfWeek: dayOfWeekSchema,
  subjectId: z
    .preprocess((v) => (v === '' || v === null ? undefined : v), z.string().uuid().optional())
    .optional(),
  teacherId: z
    .preprocess((v) => (v === '' || v === null ? undefined : v), z.string().uuid().optional())
    .optional(),
  roomId: z
    .preprocess((v) => (v === '' || v === null ? undefined : v), z.string().uuid().optional())
    .optional(),
  /**
   * Groupe visé par la séance. Absent = la classe entière.
   *
   * Une même case peut porter plusieurs séances dès qu'elles visent des groupes
   * distincts : c'est le dédoublement (langues, TP). Mêler « classe entière »
   * et groupes sur une même case est refusé côté serveur.
   */
  groupId: z
    .preprocess((v) => (v === '' || v === null ? undefined : v), z.string().uuid().optional())
    .optional(),
  note: optionalString(300),
});
export type TimetableEntryUpsertInput = z.infer<typeof timetableEntryUpsertSchema>;
