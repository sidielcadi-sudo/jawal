import { z } from 'zod';

export const homeworkTypeSchema = z.enum(['EXERCICE', 'LECTURE', 'REVISION', 'PROJET', 'AUTRE']);
export type HomeworkTypeValue = z.infer<typeof homeworkTypeSchema>;

export const homeworkDifficultySchema = z.enum(['FACILE', 'MOYEN', 'DIFFICILE']);
export type HomeworkDifficultyValue = z.infer<typeof homeworkDifficultySchema>;

/** Date au format ISO court (YYYY-MM-DD) — évite les décalages de fuseau. */
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (AAAA-MM-JJ).');

export const homeworkInputSchema = z.object({
  description: z.string().min(1, 'Description requise.').max(2000),
  dueDate: dateString.optional(),
  type: homeworkTypeSchema,
  difficulty: homeworkDifficultySchema.optional(),
});
export type HomeworkInput = z.infer<typeof homeworkInputSchema>;

/**
 * Saisie/maj d'un cahier de texte de séance. La séance est identifiée par
 * (entryId, date) — pas de cahier « hors séance ». Les devoirs sont inclus
 * et toujours rattachés à cette séance.
 */
export const lessonEntryUpsertSchema = z.object({
  entryId: z.string().uuid(),
  date: dateString,
  title: z.string().min(1, 'Titre requis.').max(300),
  summary: z.string().max(5000).optional(),
  activities: z.string().max(5000).optional(),
  competencies: z.string().max(2000).optional(),
  theme: z.string().max(500).optional(),
  visibleToStudents: z.boolean().default(true),
  visibleToParents: z.boolean().default(true),
  /// Visibilité programmée — ISO datetime-local (YYYY-MM-DDTHH:MM). Vide = immédiat.
  publishAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'Date/heure invalide.')
    .optional(),
  homeworks: z.array(homeworkInputSchema).max(20).default([]),
});
export type LessonEntryUpsert = z.infer<typeof lessonEntryUpsertSchema>;

/** Ajout d'un lien externe (ressource) à une séance. */
export const lessonLinkInputSchema = z.object({
  lessonEntryId: z.string().uuid(),
  url: z.string().url('Lien invalide.').max(2000),
  label: z.string().max(200).optional(),
});
export type LessonLinkInput = z.infer<typeof lessonLinkInputSchema>;
