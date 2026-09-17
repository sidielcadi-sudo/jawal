/**
 * Heures supplémentaires (HSE) — motifs, durées, indicateurs.
 *
 * Le formulaire parle en motifs (« Remplacement pour congé maladie »), la paie
 * et l'historique en sources (`SUBSTITUTION`, `PARASCOLAIRE`…). Le motif précise
 * la source sans la remplacer : les heures générées automatiquement depuis les
 * remplacements n'en ont pas, et restent lisibles par leur source.
 */
import { DEFAULT_HOURS_PER_DAY, DEFAULT_WORKING_DAYS_PER_MONTH } from './staff-attendance-deduction';

export const OVERTIME_REASON_GROUPS = [
  { key: 'REPLACEMENTS', reasons: ['REPLACE_SICK', 'REPLACE_TRAINING', 'REPLACE_AUTHORIZED'] },
  { key: 'PEDAGOGY', reasons: ['SUPPORT', 'EXAM_SUPERVISION', 'EXAM_CORRECTION', 'CLUB'] },
] as const;

export type OvertimeReason = (typeof OVERTIME_REASON_GROUPS)[number]['reasons'][number];
export type OvertimeSourceValue =
  | 'TEACHING_OVER_QUOTA'
  | 'SUBSTITUTION'
  | 'PARASCOLAIRE'
  | 'AFTER_HOURS'
  | 'EXAM_SUPERVISION'
  | 'SPECIAL_EVENT';

export const OVERTIME_REASONS: readonly OvertimeReason[] = OVERTIME_REASON_GROUPS.flatMap((g) => g.reasons);

export function isOvertimeReason(v: string): v is OvertimeReason {
  return (OVERTIME_REASONS as readonly string[]).includes(v);
}

/** Un remplacement désigne un professeur remplacé ; les autres motifs, non. */
export function isReplacementReason(r: string | null | undefined): boolean {
  return r === 'REPLACE_SICK' || r === 'REPLACE_TRAINING' || r === 'REPLACE_AUTHORIZED';
}

/** Source comptable d'un motif. */
export function sourceOfReason(r: OvertimeReason): OvertimeSourceValue {
  if (isReplacementReason(r)) return 'SUBSTITUTION';
  if (r === 'EXAM_SUPERVISION' || r === 'EXAM_CORRECTION') return 'EXAM_SUPERVISION';
  return 'PARASCOLAIRE';
}

const toMin = (hhmm: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Durée en heures entre deux horaires « HH:MM » ; null si incohérent. */
export function hoursBetween(start: string, end: string): number | null {
  const a = toMin(start);
  const b = toMin(end);
  if (a === null || b === null || b <= a) return null;
  return Math.round(((b - a) / 60) * 100) / 100;
}

export const PENDING_STATUSES = ['DECLARED', 'RH_VALIDATED'] as const;
export const VALIDATED_STATUSES = ['DIRECTION_APPROVED', 'PROCESSED'] as const;

/** Majoration légale d'une heure supplémentaire de jour ouvrable (Maroc : 25 %). */
export const DEFAULT_OVERTIME_MAJORATION = 0.25;

/** Taux horaire tiré du salaire brut, même convention que les retenues de pointage. */
export function hourlyRate(grossSalary: number | null | undefined): number | null {
  const gross = Number(grossSalary ?? 0);
  if (!gross || gross <= 0) return null;
  return gross / DEFAULT_WORKING_DAYS_PER_MONTH / DEFAULT_HOURS_PER_DAY;
}

export type OvertimeLike = {
  hours: number;
  status: string;
  /** AAAA-MM-JJ */
  date: string;
  grossSalary: number | null;
};

export type OvertimeSummary = {
  pendingHours: number;
  pendingCount: number;
  validatedHours: number;
  validatedCount: number;
  /** Coût des heures validées du mois ; null si aucune n'a de salaire connu. */
  cost: number | null;
  /** Déclarations validées du mois sans salaire brut : exclues du coût. */
  costMissing: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Indicateurs de la page : ce qui attend une validation (toutes dates), ce qui
 * a été validé dans le mois, et ce que cela coûte.
 */
export function summarizeOvertime(
  entries: OvertimeLike[],
  month: string,
  majoration = DEFAULT_OVERTIME_MAJORATION,
): OvertimeSummary {
  let pendingHours = 0;
  let pendingCount = 0;
  let validatedHours = 0;
  let validatedCount = 0;
  let cost = 0;
  let costed = 0;
  let costMissing = 0;
  for (const e of entries) {
    if ((PENDING_STATUSES as readonly string[]).includes(e.status)) {
      pendingHours += e.hours;
      pendingCount += 1;
    } else if ((VALIDATED_STATUSES as readonly string[]).includes(e.status) && e.date.startsWith(month)) {
      validatedHours += e.hours;
      validatedCount += 1;
      const rate = hourlyRate(e.grossSalary);
      if (rate === null) costMissing += 1;
      else {
        cost += e.hours * rate * (1 + majoration);
        costed += 1;
      }
    }
  }
  return {
    pendingHours: round2(pendingHours),
    pendingCount,
    validatedHours: round2(validatedHours),
    validatedCount,
    cost: costed > 0 ? round2(cost) : null,
    costMissing,
  };
}

/**
 * Taux de couverture des absences d'enseignants : cours remplacés rapportés aux
 * cours touchés par une absence (remplacés + annulés). Null sans absence.
 */
export function coverageRate(substituted: number, cancelled: number): number | null {
  const total = substituted + cancelled;
  return total > 0 ? Math.round((substituted / total) * 1000) / 10 : null;
}
