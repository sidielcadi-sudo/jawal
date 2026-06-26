'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { DEFAULT_PAYROLL_CONFIG } from '@/lib/payroll-defaults';

type Result = { ok: true } | { ok: false; error: string };

const num = (fd: FormData, k: string, def = 0) => {
  const v = fd.get(k);
  const n = typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : def;
};
const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
};

async function guard() {
  const session = await auth();
  if (!session?.user) return null;
  await requirePermission('tenants.manage');
  return session;
}

/** Crée la config de paie par défaut (référence marocaine) si aucune n'existe. */
export async function seedPayrollConfigAction(): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const exists = await tx.payrollConfig.count();
    if (exists > 0) return;
    const y = new Date().getUTCFullYear();
    await tx.payrollConfig.create({
      data: {
        tenantId,
        effectiveFrom: new Date(Date.UTC(y, 0, 1)),
        label: `Barème ${y}`,
        ...DEFAULT_PAYROLL_CONFIG,
      },
    });
  });
  revalidatePath('/admin/payroll');
  return { ok: true };
}

/** Met à jour les taux/plafonds scalaires + le barème IR (JSON) de la config active. */
export async function updatePayrollConfigAction(fd: FormData): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const id = str(fd, 'id');
  if (!id) return { ok: false, error: 'Config introuvable.' };
  let irBrackets: unknown;
  try {
    irBrackets = JSON.parse(str(fd, 'irBrackets') ?? '[]');
    if (!Array.isArray(irBrackets)) throw new Error();
  } catch {
    return { ok: false, error: 'Barème IR : JSON invalide.' };
  }
  await withTenant(s.user.tenantId, async (tx) => {
    await tx.payrollConfig.update({
      where: { id },
      data: {
        cnssEmployeeRate: num(fd, 'cnssEmployeeRate'),
        cnssCeiling: num(fd, 'cnssCeiling'),
        amoEmployeeRate: num(fd, 'amoEmployeeRate'),
        cnssEmployerRate: num(fd, 'cnssEmployerRate'),
        familyAllowanceRate: num(fd, 'familyAllowanceRate'),
        amoEmployerRate: num(fd, 'amoEmployerRate'),
        trainingTaxRate: num(fd, 'trainingTaxRate'),
        professionalExpenseRate: num(fd, 'professionalExpenseRate'),
        professionalExpenseCeilingMonthly: num(fd, 'professionalExpenseCeilingMonthly'),
        familyDeductionPerDependentMonthly: num(fd, 'familyDeductionPerDependentMonthly'),
        maxDependents: Math.round(num(fd, 'maxDependents', 6)),
        irBrackets: irBrackets as object,
      },
    });
    await logAudit(tx, { tenantId: s.user.tenantId, userId: s.user.id, action: 'update', entityType: 'PayrollConfig', entityId: id });
  });
  revalidatePath('/admin/payroll');
  return { ok: true };
}

/** Crée/maj le profil de paie d'un employé. */
export async function upsertEmployeeProfileAction(fd: FormData): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const personId = str(fd, 'personId');
  if (!personId) return { ok: false, error: 'Employé requis.' };
  const tenantId = s.user.tenantId;
  const data = {
    cnssNumber: str(fd, 'cnssNumber') ?? null,
    baseSalary: num(fd, 'baseSalary'),
    transportAllowance: num(fd, 'transportAllowance'),
    housingAllowance: num(fd, 'housingAllowance'),
    benefitsInKind: num(fd, 'benefitsInKind'),
    cimrEnabled: fd.get('cimrEnabled') === 'on' || fd.get('cimrEnabled') === 'true',
    cimrEmployeeRate: str(fd, 'cimrEmployeeRate') ? num(fd, 'cimrEmployeeRate') : null,
    numberOfDependents: Math.round(num(fd, 'numberOfDependents')),
  };
  await withTenant(tenantId, (tx) =>
    tx.employeePayrollProfile.upsert({
      where: { personId },
      create: { tenantId, personId, ...data },
      update: data,
    }),
  );
  revalidatePath('/admin/payroll');
  return { ok: true };
}
