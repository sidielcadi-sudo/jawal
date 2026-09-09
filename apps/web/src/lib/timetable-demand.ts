import 'server-only';
import type { Prisma } from '@/lib/db';
import { resolveWeeklyHours, type HoursBySubject } from '@/lib/timetable-load';

type Tx = Prisma.TransactionClient;

/**
 * Demande horaire d'un périmètre : combien d'heures de cours chaque matière
 * réclame réellement, une fois les classes et les dédoublements comptés.
 *
 * Le calcul précédent était « heures du programme du NIVEAU × nombre de classes
 * du niveau ». Deux défauts :
 *
 *  1. Au lycée, le programme n'est pas porté par le niveau mais par la filière.
 *     `CurriculumSubject` y étant vide, la demande tombait à zéro et tous les
 *     indicateurs du cycle s'affichaient à 0 ou en déficit.
 *  2. Deux classes d'un même niveau peuvent suivre des programmes différents
 *     (TC Sciences 25 h, TC Lettres 21 h). Multiplier un programme par un
 *     effectif de classes suppose qu'elles sont identiques.
 *
 * On calcule donc **classe par classe**, et une séance dédoublée compte pour
 * autant de séances que de groupes : deux demi-groupes de français occupent
 * deux professeurs et deux salles pendant la même heure. C'est bien deux
 * heures de charge, pas une.
 *
 * Le calcul part du **programme** de la classe, et de lui seul. Ni la liste des
 * matières ni leurs volumes ne viennent des affectations de professeurs :
 *
 *  - une matière au programme sans enseignant doit peser dans la demande,
 *    c'est précisément le déficit que la couverture sert à révéler ;
 *  - un volume négocié sur l'affectation ne fait pas le programme. La colonne
 *    s'intitule « Programme » : y afficher 4 h parce qu'un enseignant en assure
 *    4 alors que la filière en prescrit 3 dit le contraire de son étiquette.
 *
 * L'écart entre les deux reste une information utile — il est remonté dans
 * `mismatches` plutôt que dissous dans le total. Le solveur, lui, garde sa
 * propre cascade (cf. `lib/timetable-load`) : pour placer des séances, c'est
 * bien le volume de l'affectation qui commande.
 */

export type ClassDemandRow = {
  classId: string;
  className: string;
  subjectId: string;
  /** Heures du programme pour cette classe et cette matière. */
  programHours: number;
  /** Nombre de groupes de cette matière. 1 = classe entière. */
  groupCount: number;
  /**
   * Heures effectivement dédoublées, sur `programHours`. Égal à
   * `programHours` quand le dédoublement est permanent.
   */
  splitHours: number;
  /**
   * Charge réelle en heures-professeur :
   * `(programHours − splitHours) + splitHours × groupCount`.
   */
  hours: number;
};

export type DemandResult = {
  rows: ClassDemandRow[];
  /** Total par matière, dédoublements compris. */
  bySubject: Map<string, number>;
  /** Total par classe (sans multiplier par les groupes : l'occupation de la classe). */
  classHours: Map<string, number>;
  /** Heures ajoutées par les dédoublements — la part invisible auparavant. */
  splitExtraHours: number;
  totalHours: number;
  /**
   * Affectations dont le volume contredit le programme. Ce n'est pas une erreur
   * fatale — un établissement peut assumer une heure de plus — mais une
   * divergence à connaître : le solveur placera le volume de l'affectation,
   * pas celui affiché ici.
   */
  mismatches: DemandMismatch[];
};

export type DemandMismatch = {
  classId: string;
  className: string;
  subjectId: string;
  programHours: number;
  assignedHours: number;
};

/**
 * Agrège la demande. Fonction pure : l'appelant fournit ce qu'il a lu.
 *
 * `groupCounts` et `splitHours` sont indexés par `classId|subjectId`. Une
 * matière sans entrée dans `groupCounts` compte pour un seul groupe — la classe
 * entière. Une matière dédoublée sans entrée dans `splitHours` l'est sur la
 * totalité de son volume.
 *
 * Un dédoublement partiel se calcule `(volume − dédoublé) + dédoublé × groupes` :
 * les heures en classe entière restent simples, seules les heures dédoublées
 * comptent plusieurs fois. Multiplier tout le volume surestimait la charge dès
 * qu'une seule heure sur trois se faisait en demi-groupes.
 */
export function aggregateDemand(
  perClass: Array<{
    classId: string;
    className: string;
    subjectHours: Array<{ subjectId: string; hours: number }>;
  }>,
  groupCounts: Map<string, number>,
  mismatches: DemandMismatch[] = [],
  splitHours: Map<string, number | null> = new Map(),
): DemandResult {
  const rows: ClassDemandRow[] = [];
  const bySubject = new Map<string, number>();
  const classHours = new Map<string, number>();
  let splitExtraHours = 0;

  for (const c of perClass) {
    for (const s of c.subjectHours) {
      const key = `${c.classId}|${s.subjectId}`;
      // Un groupe unique n'est pas un dédoublement : la classe entière suffit.
      const groupCount = Math.max(1, groupCounts.get(key) ?? 1);
      // Part dédoublée : tout le volume par défaut, bornée à ce volume — une
      // saisie de 5 h dédoublées sur une matière à 3 h serait une aberration
      // qu'il vaut mieux plafonner que propager.
      const declaredSplit = splitHours.get(key);
      const split =
        groupCount > 1
          ? Math.min(s.hours, Math.max(0, declaredSplit ?? s.hours))
          : 0;
      const hours = s.hours - split + split * groupCount;
      rows.push({
        classId: c.classId,
        className: c.className,
        subjectId: s.subjectId,
        programHours: s.hours,
        groupCount,
        splitHours: split,
        hours,
      });
      bySubject.set(s.subjectId, (bySubject.get(s.subjectId) ?? 0) + hours);
      // L'occupation de la classe ne double pas : ses élèves ne sont qu'à un
      // endroit à la fois, même répartis en deux salles.
      classHours.set(c.classId, (classHours.get(c.classId) ?? 0) + s.hours);
      splitExtraHours += hours - s.hours;
    }
  }

  return {
    rows,
    bySubject,
    classHours,
    splitExtraHours,
    totalHours: [...bySubject.values()].reduce((a, b) => a + b, 0),
    mismatches,
  };
}

