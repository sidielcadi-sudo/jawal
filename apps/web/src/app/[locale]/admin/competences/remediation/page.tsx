import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { requireRoleCode } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { pickPeriodId } from '@/lib/periods';
import { loadActiveFramework, loadLeaves, loadMasteryScale } from '@/lib/competences';
import { RemediationFilters, EnrollGroup } from './client';
import { personDisplayName, localizedLabel } from '@/lib/localized-name';

/**
 * Remédiation ciblée : on part d'une compétence pour obtenir la liste des
 * élèves qui ne la maîtrisent pas — l'inverse du flux habituel. C'est ce qui
 * transforme le module en outil de pilotage plutôt qu'en simple registre.
 */
export default async function RemediationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ node?: string; period?: string; level?: string; max?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireRoleCode(['tenant_admin', 'direction', 'cpe', 'scolarite']);
  const session = (await auth())!;
  const t = await getTranslations('admin.competences');

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const framework = await loadActiveFramework(tx);
    const year = await tx.academicYear.findFirst({
      where: { active: true },
      include: { periods: { orderBy: { startDate: 'asc' } } },
    });
    if (!framework || !year) return null;

    const [leaves, scale, levels] = await Promise.all([
      loadLeaves(tx, framework.id),
      loadMasteryScale(tx),
      tx.level.findMany({
        orderBy: [{ cycle: { order: 'asc' } }, { order: 'asc' }],
        select: { id: true, label: true, labelAr: true, cycle: { select: { label: true, labelAr: true } } },
      }),
    ]);
    const nodeId = leaves.find((l) => l.id === sp.node)?.id ?? leaves[0]?.id ?? null;
    const node = leaves.find((l) => l.id === nodeId) ?? null;
    const periodId = pickPeriodId(year.periods, sp.period) ?? year.periods[0]?.id ?? null;
    // Seuil : niveau maximum considéré « à remédier » (par défaut ECA = 1).
    const maxValue = sp.max !== undefined ? Number(sp.max) : 1;
    const levelId = levels.find((l) => l.id === sp.level)?.id ?? null;

    if (!nodeId || !periodId) return { framework, leaves, scale, levels, node, nodeId, periodId, rows: [], courses: [], maxValue, levelId };

    // Élèves actifs (filtrés par niveau si demandé) et leurs évaluations.
    const scs = await tx.studentClass.findMany({
      where: {
        unenrolledAt: null,
        student: { deletedAt: null, enrollments: { some: { status: 'ACTIVE' } } },
        class: { academicYearId: year.id, deletedAt: null, ...(levelId ? { levelId } : {}) },
      },
      select: {
        student: { select: { id: true, firstName: true, lastName: true, firstNameAr: true, lastNameAr: true } },
        class: { select: { name: true, nameAr: true } },
      },
    });
    const studentIds = scs.map((s) => s.student.id);
    const assessments = studentIds.length
      ? await tx.competencyAssessment.findMany({
          where: { nodeId, periodId, studentId: { in: studentIds } },
          select: { studentId: true, masteryLevelId: true },
        })
      : [];
    const valueById = new Map(scale.map((m) => [m.id, m.value]));
    const byStudent = new Map<string, number[]>();
    for (const a of assessments) {
      const v = valueById.get(a.masteryLevelId);
      if (v === undefined) continue;
      byStudent.set(a.studentId, [...(byStudent.get(a.studentId) ?? []), v]);
    }

    // Consolidation (moyenne arrondie) puis filtre sur le seuil.
    const rows = scs
      .map((s) => {
        const vals = byStudent.get(s.student.id);
        const consolidated =
          vals && vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
        return {
          studentId: s.student.id,
          name: personDisplayName(locale, s.student),
          className: localizedLabel(locale, s.class.name, s.class.nameAr),
          value: consolidated,
        };
      })
      .filter((r) => r.value !== null && r.value <= maxValue)
      .sort((a, b) => a.value! - b.value! || a.name.localeCompare(b.name));

    // Cours de soutien actifs pour constituer le groupe.
    const courses = await tx.supportCourse.findMany({
      where: { academicYearId: year.id, active: true },
      select: { id: true, title: true },
      orderBy: { title: 'asc' },
    });

    return { framework, leaves, scale, levels, node, nodeId, periodId, rows, courses, maxValue, levelId, periods: year.periods };
  });

  if (!data) {
    return (
      <div className="px-3 py-3">
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="text-lg font-semibold text-slate-700">{t('remediationTitle')}</h2>
          <p className="mt-2 text-sm text-slate-400">{t('noFramework')}</p>
          {/* Sans référentiel sur l'année, l'écran est un cul-de-sac : on renvoie
              là où on l'importe. */}
          <a
            href={`/${locale}/admin/settings/competences`}
            className="mt-3 inline-block rounded-lg border border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            {t('goToSettings')}
          </a>
        </div>
      </div>
    );
  }

  const scaleById = new Map(data.scale.map((m) => [m.value, m]));

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">🎯 {t('remediationTitle')}</h1>
        <p className="mt-0.5 text-sm text-slate-600">{t('remediationSubtitle')}</p>
      </header>

      <nav className="folder-tabs mb-4">
        <a href={`/${locale}/admin/competences/bilan`} className="folder-tab">
          {t('tabBilan')}
        </a>
        <a href={`/${locale}/admin/competences/remediation`} className="folder-tab is-active">
          {t('tabRemediation')}
        </a>
      </nav>

      <div className="mb-4 rounded-2xl border border-brand-200 bg-white px-4 py-3">
        <RemediationFilters
          items={data.leaves.map((l) => ({
            id: l.id,
            label: l.label,
            group: l.kind === 'TRANSVERSAL' ? t('tabTransversal') : l.domain,
          }))}
          nodeId={data.nodeId ?? ''}
          periods={(data.periods ?? []).map((p) => ({ id: p.id, label: p.label, labelAr: p.labelAr }))}
          periodId={data.periodId ?? ''}
          levels={data.levels.map((l) => ({ id: l.id, label: `${localizedLabel(locale, l.cycle.label, l.cycle.labelAr)} · ${localizedLabel(locale, l.label, l.labelAr)}` }))}
          levelId={data.levelId}
          scale={data.scale.map((m) => ({ value: m.value, label: m.label }))}
          maxValue={data.maxValue}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">
          {t('remediationCount', { count: data.rows.length })}
        </h2>
        {data.rows.length > 0 && (
          <EnrollGroup
            courses={data.courses.map((c) => ({ id: c.id, label: c.title }))}
            studentIds={data.rows.map((r) => r.studentId)}
          />
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
            <tr>
              <th className="px-4 py-3 text-start">{t('student')}</th>
              <th className="px-4 py-3 text-start">{t('class')}</th>
              <th className="px-4 py-3 text-start">{t('currentLevel')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.rows.map((r) => {
              const m = scaleById.get(r.value!);
              return (
                <tr key={r.studentId}>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{r.name}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{r.className}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className="rounded-md px-2 py-0.5 text-xs font-semibold"
                      style={{ backgroundColor: `${m?.color ?? '#94a3b8'}1f`, color: m?.color ?? '#64748b' }}
                    >
                      {m?.label ?? '—'}
                    </span>
                  </td>
                </tr>
              );
            })}
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-slate-500">
                  {t('remediationEmpty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-slate-400">{t('remediationHint')}</p>
    </div>
  );
}
