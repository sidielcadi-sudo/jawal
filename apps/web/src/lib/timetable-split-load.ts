/**
 * Éclatement d'une affectation en séances pour le solveur, dédoublements
 * compris.
 *
 * Une matière faite en groupes ne se décrit pas par une seule ligne, et il y a
 * **deux manières** de la faire — que le solveur doit traiter différemment :
 *
 * **Simultané.** « 3 h de français dont 1 h en deux groupes, en même temps » :
 *
 *   - Français, classe entière, 2 h
 *   - Français, Groupe 1, 1 h  ┐ même `parallel_key` : placés sur exactement
 *   - Français, Groupe 2, 1 h  ┘ le même créneau
 *
 *   Les deux moitiés travaillent à la même heure : il faut donc **deux
 *   professeurs**.
 *
 * **Successif.** « 3 h de physique dont 1 h par groupe, l'une après l'autre » :
 *
 *   - Physique, classe entière, 2 h
 *   - Physique, Groupe 1, 1 h — créneau propre, pas de `parallel_key`
 *   - Physique, Groupe 2, 1 h — autre créneau
 *
 *   C'est le fonctionnement des travaux pratiques : le professeur prend une
 *   moitié, puis l'autre. **Un seul professeur suffit**, et l'imposer en
 *   parallèle rendrait l'emploi du temps ingénérable.
 *
 * Le mode se déduit des séances déclarées : une séance sans groupe vaut pour
 * tous (simultané), une séance rattachée à un groupe n'est qu'à lui (successif).
 * Les deux peuvent coexister sur la même matière.
 */

/** Séance déclarée en groupes. `groupId` null = tous les groupes, en parallèle. */
export type DeclaredSlot = { day: string; slotId: string; groupId: string | null };

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
  /**
   * Séances déclarées — « le lundi de 10 h à 12 h se fait en groupes ».
   *
   * Quand elles sont renseignées, elles décident : elles fixent le volume en
   * groupes, le mode (simultané ou successif) et la case exacte. Un simple
   * compte d'heures laissait le solveur choisir, et l'appel comme les notes se
   * rattachaient ensuite à une séance que personne n'avait décidée.
   */
  fixedSlots?: DeclaredSlot[];
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
  /** Créneaux imposés à cette ligne. Vide = le solveur place où il veut. */
  fixed_slots?: Array<{ day: string; slot_id: string }>;
  required_room_type?: string | null;
};

/**
 * Éclate une affectation en lignes pour le solveur.
 *
 * L'identifiant d'une ligne de groupe dérive de l'affectation d'origine
 * (`<assignmentId>::<groupId>`) : le retour du solveur doit pouvoir remonter
 * à la matière et au professeur, et un identifiant inventé casserait ce lien.
 * Les lignes successives portent en plus le suffixe `::seq`, pour ne pas
 * entrer en collision avec la ligne simultanée du même groupe.
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

  const declared = input.fixedSlots ?? [];
  const groupIds = new Set(input.groups.map((g) => g.id));
  const parallel = declared.filter((d) => d.groupId === null);
  const perGroup = new Map<string, DeclaredSlot[]>();
  for (const d of declared) {
    // Une séance rattachée à un groupe qui n'existe plus est ignorée plutôt
    // que propagée : elle produirait une ligne sans cohorte.
    if (d.groupId === null || !groupIds.has(d.groupId)) continue;
    const arr = perGroup.get(d.groupId) ?? [];
    arr.push(d);
    perGroup.set(d.groupId, arr);
  }

  // Les séances déclarées restent bornées au volume de la matière : trois
  // séances sur 2 h de programme est une erreur de saisie, pas une raison
  // d'épingler une case de plus que le solveur ne peut placer.
  const parallelUsed = parallel.slice(0, hours);
  const remaining = Math.max(0, hours - parallelUsed.length);
  for (const [gid, own] of perGroup) perGroup.set(gid, own.slice(0, remaining));

  // Heures en groupes vues par UN élève : les séances simultanées, plus celles
  // de son propre groupe. C'est ce qu'il faut retrancher au volume de classe
  // entière — pas la somme de tous les groupes, qui compterait deux fois.
  const perGroupMax = Math.max(0, ...[...perGroup.values()].map((v) => v.length));

  const split =
    declared.length > 0
      ? parallelUsed.length
      : Math.min(hours, Math.max(0, input.splitHours ?? hours));
  const whole =
    declared.length > 0 ? Math.max(0, hours - parallelUsed.length - perGroupMax) : hours - split;

  const out: SplitOutput[] = [];
  if (whole > 0) {
    out.push({ ...base, id: input.assignmentId, weekly_hours: whole, group_id: null });
  }

  // ── Séances simultanées ────────────────────────────────────────────────
  if (split > 0) {
    const key = `split:${input.assignmentId}`;
    const fixed = parallelUsed.map((d) => ({ day: d.day, slot_id: d.slotId }));
    for (const g of input.groups) {
      out.push({
        ...base,
        id: `${input.assignmentId}::${g.id}`,
        // Un groupe peut avoir son propre enseignant ; à défaut, celui de
        // l'affectation assure les deux — impossible en simultané, et le
        // pré-diagnostic le signale avant de lancer la génération.
        teacher_id: g.teacherId ?? input.teacherId,
        weekly_hours: split,
        group_id: g.id,
        parallel_key: key,
        ...(fixed.length > 0 ? { fixed_slots: fixed } : {}),
      });
    }
  }

  // ── Séances successives ────────────────────────────────────────────────
  //
  // Pas de `parallel_key` : c'est précisément ce qui autorise le même
  // professeur sur les deux moitiés, à deux heures différentes.
  for (const g of input.groups) {
    const own = perGroup.get(g.id) ?? [];
    if (own.length === 0) continue;
    out.push({
      ...base,
      id: `${input.assignmentId}::${g.id}::seq`,
      teacher_id: g.teacherId ?? input.teacherId,
      weekly_hours: own.length,
      group_id: g.id,
      fixed_slots: own.map((d) => ({ day: d.day, slot_id: d.slotId })),
    });
  }

  return out;
}

/**
 * Retrouve l'affectation et le groupe d'une ligne rendue par le solveur.
 *
 * Le suffixe `::seq` des séances successives n'est pas un identifiant : il ne
 * doit pas se retrouver collé au groupe.
 */
export function parseSplitId(id: string): { assignmentId: string; groupId: string | null } {
  const parts = id.split('::');
  if (parts.length < 2) return { assignmentId: id, groupId: null };
  return { assignmentId: parts[0]!, groupId: parts[1]! };
}
