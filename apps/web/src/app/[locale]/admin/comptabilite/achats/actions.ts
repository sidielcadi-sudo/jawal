'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { postSupplierInvoice, postSupplierPayment } from '@/lib/accounting-hooks';

type Result = { ok: true } | { ok: false; error: string };
const METHODS = ['CASH', 'CHEQUE', 'TRANSFER', 'CMI', 'OTHER'] as const;

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
};
const num = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v !== undefined ? Number(v) : undefined;
};
const date = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v ? new Date(`${v}T00:00:00Z`) : undefined;
};

async function guard() {
  const session = await auth();
  if (!session?.user) return null;
  await requirePermission('tenants.manage');
  return session;
}

export async function createSupplierAction(fd: FormData): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const name = str(fd, 'name');
  if (!name) return { ok: false, error: 'Nom requis.' };
  await withTenant(s.user.tenantId, (tx) => tx.supplier.create({ data: { tenantId: s.user.tenantId, name, ice: str(fd, 'ice') ?? null, phone: str(fd, 'phone') ?? null, email: str(fd, 'email') ?? null } }));
  revalidatePath('/admin/comptabilite/achats');
  return { ok: true };
}

export async function createInvoiceAction(fd: FormData): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const supplierId = str(fd, 'supplierId');
  const label = str(fd, 'label');
  const accountCode = str(fd, 'accountCode');
  const amount = num(fd, 'amount');
  const d = date(fd, 'date');
  const due = date(fd, 'dueDate') ?? d;
  if (!supplierId || !label || !accountCode || !amount || amount <= 0 || !d) return { ok: false, error: 'Champs requis manquants.' };
  await withTenant(s.user.tenantId, async (tx) => {
    const inv = await tx.supplierInvoice.create({
      data: { tenantId: s.user.tenantId, supplierId, number: str(fd, 'number') ?? null, label, accountCode, amount, date: d, dueDate: due!, note: str(fd, 'note') ?? null, recordedByUserId: s.user.id },
    });
    await postSupplierInvoice(tx, s.user.tenantId, { id: inv.id, accountCode, amount, date: d, label }, s.user.id);
  });
  revalidatePath('/admin/comptabilite/achats');
  return { ok: true };
}

export async function recordSupplierPaymentAction(fd: FormData): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const invoiceId = str(fd, 'invoiceId');
  const amount = num(fd, 'amount');
  const method = (str(fd, 'method') as (typeof METHODS)[number]) ?? 'TRANSFER';
  const d = date(fd, 'date') ?? new Date();
  if (!invoiceId || !amount || amount <= 0 || !METHODS.includes(method)) return { ok: false, error: 'Montant et mode requis.' };
  try {
    await withTenant(s.user.tenantId, async (tx) => {
      const inv = await tx.supplierInvoice.findUnique({ where: { id: invoiceId }, include: { payments: { select: { amount: true } } } });
      if (!inv) throw new Error('Facture introuvable.');
      const paid = inv.payments.reduce((x, p) => x + Number(p.amount), 0);
      const remaining = Number(inv.amount) - paid;
      if (amount > remaining + 0.01) throw new Error(`Dépasse le reste dû (${remaining.toFixed(2)}).`);
      const pay = await tx.supplierPayment.create({ data: { tenantId: s.user.tenantId, invoiceId, amount, method, date: d, reference: str(fd, 'reference') ?? null, recordedByUserId: s.user.id } });
      const newPaid = paid + amount;
      await tx.supplierInvoice.update({ where: { id: invoiceId }, data: { status: newPaid >= Number(inv.amount) - 0.01 ? 'PAID' : 'PARTIAL' } });
      await postSupplierPayment(tx, s.user.tenantId, { id: pay.id, amount, method, date: d }, inv.label, s.user.id);
    });
    revalidatePath('/admin/comptabilite/achats');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

export async function deleteInvoiceAction(id: string): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  try {
    await withTenant(s.user.tenantId, async (tx) => {
      const inv = await tx.supplierInvoice.findUnique({ where: { id }, include: { payments: { select: { id: true } } } });
      if (!inv) throw new Error('Introuvable.');
      if (inv.payments.length > 0) throw new Error('Facture réglée — non supprimable.');
      await tx.supplierInvoice.delete({ where: { id } });
    });
    revalidatePath('/admin/comptabilite/achats');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
