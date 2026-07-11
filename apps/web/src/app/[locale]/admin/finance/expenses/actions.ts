'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { postExpense } from '@/lib/accounting-hooks';

type Result = { ok: true } | { ok: false; error: string };

const CATEGORIES = [
  'SALARY',
  'RENT',
  'UTILITIES',
  'SUPPLIES',
  'MAINTENANCE',
  'TRANSPORT',
  'TAXES',
  'OTHER',
] as const;
const METHODS = ['CASH', 'CHEQUE', 'TRANSFER', 'OTHER'] as const;

const schema = z.object({
  label: z.string().trim().min(1).max(160),
  category: z.enum(CATEGORIES).default('OTHER'),
  amount: z.coerce.number().positive().max(100_000_000),
  date: z.coerce.date(),
  method: z
    .preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.enum(METHODS).optional())
    .optional(),
  note: z
    .preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().max(2000).optional())
    .optional(),
});

export async function createExpenseAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('finance.write');
  const parsed = schema.safeParse({
    label: formData.get('label'),
    category: formData.get('category') || 'OTHER',
    amount: formData.get('amount'),
    date: formData.get('date'),
    method: formData.get('method'),
    note: formData.get('note'),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalide' };
  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const e = await tx.expense.create({
      data: {
        tenantId,
        label: parsed.data.label,
        category: parsed.data.category,
        amount: parsed.data.amount,
        date: parsed.data.date,
        method: parsed.data.method ?? null,
        note: parsed.data.note ?? null,
        recordedByUserId: session.user.id,
      },
    });
    await postExpense(tx, tenantId, { id: e.id, amount: parsed.data.amount, category: parsed.data.category, method: parsed.data.method ?? null, date: parsed.data.date, label: parsed.data.label }, session.user.id);
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'create',
      entityType: 'Expense',
      entityId: e.id,
      after: { label: parsed.data.label, amount: parsed.data.amount, category: parsed.data.category },
    });
  });
  revalidatePath('/admin/finance/expenses');
  revalidatePath('/admin/finance');
  return { ok: true };
}

export async function deleteExpenseAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('finance.write');
  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    await tx.expense.delete({ where: { id } });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'delete',
      entityType: 'Expense',
      entityId: id,
    });
  });
  revalidatePath('/admin/finance/expenses');
  revalidatePath('/admin/finance');
  return { ok: true };
}
