import { withTenant } from '@/lib/db';
import { verifyMobileParent } from '@/lib/mobile-auth';
import { getParentChildren } from '@/lib/parent';
import { countUnreadConversations } from '@/lib/messaging';
import { presignedGet } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/mobile/me → profil parent + liste des enfants.
 * Header : Authorization: Bearer <token>
 */
export async function GET(req: Request) {
  const principal = await verifyMobileParent(req);
  if (!principal) return Response.json({ error: 'Non authentifié.' }, { status: 401 });

  const data = await withTenant(principal.tenantId, async (tx) => {
    const parent = await tx.user.findUnique({
      where: { id: principal.userId },
      select: { email: true, userPersons: { include: { person: { select: { firstName: true, lastName: true } } } } },
    });
    const person = parent?.userPersons[0]?.person;
    const children = await getParentChildren(tx, principal.userId);
    const unreadMessages = await countUnreadConversations(tx, principal.userId);
    // Photos des enfants : URLs signées courtes, pour l'avatar de l'en-tête.
    // Le stockage peut être indisponible — on retombe alors sur les initiales.
    const photos = new Map<string, string>();
    const withPhoto = await tx.person.findMany({
      where: { id: { in: children.map((c) => c.id) }, photoFileId: { not: null } },
      select: { id: true, photoFile: { select: { s3Key: true } } },
    });
    for (const p of withPhoto) {
      if (!p.photoFile) continue;
      try {
        photos.set(p.id, await presignedGet(p.photoFile.s3Key, 15 * 60));
      } catch {
        /* photo indisponible : initiales */
      }
    }
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
        photoUrl: photos.get(c.id) ?? null,
      })),
    };
  });

  return Response.json(data);
}
