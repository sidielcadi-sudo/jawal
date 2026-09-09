/**
 * Règles des groupes de classe (dédoublement).
 *
 * Fonctions pures, sans accès base : ce sont les invariants que la couche SQL
 * ne sait pas exprimer, et que les actions serveur doivent vérifier avant
 * d'écrire. Les deux index partiels de `rls.sql` couvrent l'unicité d'une case
 * d'emploi du temps ; tout le reste est ici.
 */

/** Un groupe et sa composition, tel qu'on le charge pour une classe. */
export type GroupShape = {
  id: string;
  name: string;
  /** Matière à laquelle le groupe s'applique. Null = polyvalent. */
  subjectId: string | null;
  memberIds: string[];
};

/** Composition d'une case d'emploi du temps : la classe entière, ou des groupes. */
export type SlotOccupant = { entryId: string; groupId: string | null };

/* ────────────────────────────────────────────────────────────────────────
   Composition des groupes
   ──────────────────────────────────────────────────────────────────────── */

export type GroupOverlap = { studentId: string; subjectId: string | null; groupIds: string[] };

/**
 * Élèves présents dans plusieurs groupes de la même matière.
 *
 * Interdit : deux demi-groupes de français se tiennent au même moment, un élève
 * ne peut pas être dans les deux. La contrainte porte sur la matière du groupe,
 * pas sur la ligne d'appartenance — aucun index SQL ne l'attrape.
 *
 * Les groupes polyvalents (`subjectId` null) forment leur propre famille : une
 * répartition « groupe A / groupe B » réutilisable ne doit pas non plus se
 * chevaucher avec elle-même.
 */
export function findGroupOverlaps(groups: GroupShape[]): GroupOverlap[] {
  /** (matière, élève) → groupes qui le contiennent. */
  const seen = new Map<string, { subjectId: string | null; studentId: string; groupIds: string[] }>();
  for (const g of groups) {
    for (const studentId of g.memberIds) {
      const key = `${g.subjectId ?? '*'}|${studentId}`;
      const cur = seen.get(key) ?? { subjectId: g.subjectId, studentId, groupIds: [] };
      cur.groupIds.push(g.id);
      seen.set(key, cur);
    }
  }
  return [...seen.values()]
    .filter((x) => x.groupIds.length > 1)
    .map((x) => ({ studentId: x.studentId, subjectId: x.subjectId, groupIds: x.groupIds }));
}

/**
 * Élèves de la classe qu'aucun groupe de cette matière ne contient.
 *
 * Un dédoublement doit couvrir tout l'effectif : un élève oublié n'aurait
 * simplement pas cours, sans que rien ne le signale. On rend la liste plutôt
 * qu'un booléen — l'écran doit pouvoir nommer les oubliés.
 *
 * Une matière sans aucun groupe rend une liste vide : elle se fait en classe
 * entière, il n'y a rien à couvrir.
 */
export function findUncoveredStudents(
  classStudentIds: string[],
  groups: GroupShape[],
  subjectId: string | null,
): string[] {
  const applicable = groups.filter((g) => g.subjectId === subjectId);
  if (applicable.length === 0) return [];
  const covered = new Set(applicable.flatMap((g) => g.memberIds));
  return classStudentIds.filter((id) => !covered.has(id));
}

/* ────────────────────────────────────────────────────────────────────────
   Occupation d'une case d'emploi du temps
   ──────────────────────────────────────────────────────────────────────── */

export type SlotVerdict =
  | { ok: true }
  /** Une séance en classe entière occupe déjà la case. */
  | { ok: false; reason: 'WHOLE_CLASS_PRESENT' }
  /** Ce groupe a déjà une séance sur la case. */
  | { ok: false; reason: 'GROUP_ALREADY_PLACED' }
  /** On veut la classe entière alors que des groupes occupent la case. */
  | { ok: false; reason: 'GROUPS_PRESENT' };

/**
 * Peut-on poser une séance de plus sur une case déjà occupée ?
 *
 * Les index partiels refusent les doublons stricts ; ce qu'ils ne refusent pas,
 * c'est de **mêler** une séance en classe entière et une séance de groupe sur
 * la même case. C'est incohérent — les élèves du groupe seraient attendus à
 * deux endroits — mais ce n'est pas une violation d'intégrité, donc c'est ici
 * que ça se joue, avec un message que l'agent peut comprendre.
 *
 * `excludeEntryId` permet de valider une modification sans que la séance
 * examinée se bloque elle-même.
 */
export function checkSlotComposition(
  occupants: SlotOccupant[],
  incoming: { groupId: string | null },
  excludeEntryId?: string,
): SlotVerdict {
  const others = occupants.filter((o) => o.entryId !== excludeEntryId);

  if (incoming.groupId === null) {
    if (others.length > 0) {
      return others.some((o) => o.groupId === null)
        ? { ok: false, reason: 'WHOLE_CLASS_PRESENT' }
        : { ok: false, reason: 'GROUPS_PRESENT' };
    }
    return { ok: true };
  }

  if (others.some((o) => o.groupId === null)) return { ok: false, reason: 'WHOLE_CLASS_PRESENT' };
  if (others.some((o) => o.groupId === incoming.groupId)) {
    return { ok: false, reason: 'GROUP_ALREADY_PLACED' };
  }
  return { ok: true };
}

/**
 * Un enseignant peut-il tenir cette séance ? Un même prof ne peut pas être sur
 * deux groupes simultanés, même de classes différentes.
 *
 * Rendu séparément de `checkSlotComposition` : le conflit de prof traverse les
 * classes, la composition d'une case est locale à une classe.
 */
export function findTeacherClash(
  sameSlotEntries: Array<{ entryId: string; teacherId: string | null; className: string }>,
  incoming: { teacherId: string | null },
  excludeEntryId?: string,
): { className: string } | null {
  if (!incoming.teacherId) return null;
  const clash = sameSlotEntries.find(
    (e) => e.entryId !== excludeEntryId && e.teacherId === incoming.teacherId,
  );
  return clash ? { className: clash.className } : null;
}

/**
 * Répartition automatique d'un effectif en `count` groupes équilibrés.
 *
 * Distribution en tourniquet sur la liste reçue : l'appelant décide de l'ordre
 * (alphabétique, ou mélangé). Le reste va aux premiers groupes, donc l'écart
 * entre le plus gros et le plus petit ne dépasse jamais un élève.
 */
export function splitIntoGroups(studentIds: string[], count: number): string[][] {
  if (count < 1) return [studentIds];
  const buckets: string[][] = Array.from({ length: count }, () => []);
  studentIds.forEach((id, i) => buckets[i % count]!.push(id));
  return buckets;
}
