import 'server-only';
import type { Prisma } from '@/lib/db';

const DAY_MS = 86_400_000;

export type YearWindow = {
  id: string;
  label: string;
  startDate: Date;
  endDate: Date;
};

/**
 * Année scolaire active du tenant. `null` si aucune année n'est marquée active
 * (établissement en cours de paramétrage).
 */
export async function activeSchoolYear(tx: Prisma.TransactionClient): Promise<YearWindow | null> {
  const y = await tx.academicYear.findFirst({
    where: { active: true },
    select: { id: true, label: true, startDate: true, endDate: true },
  });
  return y ?? null;
}

/**
 * Borne haute d'une année scolaire au sens des échéances : les grilles
 * tarifaires étalent souvent les mensualités sur 12 mois à partir de la
 * rentrée, au-delà de la date de fin pédagogique. On retient donc le plus
 * tardif des deux (fin + 1 jour, ou début + 12 mois).
 */
export function yearInstallmentEnd(year: YearWindow): Date {
  const pedagogical = new Date(year.endDate.getTime() + DAY_MS);
  const twelveMonths = new Date(year.startDate);
  twelveMonths.setMonth(twelveMonths.getMonth() + 12);
  return pedagogical > twelveMonths ? pedagogical : twelveMonths;
}

/* ────────────────────────────────────────────────────────────────────────
   Politique d'effacement de créance (remise gracieuse)
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Quand l'effacement d'une créance est-il autorisé ?
 *  - `END_OF_YEAR` : seulement dans les N derniers jours de l'année scolaire
 *    active, et au-delà. Tant que l'année tourne, une créance non soldée est
 *    un impayé à recouvrer, pas une perte à acter.
 *  - `ANYTIME` : à tout moment (établissements qui arbitrent au fil de l'eau).
 */
export type DebtWaiverMode = 'END_OF_YEAR' | 'ANYTIME';

export type DebtWaiverPolicy = {
  mode: DebtWaiverMode;
  /** Largeur de la fenêtre de fin d'année, en jours. Ignoré si `ANYTIME`. */
  windowDays: number;
};

/** Comportement par défaut : prudent — fin d'année, 30 jours. */
export const DEFAULT_DEBT_WAIVER_POLICY: DebtWaiverPolicy = {
  mode: 'END_OF_YEAR',
  windowDays: 30,
};

export const WAIVER_WINDOW_MIN_DAYS = 1;
export const WAIVER_WINDOW_MAX_DAYS = 365;

/** Lit la politique depuis `tenant.settings.debtWaiver`, avec repli sûr. */
export function readDebtWaiverPolicy(settings: unknown): DebtWaiverPolicy {
  if (!settings || typeof settings !== 'object') return DEFAULT_DEBT_WAIVER_POLICY;
  const raw = (settings as Record<string, unknown>).debtWaiver;
  if (!raw || typeof raw !== 'object') return DEFAULT_DEBT_WAIVER_POLICY;
  const o = raw as Record<string, unknown>;
  const mode: DebtWaiverMode = o.mode === 'ANYTIME' ? 'ANYTIME' : 'END_OF_YEAR';
  const d = o.windowDays;
  const windowDays =
    typeof d === 'number' && Number.isFinite(d) && d >= WAIVER_WINDOW_MIN_DAYS && d <= WAIVER_WINDOW_MAX_DAYS
      ? Math.round(d)
      : DEFAULT_DEBT_WAIVER_POLICY.windowDays;
  return { mode, windowDays };
}

/** Charge la politique du tenant courant. */
export async function loadDebtWaiverPolicy(
  tx: Prisma.TransactionClient,
): Promise<DebtWaiverPolicy> {
  const tenant = await tx.tenant.findFirst({ select: { settings: true } });
  return readDebtWaiverPolicy(tenant?.settings);
}

/**
 * Date d'ouverture de la fenêtre d'effacement. `null` en mode `ANYTIME`
 * (toujours ouverte) ou sans année active (jamais ouverte).
 */
export function waiverWindowStart(
  year: YearWindow | null,
  policy: DebtWaiverPolicy,
): Date | null {
  if (policy.mode === 'ANYTIME' || !year) return null;
  return new Date(year.endDate.getTime() - policy.windowDays * DAY_MS);
}

/**
 * L'effacement est-il ouvert maintenant **pour l'année active** ? En mode
 * `END_OF_YEAR` sans année active on répond `false` : mieux vaut fermer une
 * action irréversible que l'ouvrir par défaut.
 *
 * Ne dit rien des exercices antérieurs — voir `isWaiveOpenForDueDate`.
 */
export function isWaiveOpen(
  year: YearWindow | null,
  policy: DebtWaiverPolicy,
  now: Date = new Date(),
): boolean {
  if (policy.mode === 'ANYTIME') return true;
  const start = waiverWindowStart(year, policy);
  return start !== null && now.getTime() >= start.getTime();
}


/**
 * Une échéance relève-t-elle d'un exercice antérieur à l'année active ?
 * Le critère est la date d'échéance : une échéance tombée avant la rentrée de
 * l'année active appartient à un exercice clos.
 */
export function isPreviousYearDue(year: YearWindow | null, dueDate: Date): boolean {
  if (!year) return false;
  return dueDate.getTime() < year.startDate.getTime();
}

/**
 * Effacement autorisé pour **une échéance donnée**.
 *
 * La fenêtre de fin d'année ne protège que l'exercice en cours : tant que
 * l'année tourne, un reliquat est un impayé à recouvrer, pas une perte à
 * acter. Une créance d'un exercice antérieur, elle, n'a plus rien à attendre —
 * la bloquer jusqu'en juin n'empêcherait rien et interdirait de réinscrire un
 * élève dont la dette a été arbitrée.
 */
export function isWaiveOpenForDueDate(
  year: YearWindow | null,
  policy: DebtWaiverPolicy,
  dueDate: Date,
  now: Date = new Date(),
): boolean {
  if (policy.mode === 'ANYTIME') return true;
  if (isPreviousYearDue(year, dueDate)) return true;
  return isWaiveOpen(year, policy, now);
}

/**
 * Contexte prêt à l'emploi pour les écrans qui proposent l'effacement :
 * l'état d'ouverture et de quoi expliquer une fermeture.
 */
export async function loadWaiveContext(tx: Prisma.TransactionClient): Promise<{
  /** Créances de l'année active : soumises à la fenêtre de fin d'année. */
  canWaive: boolean;
  /** Créances des exercices antérieurs : ouvertes dès qu'une année est active. */
  canWaivePrevious: boolean;
  opensAt: Date | null;
  yearLabel: string | null;
  yearStart: Date | null;
  policy: DebtWaiverPolicy;
}> {
  const [year, policy] = await Promise.all([activeSchoolYear(tx), loadDebtWaiverPolicy(tx)]);
  return {
    canWaive: isWaiveOpen(year, policy),
    // Sans année active, « antérieur » n'a pas de sens : on ferme.
    canWaivePrevious: policy.mode === 'ANYTIME' ? true : year !== null,
    opensAt: waiverWindowStart(year, policy),
    yearLabel: year?.label ?? null,
    yearStart: year?.startDate ?? null,
    policy,
  };
}
