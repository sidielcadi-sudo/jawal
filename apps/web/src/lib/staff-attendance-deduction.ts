/**
 * Calcul des retenues salariales liées au pointage du personnel.
 *
 * Convention par défaut (Maroc) — paramétrable au niveau tenant plus tard :
 *   - 26 jours ouvrables / mois (5j × 4,33 sem + ajustement)
 *   - 8h / jour
 *   - Retard ≤ 15 min : tolérance, aucune retenue
 *   - Retard > 15 min : retenue pro-rata sur les minutes de retard
 *   - Absence non excusée : 1 jour entier de salaire brut
 *   - Excusé / Congé / Présent : aucune retenue
 */

export type StaffStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | 'LEAVE';

export const DEFAULT_WORKING_DAYS_PER_MONTH = 26;
export const DEFAULT_HOURS_PER_DAY = 8;
export const LATE_TOLERANCE_MINUTES = 15;

export interface DeductionInput {
  status: StaffStatus;
  grossSalary: number | null | undefined;
  lateMinutes?: number | null;
}

export interface DeductionResult {
  amount: number; // > 0 si retenue, 0 sinon
  formula: string; // explication courte pour affichage utilisateur
}

export function computeStaffDeduction(input: DeductionInput): DeductionResult {
  const gross = Number(input.grossSalary ?? 0);
  if (!gross || gross <= 0) return { amount: 0, formula: 'no_salary' };

  switch (input.status) {
    case 'PRESENT':
    case 'EXCUSED':
    case 'LEAVE':
      return { amount: 0, formula: 'no_deduction' };

    case 'ABSENT': {
      const dailyRate = gross / DEFAULT_WORKING_DAYS_PER_MONTH;
      return {
        amount: roundMad(dailyRate),
        formula: `${gross.toFixed(0)} ÷ ${DEFAULT_WORKING_DAYS_PER_MONTH}j = ${roundMad(dailyRate).toFixed(2)}`,
      };
    }

    case 'LATE': {
      const minutes = Math.max(0, input.lateMinutes ?? 0);
      if (minutes <= LATE_TOLERANCE_MINUTES) {
        return { amount: 0, formula: `≤ ${LATE_TOLERANCE_MINUTES} min tolérance` };
      }
      const billableMinutes = minutes - LATE_TOLERANCE_MINUTES;
      const hourlyRate =
        gross / DEFAULT_WORKING_DAYS_PER_MONTH / DEFAULT_HOURS_PER_DAY;
      const amount = (hourlyRate * billableMinutes) / 60;
      return {
        amount: roundMad(amount),
        formula: `(${minutes}−${LATE_TOLERANCE_MINUTES}) min × ${hourlyRate.toFixed(2)}/h = ${roundMad(amount).toFixed(2)}`,
      };
    }
  }
}

function roundMad(n: number): number {
  return Math.round(n * 100) / 100;
}
