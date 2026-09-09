import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { localizedLabel } from '@/lib/localized-name';
import { DEFAULT_WEIGHTS } from '@/lib/exam-grading';
import {
  GradingRuleForm,
  ImportPresetButton,
  TrackCoefficients,
  type LevelRow,
  type SubjectOpt,
} from './client';

/**
 * Paramétrage des filières (spécialités) et des barèmes.
 *
 * Deux réglages distincts y cohabitent :
 *  - le **coefficient par matière**, porté par la filière (SMA ≠ Lettres) ;
 *  - la **pondération CC / semestriel / régional / national**, portée par le
 *    niveau (Tronc commun ≠ 1BAC ≠ 2BAC).
 */
export default async function TracksSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission('tenants.manage');
  const t = await getTranslations('admin.settings.tracks');
  const session = (await auth())!;

  const { levels, subjects, academicYearId, yearLabel } = await withTenant(
    session.user.tenantId,
    async (tx) => {
      const year = await tx.academicYear.findFirst({
        where: { active: true },
        select: { id: true, label: true },
      });

      const [levelRows, subjectRows, trackRows, ruleRows] = await Promise.all([
        tx.level.findMany({
          include: { cycle: { select: { label: true, labelAr: true, order: true } } },
          orderBy: [{ cycle: { order: 'asc' } }, { order: 'asc' }],
        }),
        tx.subject.findMany({
          select: { id: true, label: true, labelAr: true, order: true },
          orderBy: [{ order: 'asc' }, { label: 'asc' }],
        }),
        tx.track.findMany({
          where: { active: true },
          include: {
            coefficients: { select: { subjectId: true, coefficient: true, certifying: true } },
            blueprints: {
              select: { subjectId: true, durationMin: true, type: true, paperGroup: true },
            },
          },
          orderBy: [{ order: 'asc' }, { label: 'asc' }],
        }),
        year
          ? tx.gradingRule.findMany({
              where: { academicYearId: year.id, trackId: null },
              select: {
                id: true,
                levelId: true,
                ccWeight: true,
                semesterWeight: true,
                regionalWeight: true,
                nationalWeight: true,
                locked: true,
              },
            })
          : Promise.resolve([]),
      ]);

      const tracksByLevel = new Map<string, typeof trackRows>();
      for (const tr of trackRows) {
        const arr = tracksByLevel.get(tr.levelId) ?? [];
        arr.push(tr);
        tracksByLevel.set(tr.levelId, arr);
      }
      const ruleByLevel = new Map(ruleRows.map((r) => [r.levelId, r]));

      // Seuls les niveaux qui portent des filières sont affichés : au collège
      // et au primaire, la notion n'existe pas et la page serait illisible.
      const levels: LevelRow[] = levelRows
        .filter((l) => (tracksByLevel.get(l.id) ?? []).length > 0)
        .map((l) => {
          const rule = ruleByLevel.get(l.id);
          // Sans règle enregistrée, on propose le barème réglementaire déduit
          // du code de niveau plutôt qu'un formulaire vide.
          const preset = l.code.startsWith('2bac')
            ? DEFAULT_WEIGHTS.BAC2
            : l.code.startsWith('1bac')
              ? DEFAULT_WEIGHTS.BAC1
              : DEFAULT_WEIGHTS.TRONC_COMMUN;
          return {
            id: l.id,
            label: localizedLabel(locale, l.label, l.labelAr),
            cycleLabel: localizedLabel(locale, l.cycle.label, l.cycle.labelAr),
            tracks: (tracksByLevel.get(l.id) ?? []).map((tr) => ({
              id: tr.id,
              code: tr.code,
              label: localizedLabel(locale, tr.label, tr.labelAr),
              levelId: tr.levelId,
              coefficients: tr.coefficients,
              blueprints: tr.blueprints,
            })),
            rule: {
              id: rule?.id ?? null,
              cc: rule?.ccWeight ?? preset.cc,
              semester: rule?.semesterWeight ?? preset.semester,
              regional: rule?.regionalWeight ?? preset.regional,
              national: rule?.nationalWeight ?? preset.national,
              locked: rule?.locked ?? false,
            },
          };
        });

      const subjects: SubjectOpt[] = subjectRows.map((s) => ({
        id: s.id,
        label: localizedLabel(locale, s.label, s.labelAr),
      }));

      return {
        levels,
        subjects,
        academicYearId: year?.id ?? null,
        yearLabel: year?.label ?? null,
      };
    },
  );

  return (
    <div className="px-3 py-3">
      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-0.5 text-sm text-slate-600">{t('subtitle')}</p>
        {yearLabel && <p className="mt-0.5 text-xs text-slate-500">{t('year', { year: yearLabel })}</p>}
      </header>

      <div className="max-w-3xl">
        <ImportPresetButton />
      </div>

      {!academicYearId && (
        <div className="mt-4 max-w-3xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('noActiveYear')}
        </div>
      )}

      {levels.length === 0 ? (
        <div className="mt-4 max-w-3xl rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
          {t('empty')}
        </div>
      ) : (
        <div className="mt-5 space-y-6">
          {levels.map((level) => (
            <section key={level.id} className="max-w-3xl">
              <div className="mb-2 flex flex-wrap items-baseline gap-2">
                <h2 className="text-base font-semibold text-slate-900">{level.label}</h2>
                <span className="text-xs text-slate-400">{level.cycleLabel}</span>
                <span className="text-xs text-slate-500">
                  · {t('trackCount', { count: level.tracks.length })}
                </span>
              </div>

              {academicYearId && (
                <GradingRuleForm academicYearId={academicYearId} level={level} />
              )}

              <div className="mt-2 space-y-1.5">
                {level.tracks.map((track) => (
                  <TrackCoefficients key={track.id} track={track} subjects={subjects} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
