/**
 * Propage les rôles système aux établissements déjà créés.
 *
 * `seed.ts` ne crée les rôles qu'à la naissance d'un tenant : ajouter un rôle
 * à `SYSTEM_ROLES` ne suffit donc pas pour les bases existantes, qui ne
 * verraient jamais le nouveau rôle dans l'écran d'invitation. Ce script comble
 * l'écart, sans toucher aux rôles déjà en place — les permissions d'un rôle
 * existant peuvent avoir été ajustées à la main, on ne les écrase pas.
 *
 *   pnpm --filter @jawal/db sync:roles
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PrismaClient } from '@prisma/client';

// `prisma db seed` charge le .env tout seul ; `tsx` non. On remonte donc
// jusqu'au .env de la racine du dépôt avant d'ouvrir la connexion.
if (!process.env.DATABASE_URL) {
  let dir = process.cwd();
  for (;;) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      break;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

const prisma = new PrismaClient();

/** Doit rester aligné sur `SYSTEM_ROLES` de seed.ts. */
const SYSTEM_ROLES = [
  { code: 'tenant_admin', label: 'Administrateur établissement', permissions: ['*'] },
  { code: 'direction', label: 'Direction', permissions: ['*.read', 'reports.*'] },
  { code: 'scolarite', label: 'Scolarité', permissions: ['students.*', 'classes.*', 'admissions.*'] },
  { code: 'comptable', label: 'Comptabilité', permissions: ['finance.*'] },
  {
    code: 'secretariat',
    label: 'Secrétariat',
    permissions: ['students.*', 'classes.read', 'communication.write', 'attendance.read', 'finance.read'],
  },
  { code: 'enseignant', label: 'Enseignant', permissions: ['attendance.write', 'grades.write', 'lms.write'] },
  { code: 'cpe', label: 'CPE / Vie scolaire', permissions: ['attendance.*', 'discipline.*', 'communication.*'] },
  { code: 'parent', label: 'Parent', permissions: ['self.read'] },
  { code: 'eleve', label: 'Élève', permissions: ['self.read'] },
] as const;

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  console.log(`${tenants.length} établissement(s)`);

  let created = 0;
  for (const tenant of tenants) {
    const existing = await prisma.role.findMany({
      where: { tenantId: tenant.id },
      select: { code: true },
    });
    const have = new Set(existing.map((r) => r.code));
    const missing = SYSTEM_ROLES.filter((r) => !have.has(r.code));
    if (missing.length === 0) {
      console.log(`  · ${tenant.name} : à jour`);
      continue;
    }
    await prisma.role.createMany({
      data: missing.map((r) => ({
        tenantId: tenant.id,
        code: r.code,
        label: r.label,
        permissions: [...r.permissions],
        isSystem: true,
      })),
    });
    created += missing.length;
    console.log(`  ✓ ${tenant.name} : ${missing.map((r) => r.code).join(', ')}`);
  }
  console.log(`\n${created} rôle(s) ajouté(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
