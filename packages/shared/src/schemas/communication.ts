import { z } from 'zod';

export const announcementAudienceSchema = z.enum([
  'ALL',
  'PARENTS',
  'TEACHERS',
  'STAFF',
  'CLASS',
  'LEVEL',
]);
export type AnnouncementAudienceInput = z.infer<typeof announcementAudienceSchema>;

export const announcementCreateSchema = z
  .object({
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(10_000),
    audience: announcementAudienceSchema,
    classId: z
      .preprocess(
        (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
        z.string().uuid().optional(),
      )
      .optional(),
    levelId: z
      .preprocess(
        (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
        z.string().uuid().optional(),
      )
      .optional(),
    publish: z
      .preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean())
      .optional(),
  })
  .refine(
    (d) => d.audience !== 'CLASS' || !!d.classId,
    { message: 'classId requis quand audience=CLASS', path: ['classId'] },
  )
  .refine(
    (d) => d.audience !== 'LEVEL' || !!d.levelId,
    { message: 'levelId requis quand audience=LEVEL', path: ['levelId'] },
  );
export type AnnouncementCreate = z.infer<typeof announcementCreateSchema>;

export const conversationCreateSchema = z.object({
  subject: z.string().min(1).max(200),
  participantUserIds: z.array(z.string().uuid()).min(1).max(50),
  firstMessage: z.string().min(1).max(10_000),
});
export type ConversationCreate = z.infer<typeof conversationCreateSchema>;

export const messageSendSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().min(1).max(10_000),
});
export type MessageSend = z.infer<typeof messageSendSchema>;
