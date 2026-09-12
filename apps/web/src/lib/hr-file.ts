/**
 * Complétude du dossier RH d'un agent, et état de sa journée.
 *
 * Un dossier incomplet ne se voit nulle part tant qu'on n'ouvre pas la fiche :
 * on découvre à la paie qu'il manque un RIB, ou à un contrôle qu'il manque une
 * CIN. Ces règles permettent de le dire dans la liste, à côté du nom.
 */

export type HrPerson = {
  cin: string | null;
  hireDate: Date | null;
  contractType: string | null;
  rib: string | null;
  bankName: string | null;
};

/** Champs exigés pour qu'un dossier RH soit exploitable, et leur libellé. */
export const HR_REQUIRED = [
  { key: 'cin', label: 'CIN' },
  { key: 'hireDate', label: 'Date de recrutement' },
  { key: 'contractType', label: 'Type de contrat' },
  { key: 'rib', label: 'RIB' },
  { key: 'bankName', label: 'Banque' },
] as const;

export type HrFileStatus = {
  complete: boolean;
  /** Libellés des champs manquants, dans l'ordre de `HR_REQUIRED`. */
  missing: string[];
};

/**
 * Ce qui manque au dossier.
 *
 * Une chaîne composée seulement d'espaces compte comme absente : un champ
 * rempli d'un blanc passe les contrôles de saisie mais ne sert à personne.
 */
export function hrFileStatus(p: HrPerson): HrFileStatus {
  const missing: string[] = [];
  for (const f of HR_REQUIRED) {
    const v = p[f.key];
    const empty = v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
    if (empty) missing.push(f.label);
  }
  return { complete: missing.length === 0, missing };
}

/** Résumé court pour une colonne de tableau. */
export function hrFileLabel(s: HrFileStatus): string {
  if (s.complete) return 'Complet';
  // Un seul manque se nomme ; au-delà, on annonce le nombre — « CIN, RIB,
  // Banque, Type de contrat » ne tient pas dans une cellule.
  return s.missing.length === 1 ? `${s.missing[0]} manquant` : `${s.missing.length} champs manquants`;
}

/* ── État du jour ────────────────────────────────────────────────────────── */

export type DayStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE' | 'EXCUSED' | 'NOT_RECORDED';

/**
 * Statut du jour d'un agent, d'après son pointage.
 *
 * `NOT_RECORDED` n'est pas une absence : sur un établissement qui pointe à
 * midi, tout le monde serait déclaré absent le matin. L'écran doit pouvoir
 * distinguer « pas encore pointé » de « absent ».
 */
export function dayStatus(record: { status: string } | null | undefined): DayStatus {
  if (!record) return 'NOT_RECORDED';
  const known: DayStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'EXCUSED'];
  return (known as string[]).includes(record.status)
    ? (record.status as DayStatus)
    : 'NOT_RECORDED';
}

/* ── Contrat ─────────────────────────────────────────────────────────────── */

/**
 * Libellé du contrat, avec l'échéance quand elle approche.
 *
 * « CDD » seul ne dit pas l'essentiel : ce qui compte, c'est qu'il se termine
 * dans quinze jours. Le nombre de jours n'apparaît qu'en deçà du seuil, pour
 * ne pas noyer la colonne d'échéances lointaines.
 */
export function contractLabel(
  p: { contractType: string | null; contractEndDate: Date | null },
  now: Date = new Date(),
  warnDays = 30,
): { label: string; endsInDays: number | null; urgent: boolean } {
  const type = p.contractType ?? '—';
  if (!p.contractEndDate) return { label: type, endsInDays: null, urgent: false };
  const days = Math.ceil(
    (Date.UTC(
      p.contractEndDate.getUTCFullYear(),
      p.contractEndDate.getUTCMonth(),
      p.contractEndDate.getUTCDate(),
    ) -
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) /
      86_400_000,
  );
  if (days < 0) return { label: `${type} (expiré)`, endsInDays: days, urgent: true };
  if (days <= warnDays) {
    return { label: `${type} (fin dans ${days} j)`, endsInDays: days, urgent: days <= 15 };
  }
  return { label: type, endsInDays: days, urgent: false };
}
