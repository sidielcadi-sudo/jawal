import { z } from 'zod';

export const justificationStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);
export type JustificationStatusInput = z.infer<typeof justificationStatusSchema>;

export const justificationCreateSchema = z.object({
  attendanceRecordId: z.string().uuid(),
  reason: z.string().min(3).max(2000),
  attachmentUrl: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().url().optional(),
    )
    .optional(),
});
export type JustificationCreate = z.infer<typeof justificationCreateSchema>;

export const justificationReviewSchema = z.object({
  justificationId: z.string().uuid(),
  decision: z.enum(['APPROVED', 'REJECTED']),
  reviewNote: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().max(500).optional(),
    )
    .optional(),
});
export type JustificationReview = z.infer<typeof justificationReviewSchema>;
