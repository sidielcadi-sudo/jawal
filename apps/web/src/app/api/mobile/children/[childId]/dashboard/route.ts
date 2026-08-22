import { withTenant } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';
import { loadParentChildContext } from '@/lib/parent';
import { loadStudentDashboard } from '@/lib/student';

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
  const principal = await verifyMobileToken(req);
  if (!principal) return Response.json({ error: 'Non authentifié.' }, { status: 401 });

  const data = await withTenant(principal.tenantId, async (tx) => {
    const child = await loadParentChildContext(tx, principal.userId, childId);
    if (!child) return 'forbidden' as const;
    return await loadStudentDashboard(tx, childId);
  });

  if (data === 'forbidden') return Response.json({ error: 'Accès refusé.' }, { status: 403 });
  if (!data) return Response.json({ error: 'Élève introuvable.' }, { status: 404 });
  return Response.json(data);
}
