/**
 * Agrégation multi-établissements du tableau de bord Groupe.
 *
 * Chaque site est interrogé séparément (un tenant, une base logique) ; ce
 * module recolle les morceaux. Tout ce qui s'y trouve est du calcul pur :
 * la page fournit les chiffres bruts par site, on les consolide ici, et on
 * peut donc vérifier les règles d'agrégation sans monter trois tenants.
 *
 * Une règle traverse le fichier : **un taux ne s'additionne pas**. La moyenne
 * de trois pourcentages de sites de tailles différentes ne décrit rien ; on
 * repasse systématiquement par les effectifs.
 */

export type SiteCycleCount = { cycle: string; students: number };

export type SiteInput = {
  name: string;
  students: number;
  teachers: number;
  classes: number;
  /** Effectifs par cycle du site. */
  byCycle: SiteCycleCount[];
  due: number;
  paid: number;
  /** Familles (foyers) ayant au moins une créance non soldée. */
  unpaidFamilies: number;
  /** Heures d'enseignement à assurer sur la semaine. */
  teachingHours: number;
  /** Identifiants nationaux des enseignants, pour repérer les multi-sites. */
  teacherKeys: string[];
  capacity: number;
  enrolled: number;
  underfilledClasses: number;
  overfilledClasses: number;
  attendanceRate: number | null;
  /** Élèves pris en compte dans le taux de présence — sert à le pondérer. */
  attendanceBase: number;
  successRate: number | null;
  averageGeneral: number | null;
  /** Moyenne de la période précédente, pour mesurer la progression. */
  previousAverage: number | null;
  ratedStudents: number;
};

/** Moyenne pondérée : `null` si aucun site n'a de valeur. */
export function weighted(
  values: Array<{ value: number | null; weight: number }>,
): number | null {
  let num = 0;
  let den = 0;
  for (const v of values) {
    if (v.value === null || v.weight <= 0) continue;
    num += v.value * v.weight;
    den += v.weight;
  }
  return den > 0 ? Math.round((num / den) * 10) / 10 : null;
}

/** Pourcentage, arrondi au dixième. `null` si le dénominateur est nul. */
export function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

export type GroupTotals = {
  students: number;
  teachers: number;
  classes: number;
  byCycle: SiteCycleCount[];
  due: number;
  paid: number;
  remaining: number;
  collectionRate: number | null;
  unpaidRate: number | null;
  unpaidFamilies: number;
  /** Heures d'enseignement par professeur, moyenne du groupe. */
  hoursPerTeacher: number | null;
  /** Enseignants présents dans plus d'un établissement. */
  multiSiteTeachers: number;
  capacity: number;
  enrolled: number;
  occupancyRate: number | null;
  underfilledClasses: number;
  overfilledClasses: number;
  attendanceRate: number | null;
  successRate: number | null;
  averageGeneral: number | null;
  /** Écart de moyenne avec la période précédente, en points. */
  progression: number | null;
};

/**
 * Consolide les sites en un jeu d'indicateurs de groupe.
 *
 * Les effectifs, montants et comptages s'additionnent. Les taux sont
 * recalculés depuis les totaux (taux d'encaissement, occupation) ou pondérés
 * par l'effectif concerné (présence, réussite, moyenne).
 */
