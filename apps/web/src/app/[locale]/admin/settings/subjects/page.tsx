import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { SubjectCreateForm, SubjectRowActions } from './client';
import { localizedLabel } from '@/lib/localized-name';

export default async function SubjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations('admin.settings.subjects');

  const session = (await auth())!;
  const { allSubjects, cycles, cycleOfSubject, trackRows } = await withTenant(
    session.user.tenantId,
    async (tx) => {
      const [allSubjects, cycles, trackRows] = await Promise.all([
        tx.subject.findMany({
          orderBy: [{ order: 'asc' }, { label: 'asc' }],
          include: {
            curriculumEntries: {
              include: { level: true },
              orderBy: { level: { order: 'asc' } },
            },
          },
        }),
        tx.cycle.findMany({ orderBy: { order: 'asc' } }),
        // Au lycée, le rattachement passe par la filière et non par le niveau.
        tx.trackSubjectCoefficient.findMany({
          where: { weeklyHours: { not: null } },
          select: {
            subjectId: true,
            weeklyHours: true,
            ccCoefficient: true,
            track: {
              select: {
                id: true,
                label: true,
                labelAr: true,
                level: { select: { cycleId: true, order: true } },
              },
            },
          },
        }),
      ]);
      const levelCycle = new Map<string, string>();
      for (const s of allSubjects) {
        for (const c of s.curriculumEntries) levelCycle.set(c.levelId, c.level.cycleId);
      }
      // Une matière appartient à un cycle dès qu'elle y est au programme —
      // les Mathématiques apparaissent donc dans les trois onglets, ce qui est
      // la réalité : c'est la même matière enseignée partout.
      const cycleOfSubject = new Map<string, Set<string>>();
      const add = (subjectId: string, cycleId: string) => {
        const set = cycleOfSubject.get(subjectId) ?? new Set<string>();
        set.add(cycleId);
        cycleOfSubject.set(subjectId, set);
      };
      for (const s of allSubjects) {
        for (const c of s.curriculumEntries) add(s.id, c.level.cycleId);
      }
      for (const r of trackRows) add(r.subjectId, r.track.level.cycleId);
      return { allSubjects, cycles, cycleOfSubject, trackRows };
    },
  );

  // Onglet courant. « Non rattachées » n'apparaît que s'il y a des orphelines.
  const orphans = allSubjects.filter((s) => !cycleOfSubject.get(s.id)?.size);
  const tabs: { id: string; label: string }[] = [
    ...cycles.map((c) => ({ id: c.id, label: localizedLabel(locale, c.label, c.labelAr) })),
    ...(orphans.length > 0 ? [{ id: 'none', label: t('tabs.unassigned') }] : []),
  ];
  const currentTab = sp.cycle ?? tabs[0]?.id ?? 'none';
  const subjects =
    currentTab === 'none'
      ? orphans
      : allSubjects.filter((s) => cycleOfSubject.get(s.id)?.has(currentTab));

  return (
    <div className="space-y-4">
      {/* Onglets par cycle : une matière y figure dès qu'elle est au programme
          d'un niveau (ou d'une filière, au lycée). */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={`/${locale}/admin/settings/subjects?cycle=${tab.id}`}
            className={[
              'rounded-lg px-3 py-1.5 text-sm transition-colors',
              currentTab === tab.id
                ? 'bg-brand-600 text-white shadow'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
            ].join(' ')}
          >
            {tab.label}
            <span className="ms-1.5 text-xs opacity-70">
              {tab.id === 'none'
                ? orphans.length
                : allSubjects.filter((s) => cycleOfSubject.get(s.id)?.has(tab.id)).length}
            </span>
          </Link>
        ))}
      </div>

    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section className="lg:col-span-2">
        <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
              <tr>
                <th className="px-4 py-3 text-start">{t('table.code')}</th>
                <th className="px-4 py-3 text-start">{t('table.label')}</th>
                <th className="px-4 py-3 text-end">{t('table.scale')}</th>
                <th className="px-4 py-3 text-end">{t('table.coefficient')}</th>
                <th className="px-4 py-3 text-start">{t('table.programme')}</th>
                <th className="px-4 py-3 text-end">{t('table.order')}</th>
                <th className="px-4 py-3 text-end">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subjects.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 font-mono text-xs">{s.code}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{s.label}</td>
                  <td className="px-4 py-3 text-end tabular-nums">/{s.scale}</td>
                  <td className="px-4 py-3 text-end tabular-nums text-xs text-slate-500">×{s.coefficient}</td>
                  {/* Programme : par niveau au primaire et au collège, par
                      filière au lycée — la donnée n'est pas au même endroit,
                      mais l'agent doit la lire au même endroit. */}
                  <td className="px-4 py-3 text-xs">
                    {(() => {
                      const levelChips = s.curriculumEntries.filter(
                        (c) => currentTab === 'none' || c.level.cycleId === currentTab,
                      );
                      const trackChips = trackRows.filter(
                        (r) =>
                          r.subjectId === s.id &&
                          (currentTab === 'none' || r.track.level.cycleId === currentTab),
                      );
                      if (levelChips.length === 0 && trackChips.length === 0) {
                        return <span className="text-slate-400">{t('table.noProgramme')}</span>;
                      }
                      return (
                        <div className="flex flex-wrap gap-1">
                          {levelChips.map((c) => (
                            <Link
                              key={c.id}
                              href={`/${locale}/admin/settings/curriculum/programme?cycle=${c.level.cycleId}&level=${c.levelId}`}
                              className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700 hover:bg-brand-100 hover:text-brand-700"
                              title={`${localizedLabel(locale, c.level.label, c.level.labelAr)} · coef ${c.coefficient} · ${c.weeklyHours}h/sem`}
                            >
                              {c.level.code} ×{c.coefficient}
                              <span className="ms-1 text-slate-500">({c.weeklyHours}h)</span>
                            </Link>
                          ))}
                          {trackChips.map((r) => (
                            <Link
                              key={r.track.id}
                              href={`/${locale}/admin/settings/curriculum/programme?cycle=${r.track.level.cycleId}&track=${r.track.id}`}
                              className="rounded bg-brand-50 px-1.5 py-0.5 font-medium text-brand-800 hover:bg-brand-100"
                              title={`${localizedLabel(locale, r.track.label, r.track.labelAr)} · coef CC ${r.ccCoefficient ?? '—'} · ${r.weeklyHours}h/sem`}
                            >
                              {localizedLabel(locale, r.track.label, r.track.labelAr)} ×
                              {r.ccCoefficient ?? 1}
                              <span className="ms-1 text-brand-600">({r.weeklyHours}h)</span>
                            </Link>
                          ))}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-end text-xs text-slate-500">{s.order}</td>
                  <td className="px-4 py-3 text-end">
                    <SubjectRowActions
                      id={s.id}
                      initial={{
                        code: s.code,
                        label: s.label,
                        labelAr: s.labelAr,
                        scale: s.scale,
                        coefficient: s.coefficient,
                        order: s.order,
                      }}
                    />
                  </td>
                </tr>
              ))}
              {subjects.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    {t('empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          <p className="font-medium">{t('infoBox.title')}</p>
          <p className="mt-1">{t('infoBox.body')}</p>
          <Link
            href={`/${locale}/admin/settings/curriculum/programme`}
            className="mt-2 inline-block font-medium text-amber-900 underline hover:text-amber-700"
          >
            {t('infoBox.cta')} →
          </Link>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">{t('create')}</h2>
          <p className="mt-1 text-xs text-slate-500">{t('createHint')}</p>
          <div className="mt-4">
            <SubjectCreateForm />
          </div>
        </div>
      </aside>
    </div>
    </div>
  );
}
