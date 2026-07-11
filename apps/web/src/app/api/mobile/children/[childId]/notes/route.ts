import { withTenant } from '@/lib/db';
import { verifyMobileToken } from '@/lib/mobile-auth';
import { loadParentChildContext } from '@/lib/parent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/mobile/children/[childId]/notes?period=<id>
 * → notes de l'enfant pour la période (défaut : période courante).
 */
export async function GET(req: Request, ctx: { params: Promise<{ childId: string }> }) {
  const { childId } = await ctx.params;
  const principal = await verifyMobileToken(req);
  if (!principal) return Response.json({ error: 'Non authentifié.' }, { status: 401 });

  const url = new URL(req.url);
  const requestedPeriod = url.searchParams.get('period');

  const data = await withTenant(principal.tenantId, async (tx) => {
    const child = await loadParentChildContext(tx, principal.userId, childId);
    if (!child) return 'forbidden' as const;
    if (!child.classId) return { periods: [], periodId: null, evaluations: [] };

    const year = await tx.academicYear.findFirst({
      where: { active: true },
      select: { periods: { orderBy: { startDate: 'asc' }, select: { id: true, label: true, startDate: true, endDate: true } } },
    });
    const periods = year?.periods ?? [];
    const now = new Date();
    const current = periods.find((p) => p.startDate <= now && now <= p.endDate) ?? periods[periods.length - 1] ?? null;
    const periodId = (requestedPeriod && periods.some((p) => p.id === requestedPeriod) ? requestedPeriod : current?.id) ?? null;
    if (!periodId) return { periods, periodId: null, evaluations: [] };

    const evals = await tx.evaluation.findMany({
      where: { classId: child.classId, periodId },
      orderBy: { date: 'desc' },
      select: {
        id: true,
        label: true,
        date: true,
        maxValue: true,
        weight: true,
        subject: { select: { label: true } },
        grades: { select: { studentId: true, value: true } },
      },
    });
    const evaluations = evals.map((e) => {
      const childValue = e.grades.find((g) => g.studentId === childId)?.value ?? null;
      const vals = e.grades.map((g) => g.value).filter((v): v is number => v !== null);
      const avg = vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100 : null;
      return {
        id: e.id,
        subject: e.subject.label,
        label: e.label,
        date: e.date,
        maxValue: Number(e.maxValue),
        coefficient: Number(e.weight),
        value: childValue,
        classAverage: avg,
      };
    });
    return { periods: periods.map((p) => ({ id: p.id, label: p.label })), periodId, evaluations };
  });

  if (data === 'forbidden') return Response.json({ error: 'Accès refusé.' }, { status: 403 });
  return Response.json(data);
}
