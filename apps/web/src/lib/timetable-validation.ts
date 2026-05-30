/**
 * Validations « soft » de l'emploi du temps :
 *   - violation de dispo prof (créneau hors plages saisies dans Person.availability)
 *   - écart entre heures programmées et hoursPerWeek de TeacherAssignment
 *
 * Aucune contrainte DB : on calcule à la volée pour afficher des alertes
 * non-bloquantes (l'admin peut vouloir déroger ponctuellement).
 */

import type { DayKey } from './timetable-conflicts';

export type AvailabilitySlot = { from: string; to: string };
export type AvailabilityMap = Partial<Record<DayKey, AvailabilitySlot[]>>;

/**
 * Renvoie true si un créneau (start/end HH:MM) est couvert par au moins
 * une plage de la dispo du prof pour ce jour. Si la dispo est absente
 * ou vide pour ce jour, false (= hors dispo).
 */
export function isInAvailability(
  dayOfWeek: DayKey,
  startTime: string,
  endTime: string,
  availability: AvailabilityMap | null | undefined,
): boolean {
  if (!availability) return false;
  const ranges = availability[dayOfWeek];
  if (!ranges || ranges.length === 0) return false;
  return ranges.some((r) => r.from <= startTime && r.to >= endTime);
}

/** Calcule la durée d'un slot en minutes (08:00 → 09:30 = 90). */
export function slotDurationMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (sh === undefined || sm === undefined || eh === undefined || em === undefined) return 0;
  return Math.max(0, eh * 60 + em - (sh * 60 + sm));
}

export type AssignmentLite = {
  teacherId: string;
  subjectId: string;
  classId: string;
  hoursPerWeek: number | null;
};

export type EntryWithDuration = {
  teacherId: string | null;
  subjectId: string | null;
  classId: string;
  durationMinutes: number;
};

export type AssignmentDelta = {
  teacherId: string;
  subjectId: string;
  classId: string;
  expectedHours: number | null;
  scheduledHours: number;
  deltaHours: number; // positif = sur-affecté, négatif = sous-affecté
};

/**
 * Pour chaque TeacherAssignment, calcule les heures programmées dans l'EDT
 * (somme des durées des entries qui matchent teacher+subject+class) et
 * compare avec hoursPerWeek.
 *
 * Ajoute aussi une ligne « extra » pour chaque (teacher×subject×class) qui
 * apparaît dans les entries SANS assignment correspondant — utile pour
 * alerter sur des affectations « sauvages ».
 */
export function computeAssignmentDeltas(
  assignments: AssignmentLite[],
  entries: EntryWithDuration[],
): AssignmentDelta[] {
  // Index entries par triplet (teacher|subject|class) → minutes
  const scheduled = new Map<string, number>();
  for (const e of entries) {
    if (!e.teacherId || !e.subjectId) continue;
    const k = `${e.teacherId}|${e.subjectId}|${e.classId}`;
    scheduled.set(k, (scheduled.get(k) ?? 0) + e.durationMinutes);
  }

  const out: AssignmentDelta[] = [];
  const seen = new Set<string>();

  for (const a of assignments) {
    const k = `${a.teacherId}|${a.subjectId}|${a.classId}`;
    seen.add(k);
    const scheduledMinutes = scheduled.get(k) ?? 0;
    const scheduledHours = round2(scheduledMinutes / 60);
    out.push({
      teacherId: a.teacherId,
      subjectId: a.subjectId,
      classId: a.classId,
      expectedHours: a.hoursPerWeek,
      scheduledHours,
      deltaHours: round2(scheduledHours - (a.hoursPerWeek ?? 0)),
    });
  }

  // Entries sans assignment correspondant → ligne « extra »
  for (const [k, minutes] of scheduled) {
    if (seen.has(k)) continue;
    const [teacherId, subjectId, classId] = k.split('|');
    if (!teacherId || !subjectId || !classId) continue;
    const scheduledHours = round2(minutes / 60);
    out.push({
      teacherId,
      subjectId,
      classId,
      expectedHours: null, // null = pas d'assignment formalisé
      scheduledHours,
      deltaHours: scheduledHours,
    });
  }

  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
