import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { requireRoleCode } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { loadActiveFramework, loadMasteryScale } from '@/lib/competences';
import { SubjectPicker, LevelPicker } from './client';
import { localizedLabel } from '@/lib/localized-name';

/**
 * Référentiel de compétences & aptitudes — administration (Paramétrage).
 * Le mapping matière et l'activation par niveau relèvent du paramétrage de
 * l'établissement ; la saisie et les bilans restent dans le menu « Compétences ».
 */
export default async function SettingsCompetencesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireRoleCode(['tenant_admin', 'direction']);
  const session = (await auth())!;
  const t = await getTranslations('admin.competences');

  const kind: 'DISCIPLINARY' | 'TRANSVERSAL' =
    sp.kind === 'TRANSVERSAL' ? 'TRANSVERSAL' : 'DISCIPLINARY';

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const framework = await loadActiveFramework(tx);
    if (!framework) return null;

    const [nodes, subjects, levels, scale] = await Promise.all([
      tx.competencyNode.findMany({
        // Un domaine (depth 0) contient à la fois des Compétences et des
        // Aptitudes : on récupère tous les domaines + les nœuds du type choisi.
        where: { frameworkId: framework.id, OR: [{ depth: 0 }, { kind }] },
        select: {
          id: true,
          parentId: true,
          labelFr: true,
          descriptor: true,
          subjectId: true,
          depth: true,
          order: true,
          isLeaf: true,
          levels: { select: { levelId: true } },
        },
        orderBy: [{ depth: 'asc' }, { order: 'asc' }],
      }),
      tx.subject.findMany({ orderBy: { label: 'asc' }, select: { id: true, label: true } }),
      tx.level.findMany({
        orderBy: [{ cycle: { order: 'asc' } }, { order: 'asc' }],
        select: { id: true, label: true, labelAr: true, cycle: { select: { label: true, labelAr: true } } },
      }),
      loadMasteryScale(tx),
    ]);

    const byParent = new Map<string | null, typeof nodes>();
    for (const n of nodes) {
      const k = n.parentId ?? null;
      const arr = byParent.get(k) ?? [];
      arr.push(n);
      byParent.set(k, arr);
    }
    const domains = (byParent.get(null) ?? [])
      .map((d) => ({
        ...d,
        competencies: (byParent.get(d.id) ?? []).map((c) => ({
          ...c,
          leaves: byParent.get(c.id) ?? [],
        })),
      }))
      // Masque les domaines sans nœud du type affiché.
      .filter((d) => d.competencies.length > 0);

    return {
      framework,
      domains,
      subjects,
      levels: levels.map((l) => ({ id: l.id, label: `${localizedLabel(locale, l.cycle.label, l.cycle.labelAr)} · ${localizedLabel(locale, l.label, l.labelAr)}` })),
      scale,
      leafCount: nodes.filter((n) => n.isLeaf).length,
    };
  });

  if (!data) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <h2 className="text-lg font-semibold text-slate-700">{t('title')}</h2>
        <p className="mt-2 text-sm text-slate-400">{t('noFramework')}</p>
      </div>
    );
  }

  const tab = (k: 'DISCIPLINARY' | 'TRANSVERSAL', label: string) => (
    <a href={`?kind=${k}`} className={`folder-tab ${kind === k ? 'is-active' : ''}`}>
      {label}
    </a>
  );

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-0.5 text-sm text-slate-600">
          {data.framework.label} · {t('itemCount', { count: data.leafCount })}
        </p>
      </div>

      {/* Échelle de maîtrise */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-brand-200 bg-white px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('scale')}</span>
        {data.scale.map((m) => (
          <span
            key={m.id}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: `${m.color}1a`, color: m.color }}
          >
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
            {m.label}
          </span>
        ))}
      </div>

      <nav className="folder-tabs mb-4">
        {tab('DISCIPLINARY', t('tabDisciplinary'))}
        {tab('TRANSVERSAL', t('tabTransversal'))}
      </nav>

      <div className="space-y-4">
        {data.domains.map((d) => (
          <section key={d.id} className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
            <div className="border-b border-slate-100 bg-brand-50 px-4 py-2.5">
              <h2 className="text-sm font-bold text-brand-800">{d.labelFr}</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {d.competencies.map((c) => (
                <div key={c.id} className="px-4 py-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-800">{c.labelFr}</h3>
                    <LevelPicker
                      competencyId={c.id}
                      levels={data.levels}
                      selected={[...new Set(c.leaves.flatMap((l) => l.levels.map((x) => x.levelId)))]}
                    />
                  </div>
                  <ul className="space-y-1.5">
                    {c.leaves.map((l) => (
                      <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50/60 px-3 py-1.5">
                        <div className="min-w-0">
                          <div className="text-sm text-slate-800">{l.labelFr}</div>
                          {l.descriptor && <div className="text-[11px] italic text-slate-400">{l.descriptor}</div>}
                        </div>
                        <SubjectPicker nodeId={l.id} subjectId={l.subjectId} subjects={data.subjects} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-slate-400">{t('hint')}</p>
    </div>
  );
}
