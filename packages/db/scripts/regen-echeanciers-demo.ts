/**
 * Régénère UNIQUEMENT les échéanciers (installments) des élèves actifs du tenant
 * DÉMO, à partir des grilles tarifaires ANNUAL, avec applicabilité par catégorie
 * (Cantine si demi-pensionnaire/interne ; Transport si usesTransport).
 * NE crée AUCUN paiement. Ne touche ni élèves, ni classes, ni inscriptions.
 * Dérivé de reseed-finance.ts, scopé au tenant 'demo' et sans simulation de paiements.
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
  const tenant = await prisma.tenant.findFirst({ where: { slug: 'demo' } });
  if (!tenant) throw new Error("Tenant 'demo' introuvable.");
  console.log(`Tenant : ${tenant.name} (${tenant.slug})`);

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

  const beforeInst = await prisma.installment.count({ where: { tenantId: tenant.id } });
  console.log(`AVANT : ${beforeInst} échéances`);
  console.log(
    `Grilles ANNUAL : ${grilles.length} | élèves inscrits (année active) : ${scs.length} | niveaux avec grille : ${grillesByLevel.size}`,
  );

  // Sécurité : on ne touche qu'aux échéances liées à une grille (feeScheduleItemId non nul)
  // pour régénérer proprement, en préservant d'éventuelles échéances ad hoc (il n'y en a pas ici).
  const delI = await prisma.installment.deleteMany({
    where: { tenantId: tenant.id, feeScheduleItemId: { not: null } },
  });
  console.log(`Supprimé (liées à une grille) : ${delI.count} échéances`);

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
      }
    }
  }
  await prisma.installment.createMany({ data });

  const afterInst = await prisma.installment.count({ where: { tenantId: tenant.id } });
  const sumDue = await prisma.installment.aggregate({
    where: { tenantId: tenant.id },
    _sum: { amount: true },
  });
  const nbEleves = new Set(data.map((d) => d.studentId)).size;
  console.log(
    `APRÈS : ${afterInst} échéances régénérées pour ${nbEleves} élèves | total dû = ${Number(sumDue._sum.amount ?? 0).toLocaleString('fr')} MAD | 0 paiement`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
