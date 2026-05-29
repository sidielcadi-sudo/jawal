import { z } from 'zod';

export const paymentMethodSchema = z.enum(['CASH', 'CHEQUE', 'TRANSFER', 'CMI', 'STRIPE', 'OTHER']);
export type PaymentMethodInput = z.infer<typeof paymentMethodSchema>;

export const feeScheduleCreateSchema = z.object({
  academicYearId: z.string().uuid(),
  levelId: z.string().uuid(),
  label: z.string().min(1).max(120),
  totalAmount: z.coerce.number().positive().max(10_000_000),
  installmentCount: z.coerce.number().int().min(1).max(24).default(9),
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

export const recordPaymentSchema = z.object({
  installmentId: z.string().uuid(),
  amount: z.coerce.number().positive().max(10_000_000),
  method: paymentMethodSchema,
  reference: z
    .preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().min(1).max(200).optional(),
    )
    .optional(),
  paidAt: z.coerce.date().default(() => new Date()),
});
export type RecordPayment = z.infer<typeof recordPaymentSchema>;
