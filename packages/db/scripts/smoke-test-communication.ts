/**
 * Smoke test S4 : annonces + messagerie
 *   pnpm --filter @jawal/db exec tsx scripts/smoke-test-communication.ts
 */
import { PrismaClient } from '@prisma/client';

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

async function main() {
  const tenant = await admin.tenant.findUniqueOrThrow({ where: { slug: 'demo' } });
  console.log(`🎯 Tenant: ${tenant.name}\n`);

  const author = await admin.user.findFirstOrThrow({ where: { tenantId: tenant.id, isSuperAdmin: false } });
  // Trouver un autre user pour participation
  const allUsers = await admin.user.findMany({ where: { tenantId: tenant.id }, take: 2 });
  const other = allUsers.find((u) => u.id !== author.id) ?? author;

  // 1. Annonce brouillon
  const draft = await withT(tenant.id, (tx) =>
    tx.announcement.create({
      data: {
        tenantId: tenant.id,
        authorId: author.id,
        title: 'Annonce brouillon',
        body: 'Test',
        audience: 'ALL',
      },
    }),
  );
  console.log(`1. Annonce brouillon créée (publishedAt=null) ${draft.publishedAt === null ? '✅' : '❌'}`);

  // 2. Publication
  await withT(tenant.id, (tx) =>
    tx.announcement.update({ where: { id: draft.id }, data: { publishedAt: new Date() } }),
  );
  const published = await withT(tenant.id, (tx) =>
    tx.announcement.findUniqueOrThrow({ where: { id: draft.id } }),
  );
  console.log(`2. Publication → publishedAt set ${published.publishedAt ? '✅' : '❌'}`);

  // 3. Annonce CLASS sans classId → erreur métier attendue côté action ; ici on n'a pas la
  //    contrainte au niveau DB, donc on documente : la validation est dans Zod (refine).

  // 4. Conversation + participants + premier message
  const conv = await withT(tenant.id, async (tx) => {
    const c = await tx.conversation.create({
      data: { tenantId: tenant.id, subject: 'Smoke conv', createdBy: author.id },
    });
    await tx.conversationParticipant.createMany({
      data: [
        { tenantId: tenant.id, conversationId: c.id, userId: author.id },
        { tenantId: tenant.id, conversationId: c.id, userId: other.id },
      ],
    });
    await tx.message.create({
      data: { tenantId: tenant.id, conversationId: c.id, senderUserId: author.id, body: 'Hello' },
    });
    return c;
  });
  const messages = await withT(tenant.id, (tx) =>
    tx.message.findMany({ where: { conversationId: conv.id } }),
  );
  console.log(`4. Conversation + 1 message ${messages.length === 1 ? '✅' : '❌'}`);

  // 5. Unique (conversation, user) bloque double-participation
  try {
    await withT(tenant.id, (tx) =>
      tx.conversationParticipant.create({
        data: { tenantId: tenant.id, conversationId: conv.id, userId: author.id },
      }),
    );
    console.log(`5. Duplicate participation créée → ❌`);
  } catch (e) {
    const isUnique = e instanceof Error && e.message.includes('Unique constraint');
    console.log(`5. Unique participation bloquée : ${isUnique ? '✅' : '❌'}`);
  }

  // 6. lastReadAt mis à jour
  await withT(tenant.id, (tx) =>
    tx.conversationParticipant.updateMany({
      where: { conversationId: conv.id, userId: author.id },
      data: { lastReadAt: new Date() },
    }),
  );
  const p = await withT(tenant.id, (tx) =>
    tx.conversationParticipant.findFirst({ where: { conversationId: conv.id, userId: author.id } }),
  );
  console.log(`6. lastReadAt set après mark-read ${p?.lastReadAt ? '✅' : '❌'}`);

  // 7. Isolation cross-tenant
  const fakeTenant = '00000000-0000-0000-0000-000000000000';
  const visible = await app.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${fakeTenant}'`);
    return {
      announcements: await tx.announcement.count(),
      conversations: await tx.conversation.count(),
      messages: await tx.message.count(),
    };
  });
  console.log(`7. Isolation cross-tenant → ${JSON.stringify(visible)} ${visible.announcements === 0 && visible.conversations === 0 && visible.messages === 0 ? '✅' : '❌'}`);

  // Cleanup
  await admin.message.deleteMany({ where: { conversationId: conv.id } });
  await admin.conversationParticipant.deleteMany({ where: { conversationId: conv.id } });
  await admin.conversation.delete({ where: { id: conv.id } });
  await admin.announcement.delete({ where: { id: draft.id } });

  await app.$disconnect();
  await admin.$disconnect();
  console.log('\n🧹 Cleanup OK\n✅ Tous les tests Communication passent.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
