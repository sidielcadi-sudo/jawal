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
};

export type PreflightInput = {
  slots: SlotLike[];
  days: DayKey[];
  teachers: TeacherLike[];
  assignments: AssignmentLike[];
  forbiddenClassSlots?: Array<{ day: DayKey; slot_id: string }>;
  maxSameSubjectPerDay?: number | null;
};

export type IssueKind =
  | 'SPLIT_SHARED_TEACHER'
  | 'TEACHER_NO_AVAILABILITY'
  | 'TEACHER_OVERLOADED'
  | 'CLASS_OVERLOADED'
  | 'SUBJECT_TOO_FREQUENT'
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
): number {
  let n = 0;
  for (const d of days) {
    for (const w of teacher.availability?.[d] ?? []) {
      for (const s of slots) {
        if (s.is_break) continue;
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
