/**
 * Moteur de calcul de paie (droit marocain) — fonction pure, testable.
 *
 * Brut → exonérations → Brut imposable → (frais pro + CNSS + AMO + CIMR) →
 * Salaire Net Imposable → IR (barème + charges de famille) → Net à payer.
 * Calcule aussi la part patronale (CNSS/AF/AMO/taxe formation).
 *
 * Hypothèses v1 (à affiner) : l'indemnité de transport est exonérée d'IR ;
 * base CNSS/AF/taxe formation = brut plafonné ; AMO déplafonnée.
 */
import type { IrBracket } from './payroll-defaults';

const r2 = (n: number) => Math.round(n * 100) / 100;

export type PayrollConfigInput = {
  cnssEmployeeRate: number; cnssCeiling: number; amoEmployeeRate: number;
  cnssEmployerRate: number; familyAllowanceRate: number; amoEmployerRate: number; trainingTaxRate: number;
  professionalExpenseRate: number; professionalExpenseCeilingMonthly: number;
  familyDeductionPerDependentMonthly: number; maxDependents: number;
  irBrackets: IrBracket[];
  seniorityScale: { years: number; rate: number }[];
};

export type PayrollInput = {
  baseSalary: number;
  transportAllowance: number;
  housingAllowance: number;
  benefitsInKind: number;
  cimrEnabled: boolean;
  cimrEmployeeRate: number | null;
  numberOfDependents: number;
  seniorityYears: number;
  bonuses: number;          // primes du mois
  overtimeAmount: number;   // montant heures sup (déjà valorisé)
  unpaidDeduction: number;  // absences/congés non payés
  otherDeductions: number;  // avances, prêts…
};

/** Taux d'ancienneté = plus haut palier atteint. */
export function seniorityRate(scale: { years: number; rate: number }[], years: number): number {
  let rate = 0;
  for (const s of scale) if (years >= s.years) rate = Math.max(rate, s.rate);
  return rate;
}

/** IR mensuel = taux de la tranche × SNI − déduction de la tranche. */
export function applyIr(brackets: IrBracket[], sni: number): number {
  for (const b of brackets) {
    if (b.upTo === null || sni <= b.upTo) return Math.max(0, sni * b.rate - b.deduction);
  }
  return 0;
}

export type PayslipBreakdown = ReturnType<typeof computePayslip>;

export function computePayslip(cfg: PayrollConfigInput, inp: PayrollInput) {
  const seniorityBonus = r2(inp.baseSalary * seniorityRate(cfg.seniorityScale, inp.seniorityYears));
  const brut = r2(
    inp.baseSalary + seniorityBonus + inp.transportAllowance + inp.housingAllowance + inp.benefitsInKind + inp.bonuses + inp.overtimeAmount,
  );

  // Exonérations (v1 : indemnité de transport exonérée d'IR).
  const exonerated = inp.transportAllowance;
  const brutImposable = r2(brut - exonerated);

  // Cotisations salariales.
  const cnssBase = Math.min(brut, cfg.cnssCeiling);
  const cnss = r2(cnssBase * cfg.cnssEmployeeRate);
  const amo = r2(brut * cfg.amoEmployeeRate);
  const cimr = inp.cimrEnabled && inp.cimrEmployeeRate ? r2(brutImposable * inp.cimrEmployeeRate) : 0;

  // Frais professionnels (abattement plafonné).
  const fraisPro = r2(Math.min(brutImposable * cfg.professionalExpenseRate, cfg.professionalExpenseCeilingMonthly));

  // Salaire net imposable.
  const sni = r2(brutImposable - fraisPro - cnss - amo - cimr);

  // IR.
  const irBrut = r2(applyIr(cfg.irBrackets, sni));
  const familyDeduction = r2(Math.min(inp.numberOfDependents, cfg.maxDependents) * cfg.familyDeductionPerDependentMonthly);
  const irNet = r2(Math.max(0, irBrut - familyDeduction));

  // Net à payer.
  const internalDeductions = r2(inp.unpaidDeduction + inp.otherDeductions);
  const netPayable = r2(brut - cnss - amo - cimr - irNet - internalDeductions);

  // Part patronale.
  const cnssEmployer = r2(cnssBase * cfg.cnssEmployerRate);
  const familyAllowance = r2(cnssBase * cfg.familyAllowanceRate);
  const amoEmployer = r2(brut * cfg.amoEmployerRate);
  const trainingTax = r2(cnssBase * cfg.trainingTaxRate);
  const employerCharges = r2(cnssEmployer + familyAllowance + amoEmployer + trainingTax);
  const totalCost = r2(brut + employerCharges);

  return {
    seniorityBonus, brut, exonerated, brutImposable,
    cnss, amo, cimr, fraisPro, sni, irBrut, familyDeduction, irNet,
    internalDeductions, netPayable,
    cnssEmployer, familyAllowance, amoEmployer, trainingTax, employerCharges, totalCost,
  };
}
