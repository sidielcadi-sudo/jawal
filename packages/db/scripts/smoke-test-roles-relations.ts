/**
 * Smoke test : rôles paramétrables + liens parents + fratrie déduite.
 *   pnpm --filter @jawal/db exec tsx scripts/smoke-test-roles-relations.ts
 */
import { PrismaClient, PersonType, RelationType } from '@prisma/client';

const APP = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
if (!APP) throw new Error('DATABASE_URL_APP requis');

const app = new PrismaClient({ datasourceUrl: APP });
const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function withT<T>(tenantId: string, fn: (tx: typeof app) => Promise<T>): Promise<T> {
  return app.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
    return fn(tx as typeof app);
  });
}

function phoneValid(phone: string): boolean {
  return (phone.match(/\d/g) ?? []).length >= 9;
}

async function main() {
  const tenant = await admin.tenant.findUniqueOrThrow({ where: { slug: 'demo' } });
  console.log(`🎯 Tenant: ${tenant.name}\n`);

  // 1. 19 rôles paramétrables seedés (5 TEACHER + 14 STAFF)
  const counts = await withT(tenant.id, async (tx) => ({
    teacher: await tx.personRole.count({ where: { appliesTo: PersonType.TEACHER } }),
    staff: await tx.personRole.count({ where: { appliesTo: PersonType.STAFF } }),
  }));
  const okRoles = counts.teacher === 5 && counts.staff === 14;
  console.log(`1. Rôles seedés : ${counts.teacher} TEACHER + ${counts.staff} STAFF = ${counts.teacher + counts.staff} ${okRoles ? '✅' : '❌'}`);

  // 2. Bilingue : un rôle a bien labelFr + labelAr non vides
  const mainTeacher = await withT(tenant.id, (tx) =>
    tx.personRole.findUnique({ where: { tenantId_code: { tenantId: tenant.id, code: 'MAIN_TEACHER' } } }),
  );
  const okBilingual = !!(mainTeacher && mainTeacher.labelFr && mainTeacher.labelAr);
  console.log(`2. Bilingue : MAIN_TEACHER → "${mainTeacher?.labelFr}" / "${mainTeacher?.labelAr}" ${okBilingual ? '✅' : '❌'}`);

  // 3. Enseignant Amina a bien le rôle MAIN_TEACHER attribué (seed)
  const amina = await withT(tenant.id, (tx) =>
    tx.person.findFirst({
      where: { type: PersonType.TEACHER, firstName: 'Amina' },
      include: { role: true },
    }),
  );
  const okRoleAttached = amina?.role?.code === 'MAIN_TEACHER';
  console.log(`3. Amina El Idrissi → ${amina?.role?.labelFr ?? '∅'} ${okRoleAttached ? '✅' : '❌'}`);

  // 4. Fratrie déduite : Yassine et Youssra Benani partagent les 2 parents
  const yassine = await withT(tenant.id, (tx) =>
    tx.person.findFirstOrThrow({
      where: { type: PersonType.STUDENT, firstName: 'Yassine', lastName: 'Benani' },
      include: { relationsAsChild: { include: { parent: true } } },
    }),
  );
  const yassineParentIds = yassine.relationsAsChild.map((r) => r.parentId);
  const siblings = await withT(tenant.id, (tx) =>
    tx.personRelation.findMany({
      where: { parentId: { in: yassineParentIds }, childId: { not: yassine.id } },
      distinct: ['childId'],
      include: { child: true },
    }),
  );
  const okSiblings =
    yassine.relationsAsChild.length === 2 &&
    siblings.length === 1 &&
    siblings[0]!.child.firstName === 'Youssra';
  console.log(
    `4. Fratrie déduite : Yassine a ${yassine.relationsAsChild.length} parents → ${siblings.length} frère/sœur (${siblings[0]?.child.firstName ?? '∅'}) ${okSiblings ? '✅' : '❌'}`,
  );

  // 5. Types de relations seedées
  const fatherRel = yassine.relationsAsChild.find((r) => r.type === RelationType.FATHER);
  const motherRel = yassine.relationsAsChild.find((r) => r.type === RelationType.MOTHER);
  const okRelTypes = !!fatherRel && !!motherRel;
  console.log(`5. Types : Père=${fatherRel?.parent.firstName ?? '∅'}, Mère=${motherRel?.parent.firstName ?? '∅'} ${okRelTypes ? '✅' : '❌'}`);

  // 6. Validation téléphone CSV — min 9 chiffres après nettoyage
  const cases = [
    { phone: '0612345678', expected: true,  desc: 'Marocain 10 chiffres' },
    { phone: '+212 612 345 678', expected: true, desc: 'International formaté' },
    { phone: '06-12-34-56-78', expected: true, desc: 'Avec tirets' },
    { phone: '12345', expected: false, desc: 'Trop court (5 chiffres)' },
    { phone: '12345678', expected: false, desc: 'Trop court (8 chiffres)' },
    { phone: '123456789', expected: true, desc: 'Pile 9 chiffres' },
  ];
  let okPhone = true;
  for (const c of cases) {
    const got = phoneValid(c.phone);
    if (got !== c.expected) {
      console.log(`   ❌ "${c.phone}" attendu=${c.expected} obtenu=${got} (${c.desc})`);
      okPhone = false;
    }
  }
  console.log(`6. Validation téléphone CSV (6 cas) ${okPhone ? '✅' : '❌'}`);

  // 7. Isolation cross-tenant : rôles + relations invisibles avec un fake tenant
  const fakeTenant = '00000000-0000-0000-0000-000000000000';
  const visible = await app.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${fakeTenant}'`);
    return {
      roles: await tx.personRole.count(),
      relations: await tx.personRelation.count(),
    };
  });
  const okIsolation = visible.roles === 0 && visible.relations === 0;
  console.log(`7. Isolation cross-tenant → ${JSON.stringify(visible)} ${okIsolation ? '✅' : '❌'}`);

  await app.$disconnect();
  await admin.$disconnect();

  const all = okRoles && okBilingual && okRoleAttached && okSiblings && okRelTypes && okPhone && okIsolation;
  console.log(`\n${all ? '✅ Tous les tests passent.' : '❌ Au moins un test KO.'}`);
  if (!all) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
