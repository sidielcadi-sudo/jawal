/**
 * Contrôle de faisabilité avant génération de l'emploi du temps.
 *
 * Les solveurs disent mal pourquoi ils échouent. FET, en particulier, rejette
 * le fichier entier sur un « Cannot precompute - data is wrong » qui ne nomme
 * ni la classe, ni la matière, ni la contrainte fautive : l'utilisateur n'a
 * aucun moyen de corriger. OR-Tools, lui, rend une grille vide sans dire ce
 * qui manquait.
 *
 * On regarde donc les données AVANT de les envoyer, et on nomme ce qui cloche :
 * quelle classe, quel professeur, combien d'heures de trop. Les causes
 * bloquantes arrêtent la génération — la lancer ne produirait rien d'autre
 * qu'un message illisible ; les autres la laissent passer et sont rapportées
 * avec le résultat.
 */

export type SlotLike = { id: string; is_break?: boolean };
export type DayKey = string;

export type TeacherLike = {
  id: string;
  name: string;
  availability?: Partial<Record<DayKey, Array<{ from: string; to: string }>>>;
};

export type AssignmentLike = {
  id: string;
  teacher_id: string;
  subject_label: string;
  class_id: string;
  class_name: string;
  weekly_hours: number;
  group_id?: string | null;
  parallel_key?: string | null;
  /** Créneaux imposés par une séance dédoublée déclarée. */
  fixed_slots?: Array<{ day: DayKey; slot_id: string }>;
};

export type PreflightInput = {
  slots: SlotLike[];
  days: DayKey[];
  teachers: TeacherLike[];
  assignments: AssignmentLike[];
  /**
   * Cases fermées. `class_id` renseigné = fermée pour cette classe seulement ;
   * absent = fermée pour tout le monde.
   */
  forbiddenClassSlots?: Array<{ day: DayKey; slot_id: string; class_id?: string }>;
  /**
   * Créneaux déjà pris par les classes qu'on ne régénère pas.
   *
   * Sur une génération partielle — « le collège seulement » — les professeurs
   * restent engagés au lycée. Les ignorer ferait conclure au diagnostic que
   * tout tient, alors que la moitié des heures ne peut pas être placée.
   */
  busyTeacherSlots?: Array<{ teacher_id: string; day: DayKey; slot_id: string }>;
  maxSameSubjectPerDay?: number | null;
};

export type IssueKind =
  | 'SPLIT_SHARED_TEACHER'
  | 'TEACHER_NO_AVAILABILITY'
  | 'TEACHER_OVERLOADED'
  | 'CLASS_OVERLOADED'
  | 'SUBJECT_TOO_FREQUENT'
  | 'DECLARED_SLOT_CLOSED'
  | 'DECLARED_SLOT_TEACHER_BUSY'
  | 'NOTHING_TO_PLACE';

export type PreflightIssue = {
  kind: IssueKind;
  /** Bloquant = la génération ne peut rien produire d'exploitable. */
  blocking: boolean;
  className?: string;
  subjectLabel?: string;
  teacherName?: string;
  /** Heures à placer. */
  need?: number;
  /** Capacité disponible. */
  have?: number;
  /** Case en cause, lisible : « mercredi 14:00-15:00 ». */
  cellLabel?: string;
  /** Professeur déjà en cours ailleurs (vrai) ou hors de ses disponibilités (faux). */
  busyElsewhere?: boolean;
};

const DAY_LABELS: Record<string, string> = {
  MON: 'lundi',
  TUE: 'mardi',
  WED: 'mercredi',
  THU: 'jeudi',
  FRI: 'vendredi',
  SAT: 'samedi',
  SUN: 'dimanche',
};