/**
 * Charge la demande d'un cycle (ou de l'établissement si `cycleId` est nul).
 *
 * Les heures d'une classe viennent de la cascade habituelle — affectation,
 * puis filière, puis programme du niveau (cf. `lib/timetable-load`).
 */
export async function loadDemand(
  tx: Tx,
  academicYearId: string,
  cycleId?: string | null,
): Promise<DemandResult> {
  const classes = await tx.class.findMany({
    where: {
      academicYearId,
      deletedAt: null,
      ...(cycleId ? { level: { cycleId } } : {}),
    },
    select: { id: true, name: true, levelId: true, trackId: true },
  });
  if (classes.length === 0) return aggregateDemand([], new Map());

  const levelIds = [...new Set(classes.map((c) => c.levelId))];
  const trackIds = [...new Set(classes.map((c) => c.trackId).filter((x): x is string => !!x))];

  const [assignments, curriculum, trackRows, groups] = await Promise.all([
    // Les affectations ne servent qu'à écraser un volume : un volume négocié
    // avec l'enseignant fait autorité sur celui du programme.
    tx.teacherAssignment.findMany({
      where: { academicYearId, classId: { in: classes.map((c) => c.id) } },
      select: { classId: true, subjectId: true, hoursPerWeek: true },
    }),
    tx.curriculumSubject.findMany({
      where: { levelId: { in: levelIds } },
      select: { levelId: true, subjectId: true, weeklyHours: true },
    }),
    trackIds.length
      ? tx.trackSubjectCoefficient.findMany({
          where: { trackId: { in: trackIds } },
          select: { trackId: true, subjectId: true, weeklyHours: true },
        })
      : Promise.resolve([]),
    // `splitHours` appartient au couple (classe, matière) : tous les groupes
    // d'une matière portent la même valeur. On prend le maximum, pour rester
    // juste si une divergence s'était glissée en base.
    tx.classGroup.groupBy({
      by: ['classId', 'subjectId'],
      where: { classId: { in: classes.map((c) => c.id) } },
      _count: { _all: true },
      _max: { splitHours: true },
    }),
  ]);

  const curriculumByLevel = new Map<string, HoursBySubject>();
  for (const c of curriculum) {
    const m = curriculumByLevel.get(c.levelId) ?? new Map();
    m.set(c.subjectId, c.weeklyHours);
    curriculumByLevel.set(c.levelId, m);
  }
  const trackByTrack = new Map<string, HoursBySubject>();
  for (const r of trackRows) {
    const m = trackByTrack.get(r.trackId) ?? new Map();
    m.set(r.subjectId, r.weeklyHours);
    trackByTrack.set(r.trackId, m);
  }

  const groupCounts = new Map<string, number>();
  const splitHoursByKey = new Map<string, number | null>();
  for (const g of groups) {
    // Les groupes polyvalents (sans matière) ne dédoublent pas une matière
    // précise : ils ne comptent pas dans la charge.
    if (!g.subjectId) continue;
    const key = `${g.classId}|${g.subjectId}`;
    groupCounts.set(key, g._count._all);
    splitHoursByKey.set(key, g._max.splitHours);
  }

  /** Volume négocié sur l'affectation — sert à détecter les divergences. */
  const assignmentHours = new Map<string, number | null>();
  for (const a of assignments) assignmentHours.set(`${a.classId}|${a.subjectId}`, a.hoursPerWeek);
  const mismatches: DemandMismatch[] = [];

  const perClass: Array<{
    classId: string;
    className: string;
    subjectHours: Array<{ subjectId: string; hours: number }>;
  }> = [];

  for (const cls of classes) {
    // Programme de la classe : la filière au lycée, le niveau ailleurs.
    const program = cls.trackId
      ? trackByTrack.get(cls.trackId)
      : curriculumByLevel.get(cls.levelId);
    if (!program) continue;

    const subjectHours: Array<{ subjectId: string; hours: number }> = [];
    for (const [subjectId] of program) {
      const key = `${cls.id}|${subjectId}`;
      // Volume du PROGRAMME : l'affectation ne l'écrase pas ici.
      const resolved = resolveWeeklyHours(
        { id: key, teacherId: '', subjectId, subjectLabel: '', hoursPerWeek: null },
        cls.trackId ? (trackByTrack.get(cls.trackId) ?? null) : null,
        curriculumByLevel.get(cls.levelId) ?? new Map(),
      );
      subjectHours.push({ subjectId, hours: resolved.hours });

      const assigned = assignmentHours.get(key);
      if (assigned != null && assigned !== resolved.hours) {
        mismatches.push({
          classId: cls.id,
          className: cls.name,
          subjectId,
          programHours: resolved.hours,
          assignedHours: assigned,
        });
      }
    }
    perClass.push({ classId: cls.id, className: cls.name, subjectHours });
  }

  return aggregateDemand(perClass, groupCounts, mismatches, splitHoursByKey);
}
