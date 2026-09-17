/**
 * Lecture du dossier d'un élève : assiduité chiffrée et notes par matière.
 *
 * Calcul pur, alimenté par les pages. Ce qui n'a pas de base rend `null` :
 * un taux d'assiduité de 0 % sur un élève jamais pointé se lirait comme un
 * décrochage, alors qu'il ne s'est rien passé.
 */

/* ── Durée d'une séance ──────────────────────────────────────────────────── */

/**
 * Durée d'un créneau, en minutes, lue sur son libellé.
 *
 * Les libellés sont saisis à la main dans la grille horaire : « 08:00-09:00 »,
 * « 08h00 - 09h00 », « Journée », « Matin »… On ne devine que ce qui ressemble
 * à un intervalle, et on rend `null` pour le reste — compter « Journée » comme
 * une heure fausserait tous les totaux.
 */
export function slotMinutes(periodLabel: string | null | undefined): number | null {
  if (!periodLabel) return null;
  const m = periodLabel.match(/(\d{1,2})\s*[:hH]\s*(\d{2})\D+(\d{1,2})\s*[:hH]\s*(\d{2})/);
  if (!m) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const end = Number(m[3]) * 60 + Number(m[4]);
  const d = end - start;
  return d > 0 ? d : null;
}

/** Minutes formatées en heures pleines quand c'est rond, sinon « 1 h 30 ». */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/* ── Synthèse d'assiduité ────────────────────────────────────────────────── */

export type AttendanceEntry = {
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
  /** Libellé du créneau, d'où se déduit la durée. */
  periodLabel: string | null;
  lateMinutes: number | null;
  /** Justification acceptée par la vie scolaire. */
  justified: boolean;
};

export type AttendanceSummary = {
  /** Séances pointées, tous statuts confondus. */
  sessions: number;
  absences: number;
  /** Minutes d'absence, quand les créneaux portent des horaires. */
  absenceMinutes: number;
  unjustifiedAbsences: number;
  unjustifiedMinutes: number;
  lates: number;
  lateMinutes: number;
  /** Part des présences sur les séances pointées. `null` si aucun pointage. */
  attendanceRate: number | null;
};

/**
 * Comptabilise l'assiduité d'un élève sur une période.
 *
 * Deux unités cohabitent volontairement : le **nombre** de séances, toujours
 * exact, et la **durée**, seulement pour les créneaux qui portent des horaires.
 * Mélanger les deux — compter une « Journée » comme une heure — donnerait un
 * total d'heures faux que personne ne pourrait recouper.
 *
 * Retards et excusés comptent comme des présences dans le taux : l'élève est
 * là, ou son absence est couverte.
 */
export function summarizeAttendance(entries: AttendanceEntry[]): AttendanceSummary {
  let absences = 0;
  let absenceMinutes = 0;
  let unjustifiedAbsences = 0;
  let unjustifiedMinutes = 0;
  let lates = 0;
  let lateMinutes = 0;
  let present = 0;

  for (const e of entries) {
    const mins = slotMinutes(e.periodLabel) ?? 0;
    if (e.status === 'ABSENT') {
      absences++;
      absenceMinutes += mins;
      if (!e.justified) {
        unjustifiedAbsences++;
        unjustifiedMinutes += mins;
      }
    } else if (e.status === 'LATE') {
      lates++;
      lateMinutes += e.lateMinutes ?? 0;
      present++;
    } else {
      present++;
    }
  }

  return {
    sessions: entries.length,
    absences,
    absenceMinutes,
    unjustifiedAbsences,
    unjustifiedMinutes,
    lates,
    lateMinutes,
    attendanceRate:
      entries.length > 0 ? Math.round((present / entries.length) * 1000) / 10 : null,
  };
}

/**
 * Volume d'absence à afficher : en heures si les créneaux sont horodatés,
 * sinon en nombre de séances.
 */
export function absenceVolume(
  count: number,
  minutes: number,
): { value: string; unit: 'hours' | 'sessions' } {
  return minutes > 0
    ? { value: formatMinutes(minutes), unit: 'hours' }
    : { value: String(count), unit: 'sessions' };
}
