import 'server-only';
import type { Prisma } from '@/lib/db';
import { loadDemand } from '@/lib/timetable-demand';

type Tx = Prisma.TransactionClient;

export type SubjectCoverageRow = {
  subjectId: string;
  label: string;
  /**
   * Heures/semaine réellement demandées, calculées classe par classe et
   * dédoublements compris (deux demi-groupes = deux heures-professeur).
   */
  demandHours: number;
  /** Heures/semaine offertes par les profs de la matière (Σ heures contractuelles). */
  supplyHours: number;
  /** Nombre de profs pouvant enseigner la matière (spécialité). */
  teacherCount: number;
  /** supply − demand : négatif = déficit, positif = marge. */
  gap: number;
};

/**
 * Couverture horaire par matière : compare le volume d'heures requis par le
 * programme (curriculum × nombre de classes) au volume d'heures disponible des
 * enseignants spécialistes de la matière (heures contractuelles). À appeler dans
 * un `withTenant`.
 */
export async function loadSubjectCoverage(
  tx: Tx,
  academicYearId: string,
  /** Borne le calcul à un cycle — mêmes raisons que computeKpis. */
  cycleId?: string | null,
): Promise<SubjectCoverageRow[]> {
  const [subjects, demandResult, specialties] = await Promise.all([
    tx.subject.findMany({ select: { id: true, label: true } }),
    // La demande vient de lib/timetable-demand : cascade affectation → filière
    // → niveau, et une séance dédoublée compte par groupe. L'ancien calcul
    // « programme du niveau × nombre de classes » rendait 0 pour tout le lycée
    // et ignorait les dédoublements.
    loadDemand(tx, academicYearId, cycleId),
    // Offre bornée au cycle : compter les heures contractuelles de tous les
    // enseignants de l'établissement face à la demande d'un seul cycle
    // afficherait une marge qui n'existe pas.
    tx.teacherSpecialty.findMany({
      where: cycleId ? { teacher: { teacherCycles: { some: { cycleId } } } } : {},
      select: {
        subjectId: true,
        teacher: { select: { id: true, contractualHoursPerWeek: true, type: true, deletedAt: true } },
      },
    }),
  ]);

  const labelById = new Map(subjects.map((s) => [s.id, s.label]));
  const demand = demandResult.bySubject;

  // Offre : par matière, somme des heures contractuelles des profs spécialistes
  // (un prof n'est compté qu'une fois par matière).
  const teachersBySubject = new Map<string, Map<string, number>>();
  for (const sp of specialties) {
    const tch = sp.teacher;
    if (!tch || tch.deletedAt || tch.type !== 'TEACHER') continue;
    const m = teachersBySubject.get(sp.subjectId) ?? new Map<string, number>();
    m.set(tch.id, tch.contractualHoursPerWeek ?? 0);
    teachersBySubject.set(sp.subjectId, m);
  }

  const subjectIds = new Set<string>([...demand.keys(), ...teachersBySubject.keys()]);
  const rows: SubjectCoverageRow[] = [];
  for (const sid of subjectIds) {
    const demandHours = demand.get(sid) ?? 0;
    const teachers = teachersBySubject.get(sid);
    const supplyHours = teachers ? [...teachers.values()].reduce((a, b) => a + b, 0) : 0;
    rows.push({
      subjectId: sid,
      label: labelById.get(sid) ?? '—',
      demandHours,
      supplyHours,
      teacherCount: teachers ? teachers.size : 0,
      gap: supplyHours - demandHours,
    });
  }
  // Déficits d'abord (gap croissant), puis par matière.
  rows.sort((a, b) => a.gap - b.gap || a.label.localeCompare(b.label));
  return rows;
}
