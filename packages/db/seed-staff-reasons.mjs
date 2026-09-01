/**
 * Pose les motifs d'absence du personnel par défaut sur chaque tenant actif.
 *
 * Idempotent : un motif déjà présent (même libellé) n'est pas recréé, donc le
 * script peut être relancé sans risque après une modification manuelle.
 */
import { PrismaClient } from '@prisma/client';

const DEFAULTS = [
  { label: 'Maladie ordinaire', labelAr: 'مرض عادي', kind: 'SICK_LEAVE', color: '#eb6834', order: 1 },
  { label: 'Formation', labelAr: 'تكوين', kind: 'TRAINING', color: '#2a78d6', order: 2 },
  { label: 'Congé maternité / paternité', labelAr: 'إجازة أمومة / أبوة', kind: 'PARENTAL', color: '#e87ba4', order: 3 },
  { label: 'Convocation institutionnelle', labelAr: 'استدعاء إداري', kind: 'OFFICIAL_DUTY', color: '#4a3aa7', order: 4 },
  { label: 'Absence non justifiée', labelAr: 'غياب غير مبرر', kind: 'UNJUSTIFIED', color: '#e0492f', order: 5 },
  { label: 'Autre', labelAr: 'أخرى', kind: 'OTHER', color: '#898781', order: 6 },
];

const prisma = new PrismaClient();
const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
let created = 0;

for (const t of tenants) {
  const existing = await prisma.staffAbsenceReason.findMany({
    where: { tenantId: t.id },
    select: { label: true },
  });
  const known = new Set(existing.map((r) => r.label));
  for (const d of DEFAULTS) {
    if (known.has(d.label)) continue;
    await prisma.staffAbsenceReason.create({ data: { tenantId: t.id, ...d } });
    created++;
  }
}

console.log(`${tenants.length} tenant(s) — ${created} motif(s) créé(s).`);
await prisma.$disconnect();
