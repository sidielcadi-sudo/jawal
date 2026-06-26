/**
 * Reset CIBLÉ de la finance : supprime les échéances/paiements ad hoc et les
 * régénère DEPUIS les grilles tarifaires (feeScheduleItemId renseigné), avec
 * applicabilité par catégorie (Cantine si demi-pension/interne ; Transport si
 * usesTransport). Ne touche ni aux élèves, ni aux inscriptions, ni au reste.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function stepMonths(count: number): number {
  return Math.max(1, Math.round(9 / Math.max(1, count)));
}

function buildInstallments(
  fee: { label: string; totalAmount: unknown; installmentCount: number; firstDueMonth: number },
  yearStart: Date,
) {
  const count = Math.max(1, Math.floor(fee.installmentCount));
  const step = stepMonths(count);
  const total = Number(fee.totalAmount);
  const per = Math.round((total / count) * 100) / 100;
  const out: { label: string; amount: number; dueDate: Date }[] = [];
  for (let i = 0; i < count; i++) {
    const offset = fee.firstDueMonth - 1 + i * step;
    const m = offset % 12;
    const yo = Math.floor(offset / 12);
    const amount = i === count - 1 ? Math.round((total - per * (count - 1)) * 100) / 100 : per;
    out.push({
      label: `${fee.label} (${i + 1}/${count})`,
      amount,
      dueDate: new Date(Date.UTC(yearStart.getUTCFullYear() + yo, m, 5)),
    });
  }
  return out;
}

async function main() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) throw new Error('Aucun tenant.');
  const year = await prisma.academicYear.findFirst({
    where: { tenantId: tenant.id, active: true },
  });
  if (!year) throw new Error('Aucune année active.');
  const yearStart = new Date(year.startDate);

  const grilles = await prisma.feeScheduleItem.findMany({
    where: { tenantId: tenant.id, academicYearId: year.id, kind: 'ANNUAL' },
  });
  const grillesByLevel = new Map<string, typeof grilles>();
  for (const g of grilles) {
    const arr = grillesByLevel.get(g.levelId) ?? [];
    arr.push(g);
    grillesByLevel.set(g.levelId, arr);
  }

  const scs = await prisma.studentClass.findMany({
    where: { tenantId: tenant.id, unenrolledAt: null, class: { academicYearId: year.id } },
    select: {
      studentId: true,
      class: { select: { levelId: true } },
      student: { select: { regime: true, usesTransport: true } },
    },
  });

  // --- Compteurs AVANT ---
  const beforeInst = await prisma.installment.count({ where: { tenantId: tenant.id } });
  const beforePay = await prisma.payment.count({ where: { tenantId: tenant.id } });
  console.log(`AVANT : ${beforeInst} échéances, ${beforePay} paiements`);
  console.log(
    `Grilles ANNUAL : ${grilles.length} | élèves inscrits (année active) : ${scs.length} | niveaux avec grille : ${grillesByLevel.size}`,
  );

  // --- Suppression finance (ad hoc inclus) ---
  await prisma.payment.deleteMany({ where: { tenantId: tenant.id } });
  const delI = await prisma.installment.deleteMany({ where: { tenantId: tenant.id } });
  console.log(`Supprimé : ${delI.count} échéances + tous les paiements`);

  // --- Régénération DEPUIS les grilles ---
  let created = 0;
  const data: {
    tenantId: string;
    studentId: string;
    feeScheduleItemId: string;
    label: string;
    amount: number;
    dueDate: Date;
    status: 'PENDING';
  }[] = [];
  for (const sc of scs) {
    const eats = sc.student.regime === 'DEMI_PENSIONNAIRE' || sc.student.regime === 'INTERNE';
    const levelGrilles = grillesByLevel.get(sc.class.levelId) ?? [];
    for (const g of levelGrilles) {
      if (g.category === 'CANTEEN' && !eats) continue;
      if (g.category === 'TRANSPORT' && !sc.student.usesTransport) continue;
      for (const it of buildInstallments(g, yearStart)) {
        data.push({
          tenantId: tenant.id,
          studentId: sc.studentId,
          feeScheduleItemId: g.id,
          label: it.label,
          amount: it.amount,
          dueDate: it.dueDate,
          status: 'PENDING',
        });
        created += 1;
      }
    }
  }
  await prisma.installment.createMany({ data });
  console.log(`Régénéré : ${created} échéances (depuis grilles)`);

  // --- Simulation de paiements (échéances échues : 60% payées, 20% partielles) ---
  const today = new Date();
  const insts = await prisma.installment.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, amount: true, dueDate: true },
  });
  const METHODS = ['CASH', 'CHEQUE', 'TRANSFER'] as const;
  let pays = 0;
  for (const i of insts) {
    if (i.dueDate >= today) continue;
    const r = Math.random();
    const amt = Number(i.amount);
    let pay = 0;
    let status: 'PAID' | 'PARTIAL' | null = null;
    if (r < 0.6) {
      pay = amt;
      status = 'PAID';
    } else if (r < 0.8) {
      pay = Math.round(amt * 0.5 * 100) / 100;
      status = 'PARTIAL';
    }
    if (status) {
      await prisma.payment.create({
        data: {
          tenantId: tenant.id,
          installmentId: i.id,
          amount: pay,
          method: METHODS[Math.floor(Math.random() * METHODS.length)],
          paidAt: new Date(i.dueDate.getTime() + 5 * 86_400_000),
        },
      });
      await prisma.installment.update({ where: { id: i.id }, data: { status } });
      pays += 1;
    }
  }
  console.log(`Paiements simulés : ${pays}`);

  // --- Compteurs APRÈS ---
  const afterInst = await prisma.installment.count({ where: { tenantId: tenant.id } });
  const afterAdhoc = await prisma.installment.count({
    where: { tenantId: tenant.id, feeScheduleItemId: null },
  });
  const sumDue = await prisma.installment.aggregate({
    where: { tenantId: tenant.id },
    _sum: { amount: true },
  });
  console.log(
    `APRÈS : ${afterInst} échéances (dont ${afterAdhoc} ad hoc) | total dû = ${Number(sumDue._sum.amount ?? 0).toLocaleString('fr')} MAD`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
