import 'server-only';
/** Familles statistiques ; miroir de l'enum Prisma `StaffAbsenceKind`. */
type StaffAbsenceKind =
  | 'SICK_LEAVE'
  | 'TRAINING'
  | 'PARENTAL'
  | 'OFFICIAL_DUTY'
  | 'UNJUSTIFIED'
  | 'OTHER';

/**
 * Jeu de motifs d'absence du personnel proposé à l'initialisation.
 *
 * Les libellés et l'ordre suivent la répartition observée dans l'éducation
 * nationale — la maladie ordinaire pèse l'essentiel des absences, l'absence non
 * justifiée est rare mais c'est celle qu'il faut pouvoir isoler.
 *
 * `kind` sert aux regroupements statistiques et ne change pas ; le libellé, lui,
 * reste modifiable par l'établissement.
 */
export const DEFAULT_STAFF_ABSENCE_REASONS: Array<{
  label: string;
  labelAr: string;
  kind: StaffAbsenceKind;
  color: string;
  order: number;
}> = [
  { label: 'Maladie ordinaire', labelAr: 'مرض عادي', kind: 'SICK_LEAVE', color: '#eb6834', order: 1 },
  { label: 'Formation', labelAr: 'تكوين', kind: 'TRAINING', color: '#2a78d6', order: 2 },
  { label: 'Congé maternité / paternité', labelAr: 'إجازة أمومة / أبوة', kind: 'PARENTAL', color: '#e87ba4', order: 3 },
  { label: 'Convocation institutionnelle', labelAr: 'استدعاء إداري', kind: 'OFFICIAL_DUTY', color: '#4a3aa7', order: 4 },
  { label: 'Absence non justifiée', labelAr: 'غياب غير مبرر', kind: 'UNJUSTIFIED', color: '#e0492f', order: 5 },
  { label: 'Autre', labelAr: 'أخرى', kind: 'OTHER', color: '#898781', order: 6 },
];

/** Couleur de repli quand un motif n'en a pas (ou pour « non renseigné »). */
export const NO_REASON_COLOR = '#cbd5e1';
