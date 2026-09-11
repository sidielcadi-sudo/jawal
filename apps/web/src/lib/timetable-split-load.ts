/**
 * Éclatement d'une affectation en séances pour le solveur, dédoublements
 * compris.
 *
 * Une matière dédoublée ne se décrit pas par une seule ligne. « 3 h de
 * français dont 1 h en deux groupes » donne au solveur :
 *
 *   - Français, classe entière, 2 h
 *   - Français, Groupe 1, 1 h  ┐ même `parallel_key` : le solveur les place
 *   - Français, Groupe 2, 1 h  ┘ sur exactement les mêmes créneaux
 *
 * Sans ce découpage, le solveur produisait trois séances de classe entière et
 * le dédoublement n'existait que dans les indicateurs.
 */

/** Ce qu'on sait d'une affectation avant éclatement. */
export type SplitInput = {
  assignmentId: string;
  teacherId: string;
  subjectId: string;
  subjectLabel: string;
  classId: string;
  className: string;
  /** Volume total de la matière pour cette classe. */
  weeklyHours: number;
  /** Groupes de la matière, dans l'ordre d'affichage. */
  groups: Array<{ id: string; teacherId: string | null }>;
  /** Heures réellement dédoublées. Null = tout le volume. */
  splitHours: number | null;
  requiredRoomType?: string | null;
};

export type SplitOutput = {
  id: string;
  teacher_id: string;
  subject_id: string;
  subject_label: string;
  class_id: string;
  class_name: string;
  weekly_hours: number;
  group_id?: string | null;
  parallel_key?: string | null;
  required_room_type?: string | null;
};

/**
 * Éclate une affectation en lignes pour le solveur.
 *
 * L'identifiant d'une ligne de groupe dérive de l'affectation d'origine
 * (`<assignmentId>::<groupId>`) : le retour du solveur doit pouvoir remonter
 * à la matière et au professeur, et un identifiant inventé casserait ce lien.
 */
export function splitAssignment(input: SplitInput): SplitOutput[] {
  const base = {
    teacher_id: input.teacherId,
    subject_id: input.subjectId,
    subject_label: input.subjectLabel,
    class_id: input.classId,
    class_name: input.className,
    required_room_type: input.requiredRoomType ?? null,
  };

  const hours = Math.max(0, Math.round(input.weeklyHours));
  // Moins de deux groupes n'est pas un dédoublement.
  if (input.groups.length < 2 || hours === 0) {
    return [{ ...base, id: input.assignmentId, weekly_hours: hours }];
  }

  // Part dédoublée, bornée au volume : une saisie aberrante est plafonnée
  // plutôt que propagée jusqu'au solveur.
  const split = Math.min(hours, Math.max(0, input.splitHours ?? hours));
  const whole = hours - split;

  const out: SplitOutput[] = [];
  if (whole > 0) {
    out.push({ ...base, id: input.assignmentId, weekly_hours: whole, group_id: null });
  }
  if (split > 0) {
    const key = `split:${input.assignmentId}`;
    for (const g of input.groups) {
      out.push({
        ...base,
        id: `${input.assignmentId}::${g.id}`,
        // Un groupe peut avoir son propre enseignant ; à défaut, celui de
        // l'affectation assure les deux — le solveur refusera alors de les
        // mettre en parallèle, et le signalera comme non plaçable.
        teacher_id: g.teacherId ?? input.teacherId,
        weekly_hours: split,
        group_id: g.id,
        parallel_key: key,
      });
    }
  }
  return out;
}

/** Retrouve l'affectation et le groupe d'une ligne rendue par le solveur. */
export function parseSplitId(id: string): { assignmentId: string; groupId: string | null } {
  const i = id.indexOf('::');
  return i < 0
    ? { assignmentId: id, groupId: null }
    : { assignmentId: id.slice(0, i), groupId: id.slice(i + 2) };
}
