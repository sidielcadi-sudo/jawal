import 'server-only';
import type { Prisma } from '@/lib/db';
import { teacherCoversCycle } from '@/lib/teacher-cycle-rule';

type Tx = Prisma.TransactionClient;

export type AllocationReason =
  | 'PINNED' // affectation déjà existante (non modifiable)
  | 'PRIORITY' // prof servi car la classe est dans ses « classes prioritaires »
  | 'BALANCED' // choisi par équilibrage de charge
  | 'NO_SPECIALIST' // aucun prof spécialiste de la matière → à régler à la main
  | 'OVER_CAPACITY'; // tous les spécialistes sont pleins (heures contractuelles dépassées)

export type AllocationProposal = {
  classId: string;
  className: string;
  subjectId: string;
  subjectLabel: string;
  hours: number;
  teacherId: string | null;
  teacherName: string | null;
  reason: AllocationReason;
  pinned: boolean;
};

export type TeacherLoad = {
  teacherId: string;
  name: string;
  contractual: number | null;
  assigned: number; // charge totale après proposition (heures)
};

export type AllocationPlan = {
  proposals: AllocationProposal[];
  teacherLoads: TeacherLoad[];
  /** Candidats spécialistes par besoin (pour le menu déroulant de l'aperçu). */
  candidatesByKey: Record<string, { id: string; name: string }[]>;
};

/** Clé d'un besoin (classe × matière). */
const keyOf = (classId: string, subjectId: string) => `${classId}|${subjectId}`;

/**
 * Propose une allocation prof→(classe×matière) à partir du programme, des
 * spécialités, des heures contractuelles et des classes prioritaires.
 *
 * Le programme d'une classe vient de sa **filière** quand elle en a une, du
 * niveau sinon. Au lycée marocain, `CurriculumSubject` est vide : n'interroger
 * que le niveau ne proposait aucune ligne, et le bouton « Pré-affecter
 * automatiquement » restait sans effet.
 *
 * **Lecture seule** (aucune écriture). Respecte les affectations existantes
 * (épinglées). À appeler dans un `withTenant`.
 */
