/**
 * Détection des conflits dans l'emploi du temps.
 *
 * Pour un même créneau (dayOfWeek × slotId × academicYearId) :
 *  - un prof ne peut pas être dans 2 classes en même temps → conflit TEACHER
 *  - une salle ne peut pas accueillir 2 classes en même temps → conflit ROOM
 *
 * La contrainte « 1 cours par (classe × créneau) » est garantie par
 * l'index unique en base — pas besoin de la détecter ici.
 */

export type DayKey = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export type EntryLite = {
  id: string;
  classId: string;
  className?: string | null;
  dayOfWeek: DayKey;
  slotId: string;
  teacherId: string | null;
  roomId: string | null;
};

export type Conflict = {
  kind: 'TEACHER' | 'ROOM';
  dayOfWeek: DayKey;
  slotId: string;
  /** ID prof ou salle en conflit */
  resourceId: string;
  /** Toutes les entrées impliquées (≥ 2) */
  entryIds: string[];
  /** Pour affichage humain (noms des classes) */
  classNames: string[];
};

export function detectConflicts(entries: EntryLite[]): Conflict[] {
  const conflicts: Conflict[] = [];

  // Indexation : pour chaque (day × slot × resource), liste les entries
  const byTeacher = new Map<string, EntryLite[]>();
  const byRoom = new Map<string, EntryLite[]>();

  for (const e of entries) {
    if (e.teacherId) {
      const k = `${e.dayOfWeek}|${e.slotId}|${e.teacherId}`;
      const arr = byTeacher.get(k) ?? [];
      arr.push(e);
      byTeacher.set(k, arr);
    }
    if (e.roomId) {
      const k = `${e.dayOfWeek}|${e.slotId}|${e.roomId}`;
      const arr = byRoom.get(k) ?? [];
      arr.push(e);
      byRoom.set(k, arr);
    }
  }

  for (const [k, list] of byTeacher) {
    if (list.length < 2) continue;
    const parts = k.split('|');
    conflicts.push({
      kind: 'TEACHER',
      dayOfWeek: parts[0] as DayKey,
      slotId: parts[1]!,
      resourceId: parts[2]!,
      entryIds: list.map((e) => e.id),
      classNames: Array.from(new Set(list.map((e) => e.className ?? ''))).filter(Boolean),
    });
  }
  for (const [k, list] of byRoom) {
    if (list.length < 2) continue;
    const parts = k.split('|');
    conflicts.push({
      kind: 'ROOM',
      dayOfWeek: parts[0] as DayKey,
      slotId: parts[1]!,
      resourceId: parts[2]!,
      entryIds: list.map((e) => e.id),
      classNames: Array.from(new Set(list.map((e) => e.className ?? ''))).filter(Boolean),
    });
  }

  return conflicts;
}

/** Index pratique pour l'UI : entryId → liste de conflits */
export function conflictsByEntry(conflicts: Conflict[]): Map<string, Conflict[]> {
  const m = new Map<string, Conflict[]>();
  for (const c of conflicts) {
    for (const id of c.entryIds) {
      const arr = m.get(id) ?? [];
      arr.push(c);
      m.set(id, arr);
    }
  }
  return m;
}
