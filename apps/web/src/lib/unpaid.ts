import 'server-only';
import type { Prisma } from '@/lib/db';

export type UnpaidStudentRow = {
  studentId: string;
  studentName: string;
  familyId: string;
  familyName: string;
  /** Total dû sur les échéances échues non soldées. */
  due: number;
  /** Déjà versé sur ces mêmes échéances (règlements partiels). */
  paid: number;
  /** Reste à recouvrer (= due − paid). */
  unpaid: number;
  echeances: string[];
  daysLate: number;
};

export type UnpaidFamily = {
  familyId: string;
  familyName: string;
  totalUnpaid: number;
  daysLate: number;
  studentCount: number;
};

/**
 * Impayés à la date du jour, groupés par famille. Un impayé = échéance échue
 * (dueDate ≤ aujourd'hui) non soldée. La « famille » = le parent lié (via
 * PersonRelation) ; à défaut l'élève lui-même. Durée du retard = jours écoulés
 * depuis la première échéance non payée.
 */
export async function loadUnpaidByFamily(tx: Prisma.TransactionClient): Promise<{
  rows: UnpaidStudentRow[];
  families: UnpaidFamily[];
  familiesCount: number;
}> {
  const today = new Date();

  const installments = await tx.installment.findMany({
    where: { status: { not: 'CANCELLED' }, dueDate: { lte: today } },
    select: {
      id: true,
      studentId: true,
      amount: true,
      dueDate: true,
      label: true,
      payments: { select: { amount: true } },
      student: { select: { firstName: true, lastName: true } },
    },
    orderBy: { dueDate: 'asc' },
  });

  type Agg = {
    name: string;
    due: number;
    paid: number;
    unpaid: number;
    echeances: string[];
    /** Première échéance NON soldée — base du calcul du retard. */
    firstDue: Date | null;
  };
  const byStudent = new Map<string, Agg>();
  for (const i of installments) {
    const paid = i.payments.reduce((s, p) => s + Number(p.amount), 0);
    const rem = Number(i.amount) - paid;
    let a = byStudent.get(i.studentId);
    if (!a) {
      a = {
        name: `${i.student.lastName} ${i.student.firstName}`,
        due: 0,
        paid: 0,
        unpaid: 0,
        echeances: [],
        firstDue: null,
      };
      byStudent.set(i.studentId, a);
    }
    // « Dû » et « Payé » couvrent TOUTES les échéances échues, y compris celles
    // entièrement soldées : sans ça un élève à jour sur septembre afficherait
    // « Payé 0 ». Seul le « Reste » ne retient que les échéances non soldées,
    // donc l'égalité Dû − Payé = Reste tient toujours.
    a.due += Number(i.amount);
    a.paid += paid;
    if (rem > 0.01) {
      a.unpaid += rem;
      a.echeances.push(i.label);
      // installments est trié par dueDate asc → la 1ʳᵉ impayée est la plus ancienne.
      a.firstDue ??= i.dueDate;
    }
  }

  // Un élève n'est « en impayé » que s'il reste au moins une échéance non soldée.
  for (const [studentId, a] of byStudent) {
    if (a.firstDue === null) byStudent.delete(studentId);
  }

  if (byStudent.size === 0) return { rows: [], families: [], familiesCount: 0 };

  // Élève → parent (famille).
  const studentIds = [...byStudent.keys()];
  const relations = await tx.personRelation.findMany({
    where: { childId: { in: studentIds } },
    select: { childId: true, parentId: true, parent: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const parentOf = new Map<string, { id: string; name: string }>();
  for (const r of relations) {
    if (!parentOf.has(r.childId)) {
      parentOf.set(r.childId, { id: r.parentId, name: `${r.parent.lastName} ${r.parent.firstName}` });
    }
  }

  const dayMs = 86_400_000;
  const rows: UnpaidStudentRow[] = [];
  for (const [studentId, a] of byStudent) {
    const fam = parentOf.get(studentId);
    // firstDue est garanti non-null : les élèves sans impayé ont été retirés.
    const daysLate = Math.max(0, Math.floor((today.getTime() - a.firstDue!.getTime()) / dayMs));
    rows.push({
      studentId,
      studentName: a.name,
      familyId: fam?.id ?? studentId,
      familyName: fam?.name ?? a.name,
      due: Math.round(a.due * 100) / 100,
      paid: Math.round(a.paid * 100) / 100,
      unpaid: Math.round(a.unpaid * 100) / 100,
      echeances: a.echeances,
      daysLate,
    });
  }

  const famMap = new Map<string, UnpaidFamily>();
  for (const r of rows) {
    const f =
      famMap.get(r.familyId) ??
      { familyId: r.familyId, familyName: r.familyName, totalUnpaid: 0, daysLate: 0, studentCount: 0 };
    f.totalUnpaid += r.unpaid;
    f.daysLate = Math.max(f.daysLate, r.daysLate);
    f.studentCount += 1;
    famMap.set(r.familyId, f);
  }
  const families = [...famMap.values()]
    .map((f) => ({ ...f, totalUnpaid: Math.round(f.totalUnpaid * 100) / 100 }))
    .sort((a, b) => b.totalUnpaid - a.totalUnpaid);

  rows.sort((a, b) => a.familyName.localeCompare(b.familyName) || b.unpaid - a.unpaid);

  return { rows, families, familiesCount: families.length };
}
