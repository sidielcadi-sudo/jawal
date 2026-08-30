import 'server-only';
import { categoryOf } from '@/lib/attendance-category';

type Tx = Parameters<Parameters<typeof import('@/lib/db').withTenant>[1]>[0];

/** Compteurs mensuels d'assiduité, sur les mois de l'année scolaire. */
export type MonthlyAttendance = {
  present: number[];
  absJustified: number[];
  absUnjustified: number[];
  lateJustified: number[];
  lateUnjustified: number[];
  /** Taux d'absence du mois, en % des pointages ; null si aucun pointage. */
  absenceRate: (number | null)[];
};

export type TopStudent = {
  studentId: string;
  name: string;
  levelLabel: string;
  className: string;
  count: number;
};

/**
 * Assiduité mensuelle d'un établissement.
 *
 * Justifié / non justifié se lit sur la justification rattachée au pointage :
 * une justification APPROVED rend l'événement justifié, tout le reste (en
 * attente, refusée, absente) le laisse non justifié — c'est la règle déjà
 * appliquée par la file des justificatifs.
 *
 * Le taux d'absence rapporte les absences (ABSENT + EXCLUSION, les deux seules
 * catégories qui diminuent la présence) au total des pointages du mois.
 */
export async function monthlyAttendance(
  tx: Tx,
  monthCount: number,
  yearStart: Date | null,
): Promise<MonthlyAttendance> {
  const empty = () => Array.from({ length: monthCount }, () => 0);
  const out: MonthlyAttendance = {
    present: empty(),
    absJustified: empty(),
    absUnjustified: empty(),
    lateJustified: empty(),
    lateUnjustified: empty(),
    absenceRate: Array.from({ length: monthCount }, () => null),
  };
  if (!yearStart) return out;

  const y0 = yearStart.getUTCFullYear();
  const m0 = yearStart.getUTCMonth();
  const start = new Date(Date.UTC(y0, m0, 1));
  const end = new Date(Date.UTC(y0, m0 + monthCount, 1));

  const records = await tx.attendanceRecord.findMany({
    where: { session: { finalizedAt: { not: null }, date: { gte: start, lt: end } } },
    select: {
      status: true,
      infirmary: true,
      punishment: true,
      exclusion: true,
      session: { select: { date: true } },
      justification: { select: { status: true } },
    },
  });

  const totals = empty();
  for (const r of records) {
    const d = r.session.date;
    const k = (d.getUTCFullYear() - y0) * 12 + (d.getUTCMonth() - m0);
    if (k < 0 || k >= monthCount) continue;
    totals[k]! += 1;

    const cat = categoryOf(r);
    const justified = r.justification?.status === 'APPROVED';
    if (cat === 'ABSENT' || cat === 'EXCLUSION') {
      if (justified) out.absJustified[k]! += 1;
      else out.absUnjustified[k]! += 1;
    } else if (cat === 'LATE') {
      if (justified) out.lateJustified[k]! += 1;
      else out.lateUnjustified[k]! += 1;
      out.present[k]! += 1; // un retard reste une présence
    } else {
      out.present[k]! += 1;
    }
  }

  for (let k = 0; k < monthCount; k++) {
    const total = totals[k]!;
    out.absenceRate[k] =
      total > 0 ? ((out.absJustified[k]! + out.absUnjustified[k]!) / total) * 100 : null;
  }
  return out;
}

/**
 * Palmarès des élèves les plus absents (ou les plus en retard) à ce jour.
 *
 * `kind` choisit la mesure ; le classement est décroissant et tronqué à
 * `limit`. Les élèves sans aucun événement n'apparaissent pas.
 */
export async function topStudents(
  tx: Tx,
  kind: 'ABSENCE' | 'LATE',
  limit: number,
  locale: string,
  displayName: (p: {
    firstName: string;
    lastName: string;
    firstNameAr: string | null;
    lastNameAr: string | null;
  }) => string,
  labelOf: (label: string, labelAr: string | null) => string,
): Promise<TopStudent[]> {
  void locale;
  const year = await tx.academicYear.findFirst({
    where: { active: true },
    select: { id: true, startDate: true, endDate: true },
  });
  if (!year) return [];

  const records = await tx.attendanceRecord.findMany({
    where: {
      session: { finalizedAt: { not: null }, date: { gte: year.startDate, lte: new Date() } },
    },
    select: {
      studentId: true,
      status: true,
      infirmary: true,
      punishment: true,
      exclusion: true,
    },
  });

  const counts = new Map<string, number>();
  for (const r of records) {
    const cat = categoryOf(r);
    const hit = kind === 'LATE' ? cat === 'LATE' : cat === 'ABSENT' || cat === 'EXCLUSION';
    if (hit) counts.set(r.studentId, (counts.get(r.studentId) ?? 0) + 1);
  }
  const ranked = [...counts].sort((a, b) => b[1] - a[1]).slice(0, limit);
  if (ranked.length === 0) return [];

  const students = await tx.person.findMany({
    where: { id: { in: ranked.map(([id]) => id) } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      firstNameAr: true,
      lastNameAr: true,
      studentClasses: {
        where: { unenrolledAt: null, class: { academicYearId: year.id } },
        take: 1,
        select: {
          class: {
            select: {
              name: true,
              nameAr: true,
              level: { select: { label: true, labelAr: true } },
            },
          },
        },
      },
    },
  });
  const byId = new Map(students.map((s) => [s.id, s]));

  return ranked.flatMap(([id, count]) => {
    const s = byId.get(id);
    if (!s) return [];
    const cls = s.studentClasses[0]?.class;
    return [
      {
        studentId: id,
        name: displayName(s),
        levelLabel: cls ? labelOf(cls.level.label, cls.level.labelAr) : '—',
        className: cls ? labelOf(cls.name, cls.nameAr) : '—',
        count,
      },
    ];
  });
}
