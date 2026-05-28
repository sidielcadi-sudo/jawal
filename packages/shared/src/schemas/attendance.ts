import { z } from 'zod';

export const attendanceStatusSchema = z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']);
export type AttendanceStatusInput = z.infer<typeof attendanceStatusSchema>;

export const attendanceSessionCreateSchema = z.object({
  classId: z.string().uuid(),
  date: z.coerce.date(),
  periodLabel: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().min(1).max(60).optional(),
    )
    .optional(),
});
export type AttendanceSessionCreate = z.infer<typeof attendanceSessionCreateSchema>;

/**
 * Pour une ligne d'appel par élève. lateMinutes n'est utilisé que si
 * status=LATE ; sinon il est forcé à null à l'enregistrement.
 */
export const attendanceRecordSchema = z.object({
  studentId: z.string().uuid(),
  status: attendanceStatusSchema,
  lateMinutes: z
    .preprocess(
      (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
      z.number().int().min(0).max(600).optional(),
    )
    .optional(),
  note: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().max(500).optional(),
    )
    .optional(),
});
export type AttendanceRecordInput = z.infer<typeof attendanceRecordSchema>;

/**
 * Sauvegarde groupée de toute la session.
 */
export const attendanceBulkSaveSchema = z.object({
  sessionId: z.string().uuid(),
  records: z.array(attendanceRecordSchema).min(1).max(500),
  finalize: z.boolean().default(false),
});
export type AttendanceBulkSave = z.infer<typeof attendanceBulkSaveSchema>;
