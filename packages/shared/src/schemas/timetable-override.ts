import { z } from 'zod';

export const overrideKindSchema = z.enum(['CANCELLED', 'SUBSTITUTION']);
export type OverrideKindInput = z.infer<typeof overrideKindSchema>;

const optionalString = (max = 300) =>
  z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().max(max).optional(),
    )
    .optional();

const optUuid = z
  .preprocess((v) => (v === '' || v === null || v === undefined ? undefined : v), z.string().uuid().optional())
  .optional();

export const timetableOverrideCreateSchema = z.object({
  entryId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date attendue YYYY-MM-DD'),
  kind: overrideKindSchema,
  substituteTeacherId: optUuid,
  substituteRoomId: optUuid,
  substituteSubjectId: optUuid,
  reason: optionalString(300),
});
export type TimetableOverrideCreateInput = z.infer<typeof timetableOverrideCreateSchema>;
