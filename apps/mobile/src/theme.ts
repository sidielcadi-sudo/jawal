/** Couleurs de base (alignées sur le bleu institutionnel du web). */
export const colors = {
  brand: '#1A56DB',
  brandDark: '#143FA6',
  /** Déclinaisons reprises de la palette `brand-*` du portail web. */
  brand50: '#EFF6FF',
  brand100: '#DBEAFE',
  brand200: '#BFDBFE',
  brand700: '#143FA6',
  brand800: '#123A8F',
  brand900: '#0E2F73',
  /** Accent orange du portail (bouton de connexion, filets). */
  amber: '#F59E0B',
  bg: '#F8F9FB',
  card: '#FFFFFF',
  border: '#E5E7EB',
  text: '#0F172A',
  textMuted: '#64748B',
  danger: '#DC2626',
  white: '#FFFFFF',
};

/**
 * Fonds et bordures des cartes selon le niveau d'acquisition — mêmes paliers
 * que les compétences du web (Non acquis → Maîtrisé). Utilisés aussi pour les
 * notes, converties en palier sur 20.
 */
export type MasteryLevel = 'none' | 'partial' | 'acquired' | 'mastered' | 'neutral';

export const mastery: Record<MasteryLevel, { bg: string; border: string; text: string; label: string }> = {
  none: { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C', label: 'Non acquis' },
  partial: { bg: '#FFF7ED', border: '#FED7AA', text: '#C2410C', label: "En cours d'acquisition" },
  acquired: { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D', label: 'Acquis' },
  mastered: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8', label: 'Maîtrisé' },
  neutral: { bg: '#FFFFFF', border: '#BFDBFE', text: '#0F172A', label: '' },
};

/** Convertit une note sur `scale` en palier d'acquisition. */
export function levelFromGrade(value: number | null, scale = 20): MasteryLevel {
  if (value === null || Number.isNaN(value)) return 'neutral';
  const pct = (value / scale) * 100;
  if (pct < 50) return 'none';
  if (pct < 60) return 'partial';
  if (pct < 80) return 'acquired';
  return 'mastered';
}

/**
 * Teinte d'une échéance de scolarité — même principe que les notes : un fond
 * très clair porte l'information, la bordure la souligne. Le **retard** prime
 * sur le statut : une échéance impayée dont la date est passée est le seul cas
 * qui demande une action immédiate.
 */
export type FeeTone = 'paid' | 'partial' | 'due' | 'overdue';

export const feeTone: Record<FeeTone, { bg: string; border: string; text: string; label: string }> = {
  paid: { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D', label: 'Payé' },
  partial: { bg: '#FFF7ED', border: '#FED7AA', text: '#C2410C', label: 'Partiel' },
  due: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8', label: 'À payer' },
  overdue: { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C', label: 'En retard' },
};

export function toneFromFee(
  status: 'PENDING' | 'PARTIAL' | 'PAID',
  dueDate: string,
  remaining: number,
): FeeTone {
  if (status === 'PAID' || remaining <= 0) return 'paid';
  const due = new Date(dueDate).getTime();
  if (!Number.isNaN(due) && due < Date.now()) return 'overdue';
  return status === 'PARTIAL' ? 'partial' : 'due';
}

/**
 * Couleur de la barre verticale d'un cours, dérivée du nom de la matière :
 * une matière garde la même couleur d'un jour à l'autre, sans table à tenir.
 */
const SUBJECT_COLORS = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100',
  '#e87ba4', '#7c3aed', '#0891b2', '#65a30d',
];

export function subjectColor(subject: string | null): string {
  if (!subject) return '#CBD5E1';
  let h = 0;
  for (let i = 0; i < subject.length; i++) h = (h * 31 + subject.charCodeAt(i)) >>> 0;
  return SUBJECT_COLORS[h % SUBJECT_COLORS.length]!;
}
