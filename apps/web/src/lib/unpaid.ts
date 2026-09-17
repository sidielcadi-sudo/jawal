import 'server-only';
import type { Prisma } from '@/lib/db';
import type { LedgerRow } from '@/lib/unpaid-filters';

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
 * Fenêtre de filtrage : ne retient que les échéances dues dans [from, to[.
 *
 * `yearId` rattrape les frais exceptionnels, qui déclarent leur année mais
 * peuvent échoir hors de ses bornes (une sortie facturée fin août). Sans lui,
 * ces créances disparaissent des indicateurs des deux années.
 */
export type UnpaidWindow = { from: Date; to: Date; yearId?: string };

/**
 * Impayés à la date du jour, groupés par famille. Un impayé = échéance échue
 * (dueDate ≤ aujourd'hui) non soldée. La « famille » = le parent lié (via
 * PersonRelation) ; à défaut l'élève lui-même. Durée du retard = jours écoulés
 * depuis la première échéance non payée.
 *
 * `window` borne le calcul à un exercice : les indicateurs de la page Finances
 * portent sur l'année scolaire sélectionnée, jamais sur l'historique complet.
 * Sans fenêtre, tous les exercices sont pris en compte.
 */
export async function loadUnpaidByFamily(
  tx: Prisma.TransactionClient,
  window?: UnpaidWindow,
): Promise<{
  rows: UnpaidStudentRow[];
  families: UnpaidFamily[];
  familiesCount: number;
}> {
  const today = new Date();

  const installments = await tx.installment.findMany({
    where: {
      status: { not: 'CANCELLED' },
      dueDate: { lte: today },
      ...(window
        ? {
            OR: [
              // Échéances ordinaires : la date d'échéance décide.
              {
                dueDate: { gte: window.from, lt: window.to },
                exceptionalFeeAssignment: null,
              },
              // Frais exceptionnels : leur année déclarée décide.
              ...(window.yearId
                ? [
                    {
                      exceptionalFeeAssignment: {
                        exceptionalFee: { academicYearId: window.yearId },
                      },
                    },
                  ]
                : []),
            ],
          }
        : {}),
    },
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

  const parentOf = await parentsOf(tx, [...byStudent.keys()]);

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

/**
 * Reste dû par élève, tous exercices confondus — la base du blocage de
 * réinscription.
 *
 * Les échéances `CANCELLED` sont exclues : c'est le statut que pose « Effacer »
 * (abandon de créance). Une créance effacée ne doit plus barrer la route à une
 * réinscription, sinon le geste n'aurait aucun effet.
 *
 * Partagée par l'écran de réinscription en lot et par l'action qui traite le
 * lot : les deux doivent voir le même solde, faute de quoi l'écran annonce
 * « hors lot » un élève que le traitement, lui, accepterait.
 */
export async function loadOutstandingBalances(
  tx: Prisma.TransactionClient,
  studentIds: string[],
): Promise<Map<string, number>> {
  const balances = new Map<string, number>();
  if (studentIds.length === 0) return balances;

  const installments = await tx.installment.findMany({
    where: { studentId: { in: studentIds }, status: { not: 'CANCELLED' } },
    select: { studentId: true, amount: true, payments: { select: { amount: true } } },
  });
  for (const i of installments) {
    const paid = i.payments.reduce((s, p) => s + Number(p.amount), 0);
    const remaining = Math.max(0, Number(i.amount) - paid);
    balances.set(i.studentId, (balances.get(i.studentId) ?? 0) + remaining);
  }
  for (const [id, v] of balances) balances.set(id, round2(v));
  return balances;
}

/* ────────────────────────────────────────────────────────────────────────
   Gestion des impayés : famille → élève → année scolaire
   ──────────────────────────────────────────────────────────────────────── */

/** Une échéance non soldée, détaillée — support du bouton « Effacer ». */
export type UnpaidInstallment = {
  id: string;
  label: string;
  dueDate: string;
  amount: number;
  paid: number;
  remaining: number;
};

export type UnpaidYearRow = {
  /** null si l'échéance ne tombe dans aucune année scolaire déclarée. */
  yearId: string | null;
  yearLabel: string;
  due: number;
  paid: number;
  unpaid: number;
  echeances: string[];
  daysLate: number;
  /** Exercice antérieur à l'année scolaire active — créance reportée. */
  previous: boolean;
  /** Échéances non soldées de l'année, ligne à ligne. */
  items: UnpaidInstallment[];
};

export type UnpaidStudentGroup = {
  studentId: string;
  studentName: string;
  years: UnpaidYearRow[];
  unpaid: number;
  /** Part venant d'exercices antérieurs à l'année active. */
  previousUnpaid: number;
  daysLate: number;
};

export type UnpaidFamilyGroup = {
  familyId: string;
  familyName: string;
  students: UnpaidStudentGroup[];
  unpaid: number;
  previousUnpaid: number;
  daysLate: number;
  /** Nombre de lignes (élève × année) — sert au rowSpan du tableau. */
  rowCount: number;
};

/**
 * Impayés complets — tous exercices confondus — organisés en trois niveaux :
 * **famille → élève → année scolaire**. C'est la vue de recouvrement : elle
 * remonte les créances des années antérieures, que les indicateurs de la page
 * Finances (bornés à l'année active) laissent volontairement de côté.
 */
export async function loadUnpaidByFamilyYear(tx: Prisma.TransactionClient): Promise<{
  families: UnpaidFamilyGroup[];
  totalUnpaid: number;
  previousUnpaid: number;
  studentCount: number;
}> {
  const today = new Date();
  const dayMs = 86_400_000;

  const years = await tx.academicYear.findMany({
    select: { id: true, label: true, startDate: true, endDate: true, active: true },
    orderBy: { startDate: 'asc' },
  });
  const activeYear = years.find((y) => y.active) ?? null;
  /** Une échéance appartient à l'année dont l'intervalle contient sa date. */
  const yearOf = (d: Date) => years.find((y) => d >= y.startDate && d <= y.endDate) ?? null;

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
      // Un frais exceptionnel porte SON année scolaire. Sa date d'échéance,
      // elle, peut tomber hors des bornes de l'année (une sortie facturée fin
      // août, avant la rentrée) : s'en remettre à la date rangerait la créance
      // dans une année « — » présentée comme un exercice antérieur.
      exceptionalFeeAssignment: {
        select: { exceptionalFee: { select: { academicYearId: true } } },
      },
    },
    orderBy: { dueDate: 'asc' },
  });

  // Agrégation (élève × année).
  type Cell = {
    studentName: string;
    yearId: string | null;
    yearLabel: string;
    previous: boolean;
    due: number;
    paid: number;
    unpaid: number;
    echeances: string[];
    firstDue: Date | null;
    items: UnpaidInstallment[];
  };
  const cells = new Map<string, Cell>();
  for (const i of installments) {
    const y = yearOfInstallment(i, years, yearOf);
    const key = `${i.studentId}|${y?.id ?? 'none'}`;
    let c = cells.get(key);
    if (!c) {
      c = {
        studentName: `${i.student.lastName} ${i.student.firstName}`,
        yearId: y?.id ?? null,
        yearLabel: y?.label ?? '—',
        previous: Boolean(
          activeYear && (!y || y.startDate.getTime() < activeYear.startDate.getTime()),
        ),
        due: 0,
        paid: 0,
        unpaid: 0,
        echeances: [],
        firstDue: null,
        items: [],
      };
      cells.set(key, c);
    }
    const paid = i.payments.reduce((s, p) => s + Number(p.amount), 0);
    const rem = Number(i.amount) - paid;
    c.due += Number(i.amount);
    c.paid += paid;
    if (rem > 0.01) {
      c.unpaid += rem;
      c.echeances.push(i.label);
      c.firstDue ??= i.dueDate;
      c.items.push({
        id: i.id,
        label: i.label,
        dueDate: i.dueDate.toISOString(),
        amount: round2(Number(i.amount)),
        paid: round2(paid),
        remaining: round2(rem),
      });
    }
  }

  // Regroupement par élève, en ne gardant que les années réellement en impayé.
  const byStudent = new Map<string, UnpaidStudentGroup>();
  for (const [key, c] of cells) {
    if (c.unpaid <= 0.01) continue;
    const studentId = key.slice(0, key.lastIndexOf('|'));
    const g =
      byStudent.get(studentId) ??
      ({
        studentId,
        studentName: c.studentName,
        years: [],
        unpaid: 0,
        previousUnpaid: 0,
        daysLate: 0,
      } satisfies UnpaidStudentGroup);
    const daysLate = c.firstDue
      ? Math.max(0, Math.floor((today.getTime() - c.firstDue.getTime()) / dayMs))
      : 0;
    g.years.push({
      yearId: c.yearId,
      yearLabel: c.yearLabel,
      due: round2(c.due),
      paid: round2(c.paid),
      unpaid: round2(c.unpaid),
      echeances: c.echeances,
      daysLate,
      previous: c.previous,
      items: c.items,
    });
    g.unpaid = round2(g.unpaid + c.unpaid);
    if (c.previous) g.previousUnpaid = round2(g.previousUnpaid + c.unpaid);
    g.daysLate = Math.max(g.daysLate, daysLate);
    byStudent.set(studentId, g);
  }
  // Années les plus anciennes en tête : la dette reportée se lit en premier.
  const yearOrder = new Map(years.map((y, idx) => [y.id, idx]));
  for (const g of byStudent.values()) {
    g.years.sort(
      (a, b) => (yearOrder.get(a.yearId ?? '') ?? -1) - (yearOrder.get(b.yearId ?? '') ?? -1),
    );
  }

  if (byStudent.size === 0) {
    return { families: [], totalUnpaid: 0, previousUnpaid: 0, studentCount: 0 };
  }

  const parentOf = await parentsOf(tx, [...byStudent.keys()]);

  const famMap = new Map<string, UnpaidFamilyGroup>();
  for (const g of byStudent.values()) {
    const fam = parentOf.get(g.studentId);
    const familyId = fam?.id ?? g.studentId;
    const f =
      famMap.get(familyId) ??
      ({
        familyId,
        familyName: fam?.name ?? g.studentName,
        students: [],
        unpaid: 0,
        previousUnpaid: 0,
        daysLate: 0,
        rowCount: 0,
      } satisfies UnpaidFamilyGroup);
    f.students.push(g);
    f.unpaid = round2(f.unpaid + g.unpaid);
    f.previousUnpaid = round2(f.previousUnpaid + g.previousUnpaid);
    f.daysLate = Math.max(f.daysLate, g.daysLate);
    f.rowCount += g.years.length;
    famMap.set(familyId, f);
  }

  const families = [...famMap.values()].sort(
    (a, b) => a.familyName.localeCompare(b.familyName) || b.unpaid - a.unpaid,
  );
  for (const f of families) {
    f.students.sort((a, b) => b.unpaid - a.unpaid || a.studentName.localeCompare(b.studentName));
  }

  return {
    families,
    totalUnpaid: round2(families.reduce((s, f) => s + f.unpaid, 0)),
    previousUnpaid: round2(families.reduce((s, f) => s + f.previousUnpaid, 0)),
    studentCount: byStudent.size,
  };
}

/**
 * Ne conserve que les créances des exercices antérieurs à l'année active.
 *
 * Filtrer les familles ne suffit pas : une famille retenue parce qu'elle traîne
 * une dette de 2025-2026 affichait aussi ses échéances de l'année en cours, ce
 * que « Antérieures uniquement » promet justement d'écarter. On élague donc
 * l'arbre — années, puis élèves, puis familles — et on recalcule les totaux sur
 * ce qui reste, sinon les sous-totaux affichés ne correspondraient plus aux
 * lignes visibles.
 */
export function keepPreviousOnly(families: UnpaidFamilyGroup[]): UnpaidFamilyGroup[] {
  const out: UnpaidFamilyGroup[] = [];
  for (const f of families) {
    const students: UnpaidStudentGroup[] = [];
    for (const s of f.students) {
      const years = s.years.filter((y) => y.previous);
      if (years.length === 0) continue;
      const unpaid = round2(years.reduce((acc, y) => acc + y.unpaid, 0));
      students.push({
        ...s,
        years,
        unpaid,
        previousUnpaid: unpaid,
        daysLate: years.reduce((acc, y) => Math.max(acc, y.daysLate), 0),
      });
    }
    if (students.length === 0) continue;
    const unpaid = round2(students.reduce((acc, s) => acc + s.unpaid, 0));
    out.push({
      ...f,
      students,
      unpaid,
      previousUnpaid: unpaid,
      daysLate: students.reduce((acc, s) => Math.max(acc, s.daysLate), 0),
      rowCount: students.reduce((acc, s) => acc + s.years.length, 0),
    });
  }
  return out;
}

/**
 * Année scolaire d'une échéance.
 *
 * Le lien explicite prime sur la date : un frais exceptionnel déclare l'année
 * à laquelle il appartient, et c'est elle qui fait foi. La date d'échéance ne
 * sert qu'aux échéances qui n'ont pas ce lien — les mensualités, dont la date
 * tombe toujours dans l'année.
 */
function yearOfInstallment<Y extends { id: string }>(
  inst: {
    dueDate: Date;
    exceptionalFeeAssignment?: { exceptionalFee: { academicYearId: string } } | null;
  },
  years: Y[],
  byDate: (d: Date) => Y | null,
): Y | null {
  const declared = inst.exceptionalFeeAssignment?.exceptionalFee.academicYearId;
  if (declared) return years.find((y) => y.id === declared) ?? null;
  return byDate(inst.dueDate);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Élève → premier parent rattaché (la « famille » au sens du recouvrement). */
async function parentsOf(tx: Prisma.TransactionClient, studentIds: string[]) {
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
  return parentOf;
}

/**
 * Grand livre des échéances pour la gestion des impayés : toutes les échéances
 * non annulées (payées comprises, pour les indicateurs), avec leur année,
 * la classe et le cycle de l'élève cette année-là, et ses responsables.
 */
export async function loadUnpaidLedger(tx: Prisma.TransactionClient): Promise<{
  rows: LedgerRow[];
  years: Array<{ id: string; label: string; active: boolean }>;
  activeYearId: string | null;
}> {
  const years = await tx.academicYear.findMany({
    select: { id: true, label: true, startDate: true, endDate: true, active: true },
    orderBy: { startDate: 'asc' },
  });
  const activeYear = years.find((y) => y.active) ?? null;
  const yearOf = (d: Date) => years.find((y) => d >= y.startDate && d <= y.endDate) ?? null;

  const installments = await tx.installment.findMany({
    where: { status: { not: 'CANCELLED' } },
    select: {
      id: true,
      studentId: true,
      amount: true,
      dueDate: true,
      label: true,
      contentiousAt: true,
      payments: { select: { amount: true, paidAt: true } },
      student: { select: { firstName: true, lastName: true } },
      exceptionalFeeAssignment: { select: { exceptionalFee: { select: { academicYearId: true } } } },
    },
    orderBy: { dueDate: 'asc' },
  });
  const studentIds = [...new Set(installments.map((i) => i.studentId))];
  if (studentIds.length === 0) return { rows: [], years: years.map(({ id, label, active }) => ({ id, label, active })), activeYearId: activeYear?.id ?? null };

  const [relations, enrolments] = await Promise.all([
    tx.personRelation.findMany({
      where: { childId: { in: studentIds } },
      select: { childId: true, parentId: true, parent: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    tx.studentClass.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, class: { select: { id: true, academicYearId: true, level: { select: { cycleId: true } } } } },
    }),
  ]);
  const guardians = new Map<string, Array<{ id: string; name: string }>>();
  for (const r of relations) {
    guardians.set(r.childId, [...(guardians.get(r.childId) ?? []), { id: r.parentId, name: `${r.parent.lastName} ${r.parent.firstName}` }]);
  }
  const classOf = new Map<string, { id: string; cycleId: string | null }>();
  for (const e of enrolments) {
    classOf.set(`${e.studentId}|${e.class.academicYearId}`, { id: e.class.id, cycleId: e.class.level.cycleId ?? null });
  }

  const rows: LedgerRow[] = installments.map((i) => {
    const y = yearOfInstallment(i, years, yearOf);
    const g = guardians.get(i.studentId) ?? [];
    const cls = y ? classOf.get(`${i.studentId}|${y.id}`) : undefined;
    const studentName = `${i.student.lastName} ${i.student.firstName}`;
    const payments = i.payments.map((p) => ({ amount: Number(p.amount), paidAt: p.paidAt }));
    return {
      id: i.id,
      studentId: i.studentId,
      studentName,
      familyId: g[0]?.id ?? i.studentId,
      familyName: g[0]?.name ?? studentName,
      guardians: g.map((x) => x.name),
      yearId: y?.id ?? null,
      yearLabel: y?.label ?? '—',
      previous: Boolean(activeYear && (!y || y.startDate.getTime() < activeYear.startDate.getTime())),
      cycleId: cls?.cycleId ?? null,
      classId: cls?.id ?? null,
      label: i.label,
      dueDate: i.dueDate,
      amount: Number(i.amount),
      paid: payments.reduce((s, p) => s + p.amount, 0),
      payments,
      contentious: i.contentiousAt !== null,
    };
  });
  return { rows, years: years.map(({ id, label, active }) => ({ id, label, active })), activeYearId: activeYear?.id ?? null };
}
