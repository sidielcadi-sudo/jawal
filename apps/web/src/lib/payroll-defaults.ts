/**
 * Valeurs de RÉFÉRENCE de paie (droit marocain) — à VÉRIFIER/ajuster avec le
 * comptable de l'établissement. Barème IR = réforme 2025 (mensuel).
 * Tout est paramétrable et versionné via PayrollConfig.
 */
export const DEFAULT_PAYROLL_CONFIG = {
  cnssEmployeeRate: 0.0448,
  cnssCeiling: 6000,
  amoEmployeeRate: 0.0226,

  cnssEmployerRate: 0.0898,
  familyAllowanceRate: 0.064,
  amoEmployerRate: 0.0411,
  trainingTaxRate: 0.016,

  professionalExpenseRate: 0.2,
  professionalExpenseCeilingMonthly: 2500,

  familyDeductionPerDependentMonthly: 30,
  maxDependents: 6,

  // Barème IR mensuel 2025 (référence) — { upTo: borne sup ou null, rate, deduction }.
  irBrackets: [
    { upTo: 3333, rate: 0, deduction: 0 },
    { upTo: 5000, rate: 0.1, deduction: 333.33 },
    { upTo: 6667, rate: 0.2, deduction: 833.33 },
    { upTo: 8333, rate: 0.3, deduction: 1500 },
    { upTo: 15000, rate: 0.34, deduction: 1833.33 },
    { upTo: null, rate: 0.37, deduction: 2283.33 },
  ],

  // Majorations heures sup (Code du travail marocain).
  overtimeMatrix: { dayNormal: 0.25, nightNormal: 0.5, dayRest: 0.5, nightRest: 1.0 },

  // Prime d'ancienneté légale.
  seniorityScale: [
    { years: 2, rate: 0.05 },
    { years: 5, rate: 0.1 },
    { years: 12, rate: 0.15 },
    { years: 20, rate: 0.2 },
    { years: 25, rate: 0.25 },
  ],

  // Comptes CGNC (référence) — à mapper selon le plan comptable de l'école.
  accountMapping: {
    salaries: '6171',
    socialCharges: '6174',
    netPayable: '4432',
    cnss: '4441',
    amo: '4445',
    ir: '4452',
    bank: '5141',
  },
};

export type IrBracket = { upTo: number | null; rate: number; deduction: number };
