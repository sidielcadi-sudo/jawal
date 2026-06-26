import 'server-only';
import type { Prisma } from '@/lib/db';
import { computeMention, type Mention } from '@/lib/grades';
import { loadBulletinData } from '@/lib/bulletin-data';
import { tallyAttendance } from '@/lib/attendance-category';

type Tx = Prisma.TransactionClient;

export type DocumentType =
  | 'CERTIFICAT_SCOLARITE'
  | 'ATTESTATION_PRESENCE'
  | 'ATTESTATION_PAIEMENT'
  | 'ATTESTATION_REUSSITE';

export const DOCUMENT_TYPES: DocumentType[] = [
  'CERTIFICAT_SCOLARITE',
  'ATTESTATION_PRESENCE',
  'ATTESTATION_PAIEMENT',
  'ATTESTATION_REUSSITE',
];

/** Documents adossés à une période (sinon à l'année). */
export function documentNeedsPeriod(type: DocumentType): boolean {
  return type === 'ATTESTATION_PRESENCE' || type === 'ATTESTATION_REUSSITE';
}

export type DocumentData = {
  type: DocumentType;
  student: { firstName: string; lastName: string; birthDate: Date | null };
  yearLabel: string;
  className: string | null;
  cycleLabel: string | null;
  levelLabel: string | null;
  attendance?: { present: number; total: number; rate: number | null; periodLabel: string };
  finance?: { totalDue: number; totalPaid: number; balance: number };
  /** Échéancier détaillé (attestation de paiement). */
  schedule?: { label: string; dueDate: Date; amount: number; paid: number; status: string }[];
  result?: {
    periodLabel: string;
    generalAverage: number | null;
    mention: Mention;
    rank: number | null;
    ratedStudents: number;
  };
};

/**
 * Charge les données d'un document officiel pour un élève. Selon le type,
 * agrège présence / finance / moyenne. Renvoie null si les prérequis ne sont
 * pas réunis (ex. élève non inscrit, période absente, aucune note).
 * À appeler dans un `withTenant`.
 */
export async function loadDocumentData(
  tx: Tx,
  opts: { studentId: string; type: DocumentType; yearId?: string; periodId?: string },
): Promise<DocumentData | null> {
  const student = await tx.person.findUnique({
    where: { id: opts.studentId },
    select: { id: true, firstName: true, lastName: true, birthDate: true, type: true },
  });
  if (!student || student.type !== 'STUDENT') return null;

  // Année : si un period est fourni, on prend SON année ; sinon yearId ; sinon active.
  let year: { id: string; label: string; startDate: Date; endDate: Date } | null = null;
  let period: { id: string; label: string; startDate: Date; endDate: Date } | null = null;
  if (opts.periodId) {
    const p = await tx.period.findUnique({
      where: { id: opts.periodId },
      select: {
        id: true,
        label: true,
        startDate: true,
        endDate: true,
        academicYear: { select: { id: true, label: true, startDate: true, endDate: true } },
      },
    });
    if (!p) return null;
    period = { id: p.id, label: p.label, startDate: p.startDate, endDate: p.endDate };
    year = p.academicYear;
  } else {
    year = await tx.academicYear.findFirst({
      where: opts.yearId ? { id: opts.yearId } : { active: true },
      select: { id: true, label: true, startDate: true, endDate: true },
    });
  }
  if (!year) return null;

  // Classe de l'élève pour cette année.
  const sc = await tx.studentClass.findFirst({
    where: { studentId: opts.studentId, unenrolledAt: null, class: { academicYearId: year.id } },
    select: {
      classId: true,
      class: {
        select: { name: true, level: { select: { label: true, cycle: { select: { label: true } } } } },
      },
    },
  });

  const base: DocumentData = {
    type: opts.type,
    student: { firstName: student.firstName, lastName: student.lastName, birthDate: student.birthDate },
    yearLabel: year.label,
    className: sc?.class.name ?? null,
    cycleLabel: sc?.class.level.cycle.label ?? null,
    levelLabel: sc?.class.level.label ?? null,
  };

  switch (opts.type) {
    case 'CERTIFICAT_SCOLARITE': {
      // Doit être inscrit dans une classe pour l'année.
      if (!sc) return null;
      return base;
    }

    case 'ATTESTATION_PRESENCE': {
      if (!period) return null;
      const records = await tx.attendanceRecord.findMany({
        where: {
          studentId: opts.studentId,
          session: {
            finalizedAt: { not: null },
            date: { gte: period.startDate, lte: period.endDate },
          },
        },
        select: { status: true, infirmary: true, punishment: true, exclusion: true },
      });
      const { present, total, rate } = tallyAttendance(records);
      return {
        ...base,
        attendance: {
          present,
          total,
          rate,
          periodLabel: period.label,
        },
      };
    }

    case 'ATTESTATION_PAIEMENT': {
      const installments = await tx.installment.findMany({
        where: { studentId: opts.studentId, status: { not: 'CANCELLED' } },
        include: { payments: { select: { amount: true } } },
        orderBy: { dueDate: 'asc' },
      });
      const totalDue = installments.reduce((s, i) => s + Number(i.amount), 0);
      const totalPaid = installments.reduce(
        (s, i) => s + i.payments.reduce((ps, p) => ps + Number(p.amount), 0),
        0,
      );
      const schedule = installments.map((i) => ({
        label: i.label,
        dueDate: i.dueDate,
        amount: Number(i.amount),
        paid: i.payments.reduce((ps, p) => ps + Number(p.amount), 0),
        status: i.status,
      }));
      return {
        ...base,
        finance: { totalDue, totalPaid, balance: Math.max(0, totalDue - totalPaid) },
        schedule,
      };
    }

    case 'ATTESTATION_REUSSITE': {
      if (!period || !sc) return null;
      const bd = await loadBulletinData(tx, {
        classId: sc.classId,
        periodId: period.id,
        studentIds: [opts.studentId],
      });
      if (!bd || bd.students.length === 0) return null;
      const row = bd.students[0]!.row;
      if (row.generalAverage === null) return null;
      return {
        ...base,
        result: {
          periodLabel: period.label,
          generalAverage: row.generalAverage,
          mention: computeMention(row.generalAverage, 20),
          rank: row.generalRank,
          ratedStudents: row.ratedStudents,
        },
      };
    }
  }
}