export async function proposeAllocation(
  tx: Tx,
  academicYearId: string,
  classIds: string[],
): Promise<AllocationPlan> {
  if (classIds.length === 0) return { proposals: [], teacherLoads: [], candidatesByKey: {} };

  const classes = await tx.class.findMany({
    where: { id: { in: classIds }, academicYearId, deletedAt: null },
    select: { id: true, name: true, nameAr: true, levelId: true, trackId: true, level: { select: { cycleId: true } } },
  });
  const levelIds = [...new Set(classes.map((c) => c.levelId))];
  const trackIds = [...new Set(classes.map((c) => c.trackId).filter((x): x is string => !!x))];

  const [curriculum, trackRows] = await Promise.all([
    tx.curriculumSubject.findMany({
      where: { levelId: { in: levelIds } },
      select: {
        levelId: true,
        subjectId: true,
        weeklyHours: true,
        subject: { select: { label: true, labelAr: true } },
      },
    }),
    trackIds.length
      ? tx.trackSubjectCoefficient.findMany({
          where: { trackId: { in: trackIds } },
          select: {
            trackId: true,
            subjectId: true,
            weeklyHours: true,
            subject: { select: { label: true, labelAr: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  /** Besoin d'une matière pour une classe : matière, volume, libellé. */
  type ProgramLine = {
    subjectId: string;
    weeklyHours: number;
    subject: { label: string; labelAr: string | null };
  };

  const needsByLevel = new Map<string, ProgramLine[]>();
  for (const c of curriculum) {
    const arr = needsByLevel.get(c.levelId) ?? [];
    arr.push(c);
    needsByLevel.set(c.levelId, arr);
  }
  const needsByTrack = new Map<string, ProgramLine[]>();
  for (const r of trackRows) {
    const arr = needsByTrack.get(r.trackId) ?? [];
    // Une matière déclarée sans volume ne se place pas : on la porte à 0 h
    // plutôt que de l'écarter, pour qu'elle reste visible dans le plan.
    arr.push({ subjectId: r.subjectId, weeklyHours: r.weeklyHours ?? 0, subject: r.subject });
    needsByTrack.set(r.trackId, arr);
  }

  /** Programme applicable à une classe : la filière prime sur le niveau. */
  const programOf = (cls: { levelId: string; trackId: string | null }): ProgramLine[] =>
    (cls.trackId ? needsByTrack.get(cls.trackId) : undefined) ??
    needsByLevel.get(cls.levelId) ??
    [];

  const teachers = await tx.person.findMany({
    where: { type: 'TEACHER', deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      contractualHoursPerWeek: true,
      teacherSpecialties: { select: { subjectId: true } },
      teacherPriorityClasses: { select: { classId: true } },
      teacherCycles: { select: { cycleId: true } },
    },
  });

  // Charge déjà engagée (toutes classes de l'année) → capacité restante.
  const yearAssignments = await tx.teacherAssignment.findMany({
    where: { academicYearId },
    select: {
      teacherId: true,
      subjectId: true,
      classId: true,
      hoursPerWeek: true,
      class: { select: { levelId: true } },
    },
  });
  // Charge déjà engagée : le volume négocié sur l'affectation, à défaut celui
  // du programme du niveau. La filière n'est pas consultée ici — cette charge
  // porte sur TOUTES les classes de l'année, dont on n'a pas la filière.
  const curHoursByKey = new Map(
    curriculum.map((c) => [`${c.levelId}|${c.subjectId}`, c.weeklyHours]),
  );
  const loadByTeacher = new Map<string, number>();
  for (const a of yearAssignments) {
    const h = a.hoursPerWeek ?? curHoursByKey.get(`${a.class.levelId}|${a.subjectId}`) ?? 0;
    loadByTeacher.set(a.teacherId, (loadByTeacher.get(a.teacherId) ?? 0) + h);
  }

  type T = {
    id: string;
    name: string;
    contractual: number | null;
    capacity: number; // contractual ?? 0
    remaining: number;
    specialties: Set<string>;
    priority: Set<string>;
    /** Cycles de la fiche (« Niveaux enseignés »). */
    cycles: Set<string>;
  };
  const state = new Map<string, T>();
  for (const t of teachers) {
    const capacity = t.contractualHoursPerWeek ?? 0;
    state.set(t.id, {
      id: t.id,
      name: `${t.lastName} ${t.firstName}`,
      contractual: t.contractualHoursPerWeek,
      capacity,
      remaining: capacity - (loadByTeacher.get(t.id) ?? 0),
      specialties: new Set(t.teacherSpecialties.map((s) => s.subjectId)),
      priority: new Set(t.teacherPriorityClasses.map((p) => p.classId)),
      cycles: new Set(t.teacherCycles.map((c) => c.cycleId)),
    });
  }

  // Affectations existantes du périmètre = épinglages.
  const pinned = await tx.teacherAssignment.findMany({
    where: { classId: { in: classIds }, academicYearId },
    select: {
      classId: true,
      subjectId: true,
      teacherId: true,
      hoursPerWeek: true,
      teacher: { select: { firstName: true, lastName: true } },
      subject: { select: { label: true, labelAr: true } },
    },
  });
  const pinnedSet = new Set(pinned.map((p) => keyOf(p.classId, p.subjectId)));

  const proposals: AllocationProposal[] = [];
  const candidatesByKey: Record<string, { id: string; name: string }[]> = {};

  // 1) Lignes épinglées (non modifiables).
  for (const p of pinned) {
    proposals.push({
      classId: p.classId,
      className: classes.find((c) => c.id === p.classId)?.name ?? '',
      subjectId: p.subjectId,
      subjectLabel: p.subject.label,
      hours: p.hoursPerWeek ?? 0,
      teacherId: p.teacherId,
      teacherName: `${p.teacher.lastName} ${p.teacher.firstName}`,
      reason: 'PINNED',
      pinned: true,
    });
  }

  // 2) Besoins libres = (classe × matière du programme) non épinglés.
  type Need = {
    classId: string;
    className: string;
    subjectId: string;
    subjectLabel: string;
    hours: number;
    cycleId: string | null;
  };
  const needs: Need[] = [];
  for (const cls of classes) {
    for (const n of programOf(cls)) {
      if (pinnedSet.has(keyOf(cls.id, n.subjectId))) continue;
      needs.push({
        classId: cls.id,
        className: cls.name,
        subjectId: n.subjectId,
        subjectLabel: n.subject.label,
        hours: n.weeklyHours,
        cycleId: cls.level.cycleId ?? null,
      });
    }
  }

  // Spécialité ET cycle : un professeur de collège n'est pas proposé au lycée,
  // sauf si sa fiche lui ouvre les deux cycles.
  const candidatesFor = (subjectId: string, cycleId: string | null) =>
    [...state.values()].filter((t) => t.specialties.has(subjectId) && teacherCoversCycle(t.cycles, cycleId));
  // Au sein de chaque passe, traiter d'abord les matières rares (moins de spécialistes).
  needs.sort((a, b) => candidatesFor(a.subjectId, a.cycleId).length - candidatesFor(b.subjectId, b.cycleId).length);

  // Candidats par besoin (pour le menu déroulant de l'aperçu).
  for (const need of needs) {
    candidatesByKey[keyOf(need.classId, need.subjectId)] = candidatesFor(need.subjectId, need.cycleId).map(
      (c) => ({ id: c.id, name: c.name }),
    );
  }

  const resolved = new Set<string>();
  const assign = (need: Need, chosen: T | null, reason: AllocationReason) => {
    if (chosen) chosen.remaining -= need.hours;
    proposals.push({
      ...need,
      teacherId: chosen?.id ?? null,
      teacherName: chosen?.name ?? null,
      reason,
      pinned: false,
    });
    resolved.add(keyOf(need.classId, need.subjectId));
  };

  // ── Passe 1 : classes prioritaires d'abord. On réserve la capacité des profs
  //    pour LEURS classes prioritaires AVANT tout équilibrage des classes non
  //    prioritaires (sinon l'équilibrage peut épuiser un prof prioritaire avant
  //    d'atteindre ses propres classes).
  for (const need of needs) {
    const priorityWithCap = candidatesFor(need.subjectId, need.cycleId).filter(
      (c) => c.priority.has(need.classId) && c.remaining >= need.hours,
    );
    if (priorityWithCap.length > 0) {
      const chosen = priorityWithCap.sort((a, b) => b.remaining - a.remaining)[0]!;
      assign(need, chosen, 'PRIORITY');
    }
  }

  // ── Passe 2 : besoins restants (équilibrage de charge / surcharge / sans spécialiste).
  for (const need of needs) {
    if (resolved.has(keyOf(need.classId, need.subjectId))) continue;
    const cands = candidatesFor(need.subjectId, need.cycleId);
    if (cands.length === 0) {
      assign(need, null, 'NO_SPECIALIST');
      continue;
    }
    const withCap = cands.filter((c) => c.remaining >= need.hours);
    if (withCap.length > 0) {
      // Un prof prioritaire non servi en passe 1 (capacité) reste préféré s'il a de la place.
      const prio = withCap.filter((c) => c.priority.has(need.classId));
      const chosen = (prio.length > 0 ? prio : withCap).sort(
        (a, b) => b.remaining - a.remaining,
      )[0]!;
      assign(need, chosen, prio.length > 0 ? 'PRIORITY' : 'BALANCED');
    } else {
      // Tous pleins → le moins surchargé, signalé.
      const chosen = cands.sort((a, b) => b.remaining - a.remaining)[0]!;
      assign(need, chosen, 'OVER_CAPACITY');
    }
  }

  // Tri d'affichage : par classe puis matière.
  proposals.sort(
    (a, b) =>
      a.className.localeCompare(b.className) || a.subjectLabel.localeCompare(b.subjectLabel),
  );

  const teacherLoads: TeacherLoad[] = [...state.values()]
    .map((t) => ({
      teacherId: t.id,
      name: t.name,
      contractual: t.contractual,
      assigned: t.capacity - t.remaining,
    }))
    .filter((t) => t.assigned > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  return { proposals, teacherLoads, candidatesByKey };
}

export type AllocationDecision = {
  classId: string;
  subjectId: string;
  teacherId: string;
  hours: number;
};

/**
 * Applique des décisions d'allocation : crée les `TeacherAssignment`
 * correspondantes. Respecte l'unicité (les épinglages existants ne sont jamais
 * écrasés grâce à `skipDuplicates`). Renvoie le nombre créé.
 */
export async function applyAllocation(
  tx: Tx,
  tenantId: string,
  academicYearId: string,
  decisions: AllocationDecision[],
): Promise<number> {
  if (decisions.length === 0) return 0;
  const invalid = await cycleViolations(tx, decisions);
  if (invalid.length > 0) {
    throw new Error(
      `${invalid.length} affectation(s) hors des cycles déclarés dans la fiche de l'enseignant : ${invalid.slice(0, 3).join(' ; ')}${invalid.length > 3 ? '…' : ''}.`,
    );
  }
  const res = await tx.teacherAssignment.createMany({
    data: decisions.map((d) => ({
      tenantId,
      academicYearId,
      classId: d.classId,
      subjectId: d.subjectId,
      teacherId: d.teacherId,
      hoursPerWeek: d.hours,
    })),
    skipDuplicates: true,
  });
  return res.count;
}

/**
 * Affectations proposées qui sortent des cycles de la fiche de l'enseignant.
 * Renvoie un libellé lisible par infraction : « Nom Prénom → Classe (Cycle) ».
 */
export async function cycleViolations(
  tx: Tx,
  pairs: ReadonlyArray<{ teacherId: string; classId: string }>,
): Promise<string[]> {
  if (pairs.length === 0) return [];
  const [teachers, classes] = await Promise.all([
    tx.person.findMany({
      where: { id: { in: [...new Set(pairs.map((p) => p.teacherId))] } },
      select: { id: true, firstName: true, lastName: true, teacherCycles: { select: { cycleId: true } } },
    }),
    tx.class.findMany({
      where: { id: { in: [...new Set(pairs.map((p) => p.classId))] } },
      select: { id: true, name: true, level: { select: { cycleId: true, cycle: { select: { label: true } } } } },
    }),
  ]);
  const teacherById = new Map(teachers.map((t) => [t.id, t]));
  const classById = new Map(classes.map((c) => [c.id, c]));
  const out: string[] = [];
  for (const p of pairs) {
    const t = teacherById.get(p.teacherId);
    const c = classById.get(p.classId);
    if (!t || !c) continue;
    if (teacherCoversCycle(t.teacherCycles.map((x) => x.cycleId), c.level.cycleId)) continue;
    out.push(`${t.lastName} ${t.firstName} → ${c.name} (${c.level.cycle.label})`);
  }
  return out;
}
