'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { workingDaysBetween } from '@/lib/leave';
import { computePayslip, type PayrollConfigInput } from '@/lib/payroll-calc';

type Result = { ok: true; message?: string } | { ok: false; error: string };

/** Heures légales mensuelles au Maroc (44h/sem × 52/12). */
const MONTHLY_LEGAL_HOURS = 191;

async function guard() {
  const session = await auth();
  if (!session?.user) return null;
  await requirePermission('tenants.manage');
  return session;
}

/** Calcule (ou recalcule) la paie d'un mois : génère un bulletin par employé. */
export async function generatePayrollRunAction(year: number, month: number): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  if (month < 1 || month > 12) return { ok: false, error: 'Mois invalide.' };
  const tenantId = s.user.tenantId;

  try {
    const count = await withTenant(tenantId, async (tx): Promise<number> => {
      const existing = await tx.payrollRun.findUnique({ where: { tenantId_year_month: { tenantId, year, month } } });
      if (existing?.status === 'CLOSED') throw new Error('Ce mois est clôturé.');

      const config = await tx.payrollConfig.findFirst({ orderBy: { effectiveFrom: 'desc' } });
      if (!config) throw new Error('Aucun paramétrage de paie. Créez-le d’abord.');

      const cfg: PayrollConfigInput = {
        cnssEmployeeRate: config.cnssEmployeeRate, cnssCeiling: config.cnssCeiling, amoEmployeeRate: config.amoEmployeeRate,
        cnssEmployerRate: config.cnssEmployerRate, familyAllowanceRate: config.familyAllowanceRate, amoEmployerRate: config.amoEmployerRate, trainingTaxRate: config.trainingTaxRate,
        professionalExpenseRate: config.professionalExpenseRate, professionalExpenseCeilingMonthly: config.professionalExpenseCeilingMonthly,
        familyDeductionPerDependentMonthly: config.familyDeductionPerDependentMonthly, maxDependents: config.maxDependents,
        irBrackets: config.irBrackets as PayrollConfigInput['irBrackets'],
        seniorityScale: config.seniorityScale as PayrollConfigInput['seniorityScale'],
      };
      const overtimeMaj = (config.overtimeMatrix as { dayNormal?: number })?.dayNormal ?? 0.25;

      const monthStart = new Date(Date.UTC(year, month - 1, 1));
      const monthEnd = new Date(Date.UTC(year, month, 0));

      const run = await tx.payrollRun.upsert({
        where: { tenantId_year_month: { tenantId, year, month } },
        create: { tenantId, year, month, status: 'CALCULATED', configSnapshot: cfg as object },
        update: { status: 'CALCULATED', configSnapshot: cfg as object },
      });

      const employees = await tx.person.findMany({
        where: { type: { in: ['STAFF', 'TEACHER'] }, deletedAt: null, payrollProfile: { isNot: null } },
        select: { id: true, hireDate: true, payrollProfile: true },
      });

      let n = 0;
      for (const e of employees) {
        const p = e.payrollProfile!;
        if (!p.baseSalary || p.baseSalary <= 0) continue;
        const seniorityYears = e.hireDate ? Math.max(0, monthEnd.getUTCFullYear() - new Date(e.hireDate).getUTCFullYear()) : 0;

        // Heures sup validées (PROCESSED) du mois.
        const ot = await tx.overtimeEntry.aggregate({
          where: { personId: e.id, status: 'PROCESSED', date: { gte: monthStart, lte: monthEnd } },
          _sum: { hours: true },
        });
        const otHours = ot._sum.hours ?? 0;
        const hourlyRate = p.baseSalary / MONTHLY_LEGAL_HOURS;
        const overtimeAmount = Math.round(otHours * hourlyRate * (1 + overtimeMaj) * 100) / 100;

        // Absences/congés non payés du mois.
        const unpaid = await tx.leaveRequest.findMany({
          where: { personId: e.id, status: 'APPROVED', leaveType: { paid: false }, startDate: { lte: monthEnd }, endDate: { gte: monthStart } },
          select: { startDate: true, endDate: true },
        });
        const unpaidDays = unpaid.reduce((sum, l) => {
          const start = l.startDate > monthStart ? l.startDate : monthStart;
          const end = l.endDate < monthEnd ? l.endDate : monthEnd;
          return sum + workingDaysBetween(start, end);
        }, 0);
        const unpaidDeduction = Math.round((unpaidDays * (p.baseSalary / 26)) * 100) / 100;

        const breakdown = computePayslip(cfg, {
          baseSalary: p.baseSalary,
          transportAllowance: p.transportAllowance,
          housingAllowance: p.housingAllowance,
          benefitsInKind: p.benefitsInKind,
          cimrEnabled: p.cimrEnabled,
          cimrEmployeeRate: p.cimrEmployeeRate,
          numberOfDependents: p.numberOfDependents,
          seniorityYears,
          bonuses: 0,
          overtimeAmount,
          unpaidDeduction,
          otherDeductions: 0,
        });

        await tx.payslip.upsert({
          where: { runId_personId: { runId: run.id, personId: e.id } },
          create: { tenantId, runId: run.id, personId: e.id, brut: breakdown.brut, netImposable: breakdown.sni, irNet: breakdown.irNet, netPayable: breakdown.netPayable, employerCost: breakdown.totalCost, breakdown: { ...breakdown, overtimeAmount, unpaidDeduction, seniorityYears } },
          update: { brut: breakdown.brut, netImposable: breakdown.sni, irNet: breakdown.irNet, netPayable: breakdown.netPayable, employerCost: breakdown.totalCost, breakdown: { ...breakdown, overtimeAmount, unpaidDeduction, seniorityYears } },
        });
        n++;
      }
      await logAudit(tx, { tenantId, userId: s.user.id, action: 'payroll_calculate', entityType: 'PayrollRun', entityId: run.id, after: { year, month, count: n } });
      return n;
    });
    revalidatePath('/admin/payroll/runs');
    return { ok: true, message: `${count} bulletin(s) calculé(s).` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

export async function advancePayrollRunAction(runId: string, action: 'validate' | 'approve' | 'close' | 'reopen'): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  const tenantId = s.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const run = await tx.payrollRun.findUnique({ where: { id: runId }, select: { status: true } });
      if (!run) throw new Error('Run introuvable.');
      const data: Record<string, unknown> = {};
      if (action === 'validate') { if (run.status !== 'CALCULATED') throw new Error('Étape invalide.'); data.status = 'RH_VALIDATED'; data.rhByUserId = s.user.id; }
      else if (action === 'approve') { if (run.status !== 'RH_VALIDATED') throw new Error('Étape invalide.'); data.status = 'DIRECTION_APPROVED'; data.directionByUserId = s.user.id; }
      else if (action === 'close') { if (run.status !== 'DIRECTION_APPROVED') throw new Error('Étape invalide.'); data.status = 'CLOSED'; data.closedByUserId = s.user.id; }
      else if (action === 'reopen') { if (run.status === 'CLOSED') throw new Error('Mois clôturé.'); data.status = 'CALCULATED'; }
      await tx.payrollRun.update({ where: { id: runId }, data });
      await logAudit(tx, { tenantId, userId: s.user.id, action: `payroll_${action}`, entityType: 'PayrollRun', entityId: runId });
    });
    revalidatePath('/admin/payroll/runs');
    revalidatePath(`/admin/payroll/runs/${runId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

export async function deletePayrollRunAction(runId: string): Promise<Result> {
  const s = await guard();
  if (!s) return { ok: false, error: 'Non autorisé' };
  try {
    await withTenant(s.user.tenantId, async (tx) => {
      const run = await tx.payrollRun.findUnique({ where: { id: runId }, select: { status: true } });
      if (run?.status === 'CLOSED') throw new Error('Mois clôturé — non supprimable.');
      await tx.payrollRun.delete({ where: { id: runId } });
    });
    revalidatePath('/admin/payroll/runs');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