/** Nombre de cases réellement ouvertes (jours × créneaux, moins les interdits). */
export function usableCells(input: PreflightInput): number {
  const slots = input.slots.filter((s) => !s.is_break);
  const forbidden = new Set(
    (input.forbiddenClassSlots ?? []).map((f) => `${f.day}|${f.slot_id}`),
  );
  let n = 0;
  for (const d of input.days) for (const s of slots) if (!forbidden.has(`${d}|${s.id}`)) n++;
  return n;
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/**
 * Créneaux où un professeur est réellement joignable.
 *
 * Une plage de disponibilité ne « contient » un créneau que si elle le couvre
 * entièrement : un professeur libre de 8 h à 9 h ne peut pas assurer un cours
 * de 8 h à 10 h.
 */
export function teacherOpenCells(
  teacher: TeacherLike,
  slots: Array<{ id: string; start_time: string; end_time: string; is_break?: boolean }>,
  days: DayKey[],
  /** Cases `jour|créneau` déjà occupées par ce professeur ailleurs. */
  busy?: Set<string>,
): number {
  let n = 0;
  for (const d of days) {
    for (const w of teacher.availability?.[d] ?? []) {
      for (const s of slots) {
        if (s.is_break) continue;
        if (busy?.has(`${d}|${s.id}`)) continue;
        if (toMinutes(s.start_time) >= toMinutes(w.from) && toMinutes(s.end_time) <= toMinutes(w.to)) {
          n++;
        }
      }
    }
  }
  return n;
}

/**
 * Passe en revue ce qui empêcherait la génération d'aboutir.
 *
 * L'ordre du retour est celui de la gravité : ce qui bloque d'abord.
 */
export function runPreflight(
  input: PreflightInput & {
    slots: Array<SlotLike & { start_time: string; end_time: string }>;
  },
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const placeable = input.slots.filter((s) => !s.is_break);
  const cells = usableCells(input);
  const teacherById = new Map(input.teachers.map((t) => [t.id, t]));

  const busyByTeacher = new Map<string, Set<string>>();
  for (const b of input.busyTeacherSlots ?? []) {
    const set = busyByTeacher.get(b.teacher_id) ?? new Set<string>();
    set.add(`${b.day}|${b.slot_id}`);
    busyByTeacher.set(b.teacher_id, set);
  }

  const withHours = input.assignments.filter((a) => a.weekly_hours > 0);
  if (withHours.length === 0) {
    return [{ kind: 'NOTHING_TO_PLACE', blocking: true }];
  }

  /* ── Un dédoublement exige DEUX professeurs ───────────────────────────── */
  //
  // C'est la cause n°1 du « Cannot precompute - data is wrong » : deux
  // activités simultanées qui partagent un enseignant sont, pour FET, une
  // donnée invalide — et il rejette tout le fichier, pas seulement ce couple.
  const bundles = new Map<string, AssignmentLike[]>();
  for (const a of withHours) {
    if (!a.parallel_key) continue;
    const arr = bundles.get(a.parallel_key) ?? [];
    arr.push(a);
    bundles.set(a.parallel_key, arr);
  }
  for (const members of bundles.values()) {
    if (members.length < 2) continue;
    const distinct = new Set(members.map((m) => m.teacher_id));
    if (distinct.size < members.length) {
      const first = members[0]!;
      issues.push({
        // Non bloquant : la génération aboutit, mais les deux moitiés seront
        // placées à des heures différentes et l'une se retrouvera sans cours
        // pendant que l'autre travaille. On génère, et on le dit.
        kind: 'SPLIT_SHARED_TEACHER',
        blocking: false,
        className: first.class_name,
        subjectLabel: first.subject_label,
        teacherName: teacherById.get(first.teacher_id)?.name,
      });
    }
  }

  /* ── Professeurs ──────────────────────────────────────────────────────── */
  const hoursByTeacher = new Map<string, number>();
  for (const a of withHours) {
    hoursByTeacher.set(a.teacher_id, (hoursByTeacher.get(a.teacher_id) ?? 0) + a.weekly_hours);
  }
  for (const [id, need] of hoursByTeacher) {
    const t = teacherById.get(id);
    if (!t) continue;
    const open = teacherOpenCells(
      t,
      placeable as Array<{ id: string; start_time: string; end_time: string }>,
      input.days,
      busyByTeacher.get(id),
    );
    if (open === 0) {
      issues.push({ kind: 'TEACHER_NO_AVAILABILITY', blocking: true, teacherName: t.name, need });
    } else if (need > open) {
      issues.push({
        kind: 'TEACHER_OVERLOADED',
        blocking: true,
        teacherName: t.name,
        need,
        have: open,
      });
    }
  }

  /* ── Cohortes : la classe entière et chaque demi-groupe ───────────────── */
  //
  // Un demi-groupe occupe la classe au même titre qu'elle : sa charge se
  // compte à part, sinon un dédoublement passerait sous le radar.
  const hoursByCohort = new Map<string, { name: string; hours: number }>();
  for (const a of withHours) {
    const k = `${a.class_id}|${a.group_id ?? ''}`;
    const cur = hoursByCohort.get(k) ?? { name: a.class_name, hours: 0 };
    cur.hours += a.weekly_hours;
    hoursByCohort.set(k, cur);
  }
  for (const { name, hours } of hoursByCohort.values()) {
    if (hours > cells) {
      issues.push({ kind: 'CLASS_OVERLOADED', blocking: true, className: name, need: hours, have: cells });
    }
  }

  /* ── « Une séance par jour » arithmétiquement impossible ──────────────── */
  //
  // Non bloquant : la contrainte est simplement écartée pour ce couple, et la
  // matière tombera parfois deux fois le même jour. Mieux vaut le dire que de
  // laisser découvrir la grille.
  if ((input.maxSameSubjectPerDay ?? 0) === 1) {
    const bySubject = new Map<string, { className: string; subjectLabel: string; hours: number }>();
    for (const a of withHours) {
      const k = `${a.class_id}|${a.subject_label}|${a.group_id ?? ''}`;
      const cur = bySubject.get(k) ?? {
        className: a.class_name,
        subjectLabel: a.subject_label,
        hours: 0,
      };
      cur.hours += a.weekly_hours;
      bySubject.set(k, cur);
    }
    for (const r of bySubject.values()) {
      if (r.hours > input.days.length) {
        issues.push({
          kind: 'SUBJECT_TOO_FREQUENT',
          blocking: false,
          className: r.className,
          subjectLabel: r.subjectLabel,
          need: r.hours,
          have: input.days.length,
        });
      }
    }
  }

  /* ── Séances déclarées sur une case fermée ────────────────────────────── */
  //
  // Une séance dédoublée déclarée est VERROUILLÉE sur sa case. Si cette case
  // est fermée pour la classe — mercredi après-midi, jour OFF — la donnée se
  // contredit, et FET refuse alors le fichier ENTIER : « Cannot precompute -
  // data is wrong », sans nommer la classe ni la case. Une seule déclaration
  // de trop, et plus rien ne se génère dans tout l'établissement : c'est
  // bloquant, et il faut dire exactement quelle case retirer.
  const closedByClass = new Map<string, Set<string>>();
  const closedForAll = new Set<string>();
  for (const f of input.forbiddenClassSlots ?? []) {
    const k = `${f.day}|${f.slot_id}`;
    if (!f.class_id) {
      closedForAll.add(k);
      continue;
    }
    const set = closedByClass.get(f.class_id) ?? new Set<string>();
    set.add(k);
    closedByClass.set(f.class_id, set);
  }
  const slotById = new Map(
    (input.slots as Array<SlotLike & { start_time: string; end_time: string }>).map((s) => [
      s.id,
      s,
    ]),
  );
  const placeableIds = new Set(placeable.map((s) => s.id));
  const seenCells = new Set<string>();
  for (const a of withHours) {
    for (const f of a.fixed_slots ?? []) {
      const k = `${f.day}|${f.slot_id}`;
      const sl = slotById.get(f.slot_id);
      const closed =
        closedForAll.has(k) ||
        (closedByClass.get(a.class_id)?.has(k) ?? false) ||
        !placeableIds.has(f.slot_id);
      if (!closed) {
        // Case ouverte pour la classe, mais le professeur de la séance n'y est
        // pas disponible : déjà en cours dans une classe qu'on ne régénère pas
        // (le collège quand on génère le lycée), ou hors de ses plages. FET
        // rejette alors le fichier entier, comme pour une case fermée.
        const teacher = teacherById.get(a.teacher_id);
        const busy = busyByTeacher.get(a.teacher_id)?.has(k) ?? false;
        const ranges = teacher?.availability?.[f.day];
        const outside =
          !!teacher?.availability &&
          !!sl &&
          !(ranges ?? []).some(
            (w) => toMinutes(sl.start_time) >= toMinutes(w.from) && toMinutes(sl.end_time) <= toMinutes(w.to),
          );
        const dedupT = `${a.id}|${k}`;
        if ((busy || outside) && !seenCells.has(dedupT)) {
          seenCells.add(dedupT);
          issues.push({
            kind: 'DECLARED_SLOT_TEACHER_BUSY',
            blocking: true,
            className: a.class_name,
            subjectLabel: a.subject_label,
            teacherName: teacher?.name,
            busyElsewhere: busy,
            cellLabel: `${DAY_LABELS[f.day] ?? f.day}${sl ? ` ${sl.start_time}-${sl.end_time}` : ''}`,
          });
        }
        continue;
      }
      // Les deux moitiés d'un dédoublement pointent souvent la même case : on
      // ne la signale qu'une fois, sans quoi le message se répète.
      const dedup = `${a.class_id}|${a.subject_label}|${k}`;
      if (seenCells.has(dedup)) continue;
      seenCells.add(dedup);
      issues.push({
        kind: 'DECLARED_SLOT_CLOSED',
        blocking: true,
        className: a.class_name,
        subjectLabel: a.subject_label,
        cellLabel: `${DAY_LABELS[f.day] ?? f.day}${
          sl ? ` ${sl.start_time}-${sl.end_time}` : ''
        }`,
      });
    }
  }

  return issues.sort((a, b) => Number(b.blocking) - Number(a.blocking));
}

/** Phrase prête à afficher pour un problème donné. */
export function describeIssue(i: PreflightIssue): string {
  const where = [i.className, i.subjectLabel].filter(Boolean).join(' / ');
  switch (i.kind) {
    case 'SPLIT_SHARED_TEACHER':
      return `${where} : les deux groupes ont le même enseignant${
        i.teacherName ? ` (${i.teacherName})` : ''
      }. Un professeur ne peut pas tenir les deux moitiés en même temps — affectez-en un second dans Classes → Groupes.`;
    case 'TEACHER_NO_AVAILABILITY':
      return `${i.teacherName} : ${i.need} h à placer mais aucune disponibilité saisie. Renseignez ses créneaux dans sa fiche.`;
    case 'TEACHER_OVERLOADED':
      return `${i.teacherName} : ${i.need} h à placer pour seulement ${i.have} créneaux disponibles. Élargissez ses disponibilités ou redistribuez ses classes.`;
    case 'CLASS_OVERLOADED':
      return `${i.className} : ${i.need} h de cours pour ${i.have} cases dans la grille horaire. Ajoutez des créneaux ou réduisez le programme.`;
    case 'SUBJECT_TOO_FREQUENT':
      return `${where} : ${i.need} séances sur ${i.have} jours ouvrés — la règle « une séance par jour » ne peut pas être tenue, la matière reviendra deux fois certains jours.`;
    case 'DECLARED_SLOT_TEACHER_BUSY':
      return `${where} : la séance en groupes déclarée ${i.cellLabel} tombe ${
        i.busyElsewhere
          ? `sur un cours que ${i.teacherName ?? "l'enseignant"} donne déjà dans une classe dont l'emploi du temps n'est pas régénéré (un autre cycle, par exemple)`
          : `hors des disponibilités de ${i.teacherName ?? "l'enseignant"}`
      }. Déplacez cette séance dans Classes → Groupes, ou générez les classes concernées ensemble.`;
    case 'DECLARED_SLOT_CLOSED':
      return `${where} : une séance en groupes est déclarée ${i.cellLabel}, où la classe n'a pas cours. Le générateur ne peut ni la placer là ni la déplacer — décochez cette case dans Classes → Groupes, ou ouvrez ce créneau dans les contraintes de la classe.`;
    case 'NOTHING_TO_PLACE':
      return `Aucune affectation à placer : vérifiez que les enseignants sont affectés aux classes et que les volumes horaires sont renseignés.`;
  }
}

/**
 * Message complet destiné à l'écran de génération.
 *
 * Retourne `null` quand rien ne bloque : l'appelant enchaîne sur le solveur.
 */
export function blockingMessage(issues: PreflightIssue[]): string | null {
  const blocking = issues.filter((i) => i.blocking);
  if (blocking.length === 0) return null;
  const head =
    blocking.length === 1
      ? "L'emploi du temps ne peut pas être généré :"
      : `L'emploi du temps ne peut pas être généré — ${blocking.length} points à corriger :`;
  return `${head}\n• ${blocking.map(describeIssue).join('\n• ')}`;
}

/** Avertissements à joindre au résultat quand la génération a pu aboutir. */
export function warningMessage(issues: PreflightIssue[]): string | null {
  const warnings = issues.filter((i) => !i.blocking);
  if (warnings.length === 0) return null;
  return `À surveiller : ${warnings.map(describeIssue).join(' ')}`;
}
