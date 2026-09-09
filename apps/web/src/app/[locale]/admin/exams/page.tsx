import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { localizedLabel } from '@/lib/localized-name';
import {
  NewSessionForm,
  SessionStatusButtons,
  type LevelOpt,
  type PeriodOpt,
  type TrackOpt,
} from './client';

/**
 * Sessions d'examen : semestriel local, Régional (1BAC), National (2BAC).
 * Le contrôle continu reste géré par les évaluations de classe — cet écran ne
 * traite que la couche certificative.
 */
export default async function ExamsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission('tenants.manage');
  const t = await getTranslations('admin.exams');
  const session = (await auth())!;

  const { sessions, levels, tracks, periods, yearLabel } = await withTenant(
    session.user.tenantId,
    async (tx) => {
      const year = await tx.academicYear.findFirst({
        where: { active: true },
        select: { id: true, label: true },
      });
      if (!year) {
        return { sessions: [], levels: [], tracks: [], periods: [], yearLabel: null };
      }

      const [sessionRows, trackRows, periodRows] = await Promise.all([
        tx.examSession.findMany({
          where: { academicYearId: year.id },
          include: {
            level: { select: { label: true, labelAr: true } },
            period: { select: { label: true, labelAr: true } },
            tracks: { include: { track: { select: { label: true, labelAr: true } } } },
            _count: { select: { papers: true } },
          },
          orderBy: [{ startDate: 'desc' }],
        }),
        tx.track.findMany({
          where: { active: true },
          include: { level: { select: { id: true, label: true, labelAr: true, order: true } } },
          orderBy: [{ order: 'asc' }],
        }),
        tx.period.findMany({
          where: { academicYearId: year.id },
          select: { id: true, label: true, labelAr: true },
          orderBy: { startDate: 'asc' },
        }),
      ]);

      // Seuls les niveaux porteurs de filières ouvrent une session d'examen
      // certificatif — c'est la filière qui détermine les épreuves.
      const levelMap = new Map<string, LevelOpt>();
      for (const tr of trackRows) {
        if (!levelMap.has(tr.level.id)) {
          levelMap.set(tr.level.id, {
            id: tr.level.id,
            label: localizedLabel(locale, tr.level.label, tr.level.labelAr),
          });
        }
      }

      return {
        sessions: sessionRows.map((s) => ({
          id: s.id,
          label: s.label,
          kind: s.kind,
          status: s.status as 'DRAFT' | 'PUBLISHED' | 'CLOSED',
          levelLabel: localizedLabel(locale, s.level.label, s.level.labelAr),
          periodLabel: s.period ? localizedLabel(locale, s.period.label, s.period.labelAr) : null,
          startDate: s.startDate,
          endDate: s.endDate,
          paperCount: s._count.papers,
          anonymized: s.anonymized,
          trackLabels: s.tracks.map((x) => localizedLabel(locale, x.track.label, x.track.labelAr)),
        })),
        levels: [...levelMap.values()],
        tracks: trackRows.map(
          (tr): TrackOpt => ({
            id: tr.id,
            label: localizedLabel(locale, tr.label, tr.labelAr),
            levelId: tr.levelId,
          }),
        ),
        periods: periodRows.map(
          (p): PeriodOpt => ({ id: p.id, label: localizedLabel(locale, p.label, p.labelAr) }),
        ),
        yearLabel: year.label,
      };
    },
  );

  const badge: Record<string, string> = {
    DRAFT: 'bg-slate-200 text-slate-700',
    PUBLISHED: 'bg-emerald-100 text-emerald-800',
    CLOSED: 'bg-red-100 text-red-800',
  };

  return (
    <div className="px-3 py-3">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-slate-600">{t('subtitle')}</p>
          {yearLabel && <p className="mt-0.5 text-xs text-slate-500">{t('year', { year: yearLabel })}</p>}
        </div>
        <Link
          href={`/${locale}/admin/settings/tracks`}
          className="text-xs text-brand-700 hover:underline"
        >
          {t('settingsLink')} →
        </Link>
      </header>

      {levels.length === 0 ? (
        <div className="max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 text-sm text-amber-900">
          <strong>⚠ {t('noTracks.title')}</strong>
          <p className="mt-1">{t('noTracks.hint')}</p>
          <Link
            href={`/${locale}/admin/settings/tracks`}
            className="mt-2 inline-block font-medium text-amber-800 underline"
          >
            {t('noTracks.action')} →
          </Link>
        </div>
      ) : (
        <div className="max-w-3xl">
          <NewSessionForm levels={levels} tracks={tracks} periods={periods} />
        </div>
      )}

      <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 table-head text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-start">{t('table.label')}</th>
              <th className="px-4 py-3 text-start">{t('table.kind')}</th>
              <th className="px-4 py-3 text-start">{t('table.level')}</th>
              <th className="px-4 py-3 text-start">{t('table.dates')}</th>
              <th className="px-4 py-3 text-end">{t('table.papers')}</th>
              <th className="px-4 py-3 text-start">{t('table.status')}</th>
              <th className="px-4 py-3 text-end">{t('table.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sessions.map((s) => (
              <tr key={s.id} className="align-top">
                <td className="px-4 py-3">
                  <a
                    href={`/${locale}/admin/exams/${s.id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {s.label}
                  </a>
                  {s.trackLabels.length > 0 && (
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {s.trackLabels.join(' · ')}
                    </div>
                  )}
                  {s.periodLabel && (
                    <div className="text-[11px] text-slate-400">{s.periodLabel}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-700">
                  {t(`kinds.${s.kind}` as never)}
                  {s.anonymized && (
                    <span className="ms-1 rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-600">
                      {t('anonymizedTag')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-700">{s.levelLabel}</td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {new Date(s.startDate).toLocaleDateString(locale)} →{' '}
                  {new Date(s.endDate).toLocaleDateString(locale)}
                </td>
                <td className="px-4 py-3 text-end tabular-nums text-slate-700">{s.paperCount}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${badge[s.status] ?? ''}`}
                  >
                    {t(`status.${s.status}` as never)}
                  </span>
                </td>
                <td className="px-4 py-3 text-end">
                  <SessionStatusButtons sessionId={s.id} status={s.status} />
                </td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  {t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 max-w-3xl text-xs text-slate-500">{t('nextPhase')}</p>
    </div>
  );
}