export function consolidate(sites: SiteInput[]): GroupTotals {
  const sum = (f: (s: SiteInput) => number) => sites.reduce((n, s) => n + f(s), 0);

  const students = sum((s) => s.students);
  const due = sum((s) => s.due);
  const paid = sum((s) => s.paid);
  const capacity = sum((s) => s.capacity);
  const enrolled = sum((s) => s.enrolled);
  const teachers = sum((s) => s.teachers);
  const teachingHours = sum((s) => s.teachingHours);

  // Effectifs par cycle, fusionnés entre sites et triés par taille.
  const cycleMap = new Map<string, number>();
  for (const s of sites) {
    for (const c of s.byCycle) cycleMap.set(c.cycle, (cycleMap.get(c.cycle) ?? 0) + c.students);
  }
  const byCycle = [...cycleMap.entries()]
    .map(([cycle, n]) => ({ cycle, students: n }))
    .sort((a, b) => b.students - a.students);

  // Multi-sites : un enseignant est la même personne d'un site à l'autre
  // lorsqu'il porte le même identifiant national. Les fiches sans identifiant
  // ne sont pas rapprochées — mieux vaut sous-compter que fusionner deux
  // homonymes.
  const seen = new Map<string, Set<string>>();
  for (const s of sites) {
    for (const k of s.teacherKeys) {
      if (!k) continue;
      const set = seen.get(k) ?? new Set<string>();
      set.add(s.name);
      seen.set(k, set);
    }
  }
  const multiSiteTeachers = [...seen.values()].filter((set) => set.size > 1).length;

  const collectionRate = pct(paid, due);
  const averageGeneral = weighted(
    sites.map((s) => ({ value: s.averageGeneral, weight: s.ratedStudents })),
  );
  const previousAverage = weighted(
    sites.map((s) => ({ value: s.previousAverage, weight: s.ratedStudents })),
  );

  return {
    students,
    teachers,
    classes: sum((s) => s.classes),
    byCycle,
    due,
    paid,
    remaining: Math.max(0, due - paid),
    collectionRate,
    unpaidRate: collectionRate === null ? null : Math.round((100 - collectionRate) * 10) / 10,
    unpaidFamilies: sum((s) => s.unpaidFamilies),
    hoursPerTeacher: teachers > 0 ? Math.round((teachingHours / teachers) * 10) / 10 : null,
    multiSiteTeachers,
    capacity,
    enrolled,
    occupancyRate: pct(enrolled, capacity),
    underfilledClasses: sum((s) => s.underfilledClasses),
    overfilledClasses: sum((s) => s.overfilledClasses),
    attendanceRate: weighted(
      sites.map((s) => ({ value: s.attendanceRate, weight: s.attendanceBase })),
    ),
    successRate: weighted(sites.map((s) => ({ value: s.successRate, weight: s.ratedStudents }))),
    averageGeneral,
    progression:
      averageGeneral !== null && previousAverage !== null
        ? Math.round((averageGeneral - previousAverage) * 10) / 10
        : null,
  };
}

/* ── Remplissage des classes ─────────────────────────────────────────────── */

/** En deçà, une classe est sous-remplie ; au-delà de 100 %, sur-chargée. */
export const UNDERFILL_THRESHOLD = 60;

/**
 * Compte les classes hors de la zone confortable.
 *
 * Une classe sans capacité saisie n'est ni sous- ni sur-chargée : on ne sait
 * pas. La compter comme sous-remplie gonflerait l'alerte sur un simple oubli
 * de paramétrage.
 */
export function classFillCounts(
  classes: Array<{ capacity: number; enrolled: number }>,
): { underfilled: number; overfilled: number } {
  let underfilled = 0;
  let overfilled = 0;
  for (const c of classes) {
    if (c.capacity <= 0) continue;
    const rate = (c.enrolled / c.capacity) * 100;
    if (rate > 100) overfilled++;
    else if (rate < UNDERFILL_THRESHOLD) underfilled++;
  }
  return { underfilled, overfilled };
}

/* ── Infrastructures ─────────────────────────────────────────────────────── */

export type RoomUsage = { type: string; rooms: number; usedCells: number; capacityCells: number };

/**
 * Taux d'occupation des salles par famille.
 *
 * `capacityCells` = salles × créneaux ouverts de la semaine. Le rapport dit
 * quelle part du potentiel est réellement utilisée par l'emploi du temps.
 * Une famille sans aucune salle rend `null` plutôt que 0 % : il n'y a pas de
 * sous-occupation d'un parc inexistant.
 */
export function roomOccupancy(usages: RoomUsage[]): Array<{ type: string; rate: number | null; rooms: number }> {
  return usages.map((u) => ({
    type: u.type,
    rooms: u.rooms,
    rate: u.rooms === 0 || u.capacityCells === 0 ? null : pct(u.usedCells, u.capacityCells),
  }));
}

/**
 * Ponctualité du transport : part des passages à l'heure sur les passages
 * pointés. Les statuts « non récupéré » et « incident » comptent comme des
 * défauts de service — ils décrivent exactement ce que l'indicateur surveille.
 */
export function transportPunctuality(counts: Record<string, number>): number | null {
  const total = Object.values(counts).reduce((n, v) => n + v, 0);
  if (total === 0) return null;
  const onTime = (counts.PRESENT ?? 0) + (counts.BOARDED ?? 0) + (counts.DROPPED ?? 0);
  return pct(onTime, total);
}
