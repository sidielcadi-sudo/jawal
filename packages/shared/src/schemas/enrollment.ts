import { z } from 'zod';

export const enrollmentStatusSchema = z.enum([
  'DRAFT',
  'ACTIVE',
  'WITHDRAWN',
  'GRADUATED',
]);
export type EnrollmentStatusInput = z.infer<typeof enrollmentStatusSchema>;

const optionalString = (max = 500) =>
  z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().max(max).optional(),
    )
    .optional();

const optionalPct = z
  .preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z.number().min(0).max(100).optional(),
  )
  .optional();

/**
 * Schema de création d'un dossier d'inscription en mode DRAFT.
 * La validation (vers ACTIVE) se fait via une action dédiée qui ajoute
 * la classe + déclenche la génération de l'échéancier.
 */
export const enrollmentCreateSchema = z.object({
  studentId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  levelId: z.string().uuid(),
  notes: optionalString(1000),
});
export type EnrollmentCreateInput = z.infer<typeof enrollmentCreateSchema>;

/**
 * Schema de validation : on doit fournir la classe et éventuellement
 * écraser le pourcentage de réduction calculé.
 */
export const enrollmentValidateSchema = z.object({
  enrollmentId: z.string().uuid(),
  classId: z.string().uuid(),
  discountPctOverride: optionalPct,
  discountReason: optionalString(500),
});
export type EnrollmentValidateInput = z.infer<typeof enrollmentValidateSchema>;

export const enrollmentWithdrawSchema = z.object({
  enrollmentId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});
export type EnrollmentWithdrawInput = z.infer<typeof enrollmentWithdrawSchema>;

/**
 * Décision de l'admin pour un élève dans le cadre d'une réinscription bulk.
 *  - REENROLL : crée un Enrollment DRAFT pour la nouvelle année + niveau cible
 *  - REPEAT : DRAFT au même niveau (redoublement)
 *  - GRADUATE : marque l'inscription source GRADUATED, ne crée rien
 *  - SKIP : ignore (élève qui ne reviendra pas, mais sans clôture explicite)
 */
export const reenrollDecisionSchema = z.enum(['REENROLL', 'REPEAT', 'GRADUATE', 'SKIP']);
export type ReenrollDecision = z.infer<typeof reenrollDecisionSchema>;

export const bulkReenrollItemSchema = z.object({
  sourceEnrollmentId: z.string().uuid(),
  decision: reenrollDecisionSchema,
  /** Niveau cible (requis si REENROLL ou REPEAT). */
  targetLevelId: z.string().uuid().optional(),
});

export const bulkReenrollSchema = z.object({
  sourceYearId: z.string().uuid(),
  targetYearId: z.string().uuid(),
  items: z.array(bulkReenrollItemSchema).min(1).max(2000),
});
export type BulkReenrollInput = z.infer<typeof bulkReenrollSchema>;
