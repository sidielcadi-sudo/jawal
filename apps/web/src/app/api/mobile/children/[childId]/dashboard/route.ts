import { withTenant } from '@/lib/db';
import { verifyMobileParent } from '@/lib/mobile-auth';
import { loadParentChildContext } from '@/lib/parent';
import { loadStudentDashboard } from '@/lib/student';
import { presignedGet } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/mobile/children/[childId]/dashboard
 * → synthèse de l'enfant : moyenne générale, taux de présence, moyennes par
 *   matière, carnet récent, absences récentes.
 *
 * Réutilise `loadStudentDashboard`, la même source que la page d'accueil du
 * portail élève : l'app mobile affiche donc exactement les mêmes chiffres,
 * sans second calcul à maintenir.
 */
export async function GET(req: Request, ctx: { params: Promise<{ childId: string }> }) {
  const { childId } = await ctx.params;
  const principal = await verifyMobileParent(req);
  if (!principal) return Response.json({ error: 'Non authentifié.' }, { status: 401 });

  const data = await withTenant(principal.tenantId, async (tx) => {
    const child = await loadParentChildContext(tx, principal.userId, childId);
    if (!child) return 'forbidden' as const;
    const dash = await loadStudentDashboard(tx, childId);
    if (!dash) return null;
    // Photo de l'élève : URL signée courte, renouvelée à chaque chargement de
    // l'accueil. Le stockage peut être indisponible — l'app retombe alors sur
    // les initiales, ce n'est pas une raison d'échouer.
    let photoUrl: string | null = null;
    const person = await tx.person.findUnique({
      where: { id: childId },
      select: { photoFile: { select: { s3Key: true } } },
    });
    if (person?.photoFile) {
      try {
        photoUrl = await presignedGet(person.photoFile.s3Key, 15 * 60);
      } catch {
        photoUrl = null;
      }
    }
    return { ...dash, photoUrl };
  });

  if (data === 'forbidden') return Response.json({ error: 'Accès refusé.' }, { status: 403 });
  if (!data) return Response.json({ error: 'Élève introuvable.' }, { status: 404 });
  return Response.json(data);
}
