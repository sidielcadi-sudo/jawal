import { z } from 'zod';

export const paymentMethodSchema = z.enum(['CASH', 'CHEQUE', 'TRANSFER', 'CMI', 'STRIPE', 'OTHER']);
export type PaymentMethodInput = z.infer<typeof paymentMethodSchema>;

export const feeKindSchema = z.enum(['ANNUAL', 'EXCEPTIONAL']);
// Doit rester aligné sur l'enum `FeeCategory` du schéma Prisma : l'écran de
// paramétrage propose INSCRIPTION (frais d'inscription, non remboursables par
// défaut), qui était absent ici et faisait échouer la validation.
export const feeCategorySchema = z.enum([
  'TUITION',
  'INSCRIPTION',
  'TRANSPORT',
  'CANTEEN',
  'DAYCARE',
  'OTHER',
]);

export const feeScheduleCreateSchema = z.object({
  academicYearId: z.string().uuid(),
  levelId: z.string().uuid(),
  label: z.string().min(1).max(120),
  kind: feeKindSchema.default('ANNUAL'),
  category: feeCategorySchema.default('TUITION'),
  totalAmount: z.coerce.number().positive().max(10_000_000),
  installmentCount: z.coerce.number().int().min(1).max(24).default(9),
  installmentLocked: z.coerce.boolean().default(false),
  firstDueMonth: z.coerce.number().int().min(1).max(12).default(9),
});
export type FeeScheduleCreate = z.infer<typeof feeScheduleCreateSchema>;

/**
 * Génère un échéancier mensuel pour un élève à partir d'une grille tarifaire.
 * On split totalAmount en installmentCount mensualités égales, à partir
 * du firstDueMonth de l'académie.
 */
export const generateInstallmentsSchema = z.object({
  studentId: z.string().uuid(),
  feeScheduleItemId: z.string().uuid(),
});
export type GenerateInstallments = z.infer<typeof generateInstallmentsSchema>;

/* ------------------------------------------------------------------ */
/* Frais exceptionnels (ponctuels, ciblés, optionnels/obligatoires)    */
/* ------------------------------------------------------------------ */

const optionalDate = z
  .preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.coerce.date().optional(),
  )
  .optional();

/** Type de frais exceptionnel paramétrable (catalogue tenant). */
export const exceptionalFeeTypeSchema = z.object({
  labelFr: z.string().min(1).max(80),
  labelAr: z.string().min(1).max(80),
  order: z.coerce.number().int().min(0).max(999).default(0),
  active: z.coerce.boolean().default(true),
});
export type ExceptionalFeeTypeInput = z.infer<typeof exceptionalFeeTypeSchema>;

/** Création / édition d'un frais exceptionnel. */
export const exceptionalFeeCreateSchema = z.object({
  academicYearId: z.string().uuid(),
  typeId: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().uuid().optional(),
    )
    .optional(),
  label: z.string().min(1).max(160),
  description: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().max(2000).optional(),
    )
    .optional(),
  amount: z.coerce.number().positive().max(10_000_000),
  activityDate: optionalDate,
  dueDate: optionalDate,
  mandatory: z.coerce.boolean().default(false),
});
export type ExceptionalFeeCreate = z.infer<typeof exceptionalFeeCreateSchema>;

/** Affectation d'un frais à des classes entières et/ou des élèves nommés. */
export const exceptionalFeeAssignSchema = z
  .object({
    exceptionalFeeId: z.string().uuid(),
    classIds: z.array(z.string().uuid()).default([]),
    studentIds: z.array(z.string().uuid()).default([]),
  })
  .refine((d) => d.classIds.length > 0 || d.studentIds.length > 0, {
    message: 'Sélectionnez au moins une classe ou un élève.',
    path: ['studentIds'],
  });
export type ExceptionalFeeAssign = z.infer<typeof exceptionalFeeAssignSchema>;

/** Décision de consentement du parent. */
export const exceptionalFeeConsentSchema = z.object({
  assignmentId: z.string().uuid(),
  decision: z.enum(['ACCEPT', 'REFUSE']),
});
export type ExceptionalFeeConsent = z.infer<typeof exceptionalFeeConsentSchema>;

export const recordPaymentSchema = z.object({
  installmentId: z.string().uuid(),
  amount: z.coerce.number().positive().max(10_000_000),
  method: paymentMethodSchema,
  // `formData.get()` rend `null` pour un champ absent et `''` pour un champ
  // vide : les deux valent « pas de référence ». Sans ce repli, un appel qui
  // omet simplement le champ échoue sur « Expected string, received null ».
  reference: z
    .preprocess(
      (v) => (v === null || v === undefined || (typeof v === 'string' && v.trim() === '') ? undefined : v),
      z.string().min(1).max(200).optional(),
    )
    .optional(),
  // Idem : null (champ absent) doit retomber sur le défaut, pas être coercé
  // en 1970 — `new Date(null)` vaut l'epoch, ce qui daterait le règlement
  // d'un demi-siècle en arrière sans rien signaler.
  paidAt: z.preprocess((v) => (v === null || v === '' ? undefined : v), z.coerce.date().optional()).default(() => new Date()),
});
export type RecordPayment = z.infer<typeof recordPaymentSchema>;
