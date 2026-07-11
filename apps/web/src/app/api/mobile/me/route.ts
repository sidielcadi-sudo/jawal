import { withTenant } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';
import { getParentChildren } from '@/lib/parent';
import { countUnreadConversations } from '@/lib/messaging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/mobile/me → profil parent + liste des enfants.
 * Header : Authorization: Bearer <token>
 */
export async function GET(req: Request) {
  const principal = await verifyMobileToken(req);
  if (!principal) return Response.json({ error: 'Non authentifié.' }, { status: 401 });

  const data = await withTenant(principal.tenantId, async (tx) => {
    const parent = await tx.user.findUnique({
      where: { id: principal.userId },
      select: { email: true, userPersons: { include: { person: { select: { firstName: true, lastName: true } } } } },
    });
    const person = parent?.userPersons[0]?.person;
    const children = await getParentChildren(tx, principal.userId);
    const unreadMessages = await countUnreadConversations(tx, principal.userId);
    return {
      user: {
        id: principal.userId,
        email: parent?.email ?? null,
        name: person ? `${person.firstName} ${person.lastName}` : null,
      },
      unreadMessages,
      children: children.map((c) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        className: c.className,
      })),
    };
  });

  return Response.json(data);
}
