import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { ProgrammeMatrix, ProgrammeAddRow } from './client';
import { TrackProgrammeAddRow, TrackProgrammeRow, type TrackCurriculumRow } from './track-client';
import { TrackSelect, type TrackGroup } from './track-select';
import { localizedLabel } from '@/lib/localized-name';

/**
 * Programme par niveau, organisé en onglets de cycle.
 *
 * Au primaire et au collège, le programme se définit **par niveau** : tous les
 * élèves d'une 1ʳᵉ année collège suivent la même grille. Au lycée, il se
 * définit **par filière** — un 2BAC Sciences Maths et un 2BAC Lettres n'ont ni
 * le même horaire ni les mêmes coefficients. L'onglet Lycée bascule donc sur
 * les filières, pas sur les niveaux.
 */
export default async function ProgrammePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ level?: string; track?: string; cycle?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations('admin.settings.programme');

  const session = (await auth())!;
  const data = await withTenant(session.user.tenantId, async (tx) => {
    const [cycles, levels, subjects, tracks] = await Promise.all([
      tx.cycle.findMany({ orderBy: { order: 'asc' } }),
      tx.level.findMany({
        include: { cycle: true },
        orderBy: [{ cycle: { order: 'asc' } }, { order: 'asc' }],
      }),
      tx.subject.findMany({ orderBy: [{ order: 'asc' }, { label: 'asc' }] }),
      tx.track.findMany({
        where: { active: true },
        include: {
          level: { select: { id: true, cycleId: true, order: true, label: true, labelAr: true } },
        },
        // L'ordre final est calculé plus bas : les `order` des filières se
        // recouvrent d'un niveau à l'autre (10, 20, 30 partout), un tri global
        // entrelacerait TC, 1BAC et 2BAC.
        orderBy: [{ label: 'asc' }],
      }),
    ]);

    // Cycle courant : celui demandé, sinon celui du 1ᵉʳ niveau existant.
    const currentCycleId = sp.cycle ?? levels[0]?.cycleId ?? cycles[0]?.id ?? null;
    const cycleTracks = tracks.filter((tr) => tr.level.cycleId === currentCycleId);
    // Un cycle « à filières » (le lycée) se pilote par filière.
    const byTrack = cycleTracks.length > 0;

    if (byTrack) {
      // Filière par défaut : la première du premier niveau (Tronc commun),
      // et non la première dans l'ordre alphabétique global.
      const ordered = [...cycleTracks].sort(
        (a, b) => a.level.order - b.level.order || a.label.localeCompare(b.label),
      );
      const currentTrackId = sp.track ?? ordered[0]?.id ?? null;
      const currentTrack = cycleTracks.find((tr) => tr.id === currentTrackId) ?? null;
      const rows = currentTrack
        ? await tx.trackSubjectCoefficient.findMany({
            where: { trackId: currentTrack.id, weeklyHours: { not: null } },
            include: { subject: true },
            orderBy: [{ order: 'asc' }],
          })
        : [];
      return {
        mode: 'track' as const,
        cycles,
        currentCycleId,
        levels,
        subjects,
        cycleTracks,
        currentTrack,
        trackRows: rows.map(
          (r): TrackCurriculumRow => ({
            subjectId: r.subjectId,
            subjectLabel: localizedLabel(locale, r.subject.label, r.subject.labelAr),
            weeklyHours: r.weeklyHours ?? 0,
            ccCoefficient: r.ccCoefficient ?? 1,
            examCoefficient: r.coefficient,
          }),
        ),
        currentLevel: null,
        entries: [],
      };
    }

    const cycleLevels = levels.filter((l) => l.cycleId === currentCycleId);
    const currentLevelId = sp.level ?? cycleLevels[0]?.id;
    const currentLevel = cycleLevels.find((l) => l.id === currentLevelId) ?? null;
    const entries = currentLevel
      ? await tx.curriculumSubject.findMany({
          where: { levelId: currentLevel.id },
          include: { subject: true },
          orderBy: [{ order: 'asc' }, { subject: { label: 'asc' } }],
        })
      : [];
    return {
      mode: 'level' as const,
      cycles,
      currentCycleId,
      levels,
      subjects,
      cycleTracks: [],
      currentTrack: null,
      trackRows: [],
      currentLevel,
      entries,
    };
  });

  const { cycles, currentCycleId, levels, subjects, cycleTracks, currentTrack, trackRows } = data;

  // Onglets : un par cycle qui porte au moins un niveau.
  const cycleTabs = cycles.filter((c) => levels.some((l) => l.cycleId === c.id));

  // Filières groupées par niveau, dans l'ordre pédagogique (Tronc commun →
  // 1ʳᵉ Bac → 2ᵉ Bac) et alphabétique à l'intérieur de chaque groupe.
  const trackGroups: TrackGroup[] = levels
    .filter((l) => l.cycleId === currentCycleId)
    .map((l) => ({
      levelId: l.id,
      levelLabel: localizedLabel(locale, l.label, l.labelAr),
      tracks: cycleTracks
        .filter((tr) => tr.levelId === l.id)
        .map((tr) => ({ id: tr.id, label: localizedLabel(locale, tr.label, tr.labelAr) }))
        .sort((a, b) => a.label.localeCompare(b.label, locale)),
    }))
    .filter((g) => g.tracks.length > 0);

  const totalHours =
    data.mode === 'track'
      ? trackRows.reduce((s, r) => s + r.weeklyHours, 0)
      : data.entries.reduce((s, e) => s + e.weeklyHours, 0);

  const usedSubjectIds = new Set(
    data.mode === 'track' ? trackRows.map((r) => r.subjectId) : data.entries.map((e) => e.subjectId),
  );
  const availableSubjects = subjects.filter((s) => !usedSubjectIds.has(s.id));

  const tabCls = (active: boolean) =>
    [
      'rounded-lg px-3 py-1.5 text-sm transition-colors',
      active
        ? 'bg-brand-600 text-white shadow'
        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
    ].join(' ');

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t('title')}</h2>
          <p className="text-xs text-slate-500">{t('subtitle')}</p>
        </div>
        <Link
          href={`/${locale}/admin/settings/curriculum`}
          className="text-xs text-slate-500 hover:text-brand-700"
        >
          ← {t('backToCurriculum')}
        </Link>
      </header>

      {/* Onglets de cycle : Primaire · Collège · Lycée */}
      <div className="flex flex-wrap gap-2">
        {cycleTabs.map((c) => (
          <Link
            key={c.id}
            href={`/${locale}/admin/settings/curriculum/programme?cycle=${c.id}`}
            className={tabCls(currentCycleId === c.id)}
          >
            {localizedLabel(locale, c.label, c.labelAr)}
          </Link>
        ))}
        {cycleTabs.length === 0 && <p className="text-sm text-slate-500">{t('noLevels')}</p>}
      </div>

      {/* Second niveau : au lycée un menu déroulant groupé par niveau (26
          filières feraient une bouillie de boutons), ailleurs des onglets. */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {data.mode === 'track' ? (
          <TrackSelect
            groups={trackGroups}
            currentTrackId={currentTrack?.id ?? null}
            cycleId={currentCycleId ?? ''}
            locale={locale}
          />
        ) : (
          levels
            .filter((l) => l.cycleId === currentCycleId)
            .map((l) => (
              <Link
                key={l.id}
                href={`/${locale}/admin/settings/curriculum/programme?cycle=${currentCycleId}&level=${l.id}`}
                className={tabCls(data.currentLevel?.id === l.id)}
              >
                {localizedLabel(locale, l.label, l.labelAr)}
              </Link>
            ))
        )}
      </div>

      {data.mode === 'track' && currentTrack && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-start">{t('table.subject')}</th>
                    <th className="px-4 py-3 text-end">{t('table.hours')}</th>
                    <th className="px-4 py-3 text-end">{t('table.ccCoefficient')}</th>
                    <th className="px-4 py-3 text-end">{t('table.examCoefficient')}</th>
                    <th className="px-4 py-3 text-end">{t('table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trackRows.map((r) => (
                    <TrackProgrammeRow key={r.subjectId} trackId={currentTrack.id} row={r} />
                  ))}
                  {trackRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                        {t('emptyTrack')}
                      </td>
                    </tr>
                  )}
                </tbody>
                {trackRows.length > 0 && (
                  <tfoot className="border-t border-slate-200 bg-slate-50 text-xs">
                    <tr>
                      <td className="px-4 py-2 font-medium text-slate-700">{t('totalHours')}</td>
                      <td className="px-4 py-2 text-end font-semibold tabular-nums text-slate-900">
                        {totalHours} h
                      </td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">{t('examCoefficientHint')}</p>
          </section>

          <aside>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-slate-700">{t('addSubject')}</h3>
              <p className="mt-1 text-xs text-slate-500">{t('addSubjectHintTrack')}</p>
              {availableSubjects.length === 0 ? (
                <p className="mt-3 text-xs text-amber-700">{t('allSubjectsAdded')}</p>
              ) : (
                <div className="mt-3">
                  <TrackProgrammeAddRow
                    trackId={currentTrack.id}
                    subjects={availableSubjects.map((s) => ({
                      id: s.id,
                      label: localizedLabel(locale, s.label, s.labelAr),
                    }))}
                  />
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {data.mode === 'level' && data.currentLevel && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 table-head text-xs uppercase tracking-wide text-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-start">{t('table.subject')}</th>
                    <th className="px-4 py-3 text-end">{t('table.hours')}</th>
                    <th className="px-4 py-3 text-end">{t('table.coefficient')}</th>
                    <th className="px-4 py-3 text-end">{t('table.order')}</th>
                    <th className="px-4 py-3 text-end">{t('table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.entries.map((e) => (
                    <ProgrammeMatrix
                      key={e.id}
                      id={e.id}
                      levelId={data.currentLevel!.id}
                      subjectId={e.subjectId}
                      subjectLabel={localizedLabel(locale, e.subject.label, e.subject.labelAr)}
                      weeklyHours={e.weeklyHours}
                      coefficient={e.coefficient}
                      order={e.order}
                    />
                  ))}
                  {data.entries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                        {t('empty')}
                      </td>
                    </tr>
                  )}
                </tbody>
                {data.entries.length > 0 && (
                  <tfoot className="border-t border-slate-200 bg-slate-50 text-xs">
                    <tr>
                      <td className="px-4 py-2 font-medium text-slate-700">{t('totalHours')}</td>
                      <td className="px-4 py-2 text-end font-semibold tabular-nums text-slate-900">
                        {totalHours} h
                      </td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>

          <aside>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-slate-700">{t('addSubject')}</h3>
              <p className="mt-1 text-xs text-slate-500">{t('addSubjectHint')}</p>
              {availableSubjects.length === 0 ? (
                <p className="mt-3 text-xs text-amber-700">{t('allSubjectsAdded')}</p>
              ) : (
                <div className="mt-3">
                  <ProgrammeAddRow
                    levelId={data.currentLevel.id}
                    subjects={availableSubjects.map((s) => ({
                      id: s.id,
                      label: localizedLabel(locale, s.label, s.labelAr),
                      defaultCoefficient: s.coefficient,
                    }))}
                  />
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
