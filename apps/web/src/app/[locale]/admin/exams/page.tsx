import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { currentUserRoleCodes, requirePermission } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { localizedLabel } from '@/lib/localized-name';
import { sessionEditLock, todayIso } from '@/lib/exam-kinds';
import {
  NewSessionForm,
  SessionManageButtons,
  SessionStatusButtons,
  type LevelOpt,
  type PeriodOpt,
  type TrackOpt,
} from './client';

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Sessions d'examen : contrôles, devoirs, examens internes et officiels.
 *
 * On y arrive depuis Notes (« Programmer un Examen ») : la page n'a plus
 * d'entrée propre dans le menu, et le fil d'Ariane y ramène.
 */
export default async function ExamsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePermission('tenants.manage');
  const t = await getTranslations('admin.exams');
  const session = (await auth())!;
  const canDelete = (await currentUserRoleCodes()).includes('tenant_admin');
  const today = todayIso();

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

      const [sessionRows, levelRows, trackRows, periodRows] = await Promise.all([
        tx.examSession.findMany({
          where: { academicYearId: year.id },
          include: {
            level: { select: { label: true, labelAr: true } },
            period: { select: { label: true, labelAr: true } },
            tracks: { include: { track: { select: { label: true, labelAr: true } } } },
            papers: { select: { _count: { select: { marks: true } } } },
          },
          orderBy: [{ startDate: 'desc' }],
        }),
        tx.level.findMany({
          select: { id: true, label: true, labelAr: true },
          orderBy: { order: 'asc' },
        }),
        tx.track.findMany({
          where: { active: true },
          select: { id: true, label: true, labelAr: true, levelId: true },
          orderBy: [{ order: 'asc' }],
        }),
        tx.period.findMany({
          where: { academicYearId: year.id },
          select: { id: true, label: true, labelAr: true },
          orderBy: { startDate: 'asc' },
        }),
      ]);

      // Tous les niveaux : un contrôle ou un devoir se programme aussi au
      // collège. Seuls les examens officiels exigent un niveau à filières —
      // le formulaire filtre selon le type.
      const levelsWithTracks = new Set(trackRows.map((tr) => tr.levelId));

      return {
        sessions: sessionRows.map((s) => {
          const markCount = s.papers.reduce((n, p) => n + p._count.marks, 0);
          return {
            id: s.id,
            label: s.label,
            kind: s.kind,
            status: s.status as 'DRAFT' | 'PUBLISHED' | 'CLOSED',
            levelId: s.levelId,
            periodId: s.periodId,
            levelLabel: localizedLabel(locale, s.level.label, s.level.labelAr),
            periodLabel: s.period ? localizedLabel(locale, s.period.label, s.period.labelAr) : null,
            startDate: s.startDate,
            endDate: s.endDate,
            paperCount: s.papers.length,
            markCount,
            lock: sessionEditLock({ status: s.status, markCount, endDate: s.endDate }, today),
            mixClasses: s.mixClasses,
            anonymized: s.anonymized,
            trackIds: s.tracks.map((x) => x.trackId),
            trackLabels: s.tracks.map((x) => localizedLabel(locale, x.track.label, x.track.labelAr)),
          };
        }),
        levels: levelRows.map(
          (l): LevelOpt => ({
            id: l.id,
            label: localizedLabel(locale, l.label, l.labelAr),
            hasTracks: levelsWithTracks.has(l.id),
          }),
        ),
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
      <nav className="mb-2 text-xs text-slate-500">
        <Link href={`/${locale}/admin/grades`} className="hover:text-brand-700">
          {t('breadcrumb')}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{t('title')}</span>
      </nav>

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

      {yearLabel && (
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
                  <SessionManageButtons
                    session={{
                      id: s.id,
                      label: s.label,
                      kind: s.kind,
                      levelId: s.levelId,
                      periodId: s.periodId,
                      startDate: isoDate(s.startDate),
                      endDate: isoDate(s.endDate),
                      trackIds: s.trackIds,
                      mixClasses: s.mixClasses,
                      anonymized: s.anonymized,
                    }}
                    lock={s.lock}
                    markCount={s.markCount}
                    canDelete={canDelete}
                    levels={levels}
                    tracks={tracks}
                    periods={periods}
                  />
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
