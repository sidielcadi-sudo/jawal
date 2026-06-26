/**
 * Garantit les motifs de justification proposés aux parents (popup carnet).
 * Idempotent : flag `forJustification=true` sur l'existant (match libellé),
 * sinon création. Lancer :
 *   pnpm --filter @jawal/db exec tsx scripts/ensure-justification-reasons.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const REASONS = [
  'Divers',
  'Maladie avec certificat',
  'Maladie sans certificat',
  'Problème de transport',
  'Raison familiale',
];

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  for (const tenant of tenants) {
    const existing = await prisma.attendanceReason.findMany({ where: { tenantId: tenant.id } });
    let created = 0;
    let flagged = 0;
    for (let i = 0; i < REASONS.length; i++) {
      const label = REASONS[i]!;
      const match = existing.find((r) => r.label.trim().toLowerCase() === label.toLowerCase());
      if (match) {
        if (!match.forJustification) {
          await prisma.attendanceReason.update({
            where: { id: match.id },
            data: { forJustification: true },
          });
          flagged++;
        }
      } else {
        await prisma.attendanceReason.create({
          data: { tenantId: tenant.id, label, forJustification: true, order: 100 + i },
        });
        created++;
      }
    }
    console.log(`Tenant ${tenant.name}: ${created} créé(s), ${flagged} marqué(s) « justification ».`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
