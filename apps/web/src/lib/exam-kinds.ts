/**
 * Types d'épreuves et règles de modification d'une session.
 *
 * Quatre familles, dans l'ordre où l'établissement les pratique au fil de
 * l'année :
 *
 *  - **Contrôles** — le contrôle continu (CC) ;
 *  - **Devoirs** — devoirs surveillés (DS) et devoirs maison (DM) ;
 *  - **Examens internes** — examens blancs et compositions ;
 *  - **Examens officiels** — régional (1BAC) et national (2BAC).
 *
 * `SEMESTRIEL` n'est plus proposé : c'est l'ancien nom de la composition,
 * conservé pour ne pas invalider les sessions déjà créées.
 */

export const EXAM_KIND_GROUPS = [
  { key: 'CONTROLES', kinds: ['CONTROLE_CONTINU'] },
  { key: 'DEVOIRS', kinds: ['DEVOIR_SURVEILLE', 'DEVOIR_MAISON'] },
  { key: 'INTERNES', kinds: ['BLANC', 'COMPOSITION'] },
  { key: 'OFFICIELS', kinds: ['REGIONAL', 'NATIONAL'] },
] as const;

export type ExamKindGroup = (typeof EXAM_KIND_GROUPS)[number]['key'];
export type SelectableExamKind = (typeof EXAM_KIND_GROUPS)[number]['kinds'][number];
export type ExamKindValue = SelectableExamKind | 'SEMESTRIEL';

export const SELECTABLE_EXAM_KINDS: readonly SelectableExamKind[] = EXAM_KIND_GROUPS.flatMap(
  (g) => g.kinds,
);

/** Tous les types acceptés en base, ancien libellé compris. */
export const ALL_EXAM_KINDS: readonly ExamKindValue[] = [...SELECTABLE_EXAM_KINDS, 'SEMESTRIEL'];

export function isExamKind(value: string): value is ExamKindValue {
  return (ALL_EXAM_KINDS as readonly string[]).includes(value);
}

/**
 * Examen officiel : il porte sur des filières (ce sont elles qui fixent les
 * épreuves et les coefficients), donc sur un niveau qui en a — 1BAC, 2BAC.
 */
export function isOfficialKind(kind: string): boolean {
  return kind === 'REGIONAL' || kind === 'NATIONAL';
}

/** Pourquoi une session n'est plus modifiable. `null` = modifiable. */
export type SessionLock = 'CLOSED' | 'MARKS' | 'PAST' | null;

/**
 * Une session se modifie tant qu'aucune note n'est saisie sur ses épreuves et
 * que sa date n'est pas échue.
 *
 * Au-delà, la modifier réécrirait après coup le cadre d'une évaluation déjà
 * passée ou déjà corrigée : les notes resteraient attachées à une épreuve dont
 * le niveau, les filières ou les dates auraient changé sous elles.
 *
 * `today` au format `AAAA-MM-JJ` : la comparaison se fait au jour, pas à
 * l'heure — un examen qui finit aujourd'hui reste modifiable jusqu'au soir.
 */
export function sessionEditLock(
  s: { status: string; markCount: number; endDate: Date | string },
  today: string,
): SessionLock {
  if (s.status === 'CLOSED') return 'CLOSED';
  if (s.markCount > 0) return 'MARKS';
  const end = typeof s.endDate === 'string' ? s.endDate.slice(0, 10) : s.endDate.toISOString().slice(0, 10);
  if (end < today) return 'PAST';
  return null;
}

export const todayIso = () => new Date().toISOString().slice(0, 10);
