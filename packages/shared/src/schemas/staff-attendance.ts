import { z } from 'zod';

export const staffAttendanceStatusSchema = z.enum([
  'PRESENT',
  'ABSENT',
  'LATE',
  'EXCUSED',
  'LEAVE',
]);
export type StaffAttendanceStatusInput = z.infer<typeof staffAttendanceStatusSchema>;

const optionalString = (max = 500) =>
  z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().max(max).optional(),
    )
    .optional();

export const staffAttendanceRecordSchema = z.object({
  personId: z.string().uuid(),
  status: staffAttendanceStatusSchema,
  lateMinutes: z
    .preprocess(
      (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
      z.number().int().min(0).max(600).optional(),
    )
    .optional(),
  note: optionalString(500),
});
export type StaffAttendanceRecordInput = z.infer<typeof staffAttendanceRecordSchema>;

export const staffAttendanceBulkSaveSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date attendue ISO YYYY-MM-DD'),
  records: z.array(staffAttendanceRecordSchema).min(1).max(500),
});
export type StaffAttendanceBulkSave = z.infer<typeof staffAttendanceBulkSaveSchema>;
