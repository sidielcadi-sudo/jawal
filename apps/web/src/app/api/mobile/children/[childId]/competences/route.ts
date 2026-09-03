import { withTenant } from '@/lib/db';
import { verifyMobileParent } from '@/lib/mobile-auth';
import { loadParentChildContext } from '@/lib/parent';
import { pickPeriodId } from '@/lib/periods';
import { loadActiveFramework } from '@/lib/competences';
import { computeReports, type StudentReport } from '@/lib/competency-report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/mobile/children/[childId]/competences
 * → bilan de compétences de l'enfant pour la période courante.
 *
 * Même règle de source que le portail web et le bulletin : le bilan **figé**
 * prime ; à défaut, calcul à la volée marqué `provisional`. La période
 * précédente est également renvoyée pour afficher la progression.
 */
export async function GET(req: Request, ctx: { params: Promise<{ childId: string }> }) {
  const { childId } = await ctx.params;
  const principal = await verifyMobileParent(req);
  if (!principal) return Response.json({ error: 'Non authentifié.' }, { status: 401 });

  const data = await withTenant(principal.tenantId, async (tx) => {
    const child = await loadParentChildContext(tx, principal.userId, childId);
    if (!child) return 'forbidden' as const;
    if (!child.year) return { available: false as const };

    const framework = await loadActiveFramework(tx);
    if (!framework) return { available: false as const };

    const periods = await tx.period.findMany({
      where: { academicYearId: child.year.id },
      orderBy: { startDate: 'asc' },
      select: { id: true, label: true, startDate: true, endDate: true },
    });
    const periodId = pickPeriodId(periods) ?? periods[periods.length - 1]?.id ?? null;
    if (!periodId) return { available: false as const };

    const klass = child.classId
      ? await tx.class.findUnique({ where: { id: child.classId }, select: { levelId: true } })
      : null;
    const levelId = klass?.levelId ?? null;

    const loadReport = async (pid: string): Promise<StudentReport | null> => {
      const frozen = await tx.competencyReport.findUnique({
        where: { studentId_periodId: { studentId: childId, periodId: pid } },
        select: { data: true },
      });
      if (frozen) return frozen.data as unknown as StudentReport;
      const live = await computeReports(tx, {
        frameworkId: framework.id,
        periodId: pid,
        studentIds: [childId],
        levelId,
      });
      return live.get(childId) ?? null;
    };

    const isFrozen = !!(await tx.competencyReport.findUnique({
      where: { studentId_periodId: { studentId: childId, periodId } },
      select: { studentId: true },
    }));
    const report = await loadReport(periodId);
    if (!report) return { available: false as const };

    // Période précédente → deltas par domaine.
    const idx = periods.findIndex((p) => p.id === periodId);
    const prevId = idx > 0 ? periods[idx - 1]!.id : null;
    const prev = prevId ? await loadReport(prevId) : null;
    const prevByDomain = new Map(
      (prev?.domains ?? []).filter((d) => d.rate !== null).map((d) => [d.id, d.rate!]),
    );

    const scale = await tx.masteryLevel.findMany({ orderBy: { order: 'asc' } });

    return {
      available: true as const,
      periodLabel: periods.find((p) => p.id === periodId)?.label ?? '',
      provisional: !isFrozen,
      disciplinaryRate: report.disciplinaryRate,
      transversalRate: report.transversalRate,
      covered: report.covered,
      total: report.total,
      scale: scale.map((m) => ({ code: m.code, label: m.labelFr, color: m.color })),
      domains: report.domains
        .filter((d) => d.total > 0)
        .map((d) => {
          const before = prevByDomain.get(d.id);
          return {
            id: d.id,
            label: d.label,
            kind: d.kind,
            rate: d.rate,
            covered: d.covered,
            total: d.total,
            delta: d.rate !== null && before !== undefined ? d.rate - before : null,
            competencies: d.competencies
              .filter((c) => c.total > 0)
              .map((c) => ({ id: c.id, label: c.label, rate: c.rate, kind: c.kind })),
          };
        }),
    };
  });

  if (data === 'forbidden') return Response.json({ error: 'Accès refusé.' }, { status: 403 });
  return Response.json(data);
}
