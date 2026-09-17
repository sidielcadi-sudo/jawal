import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { withTenant } from '@/lib/db';
import { localizedLabel } from '@/lib/localized-name';
import { resolveCoefficients } from '@/lib/exam-grading';
import { minutesOfTime, timeOfMinutes } from '@/lib/exam-schedule';
import { buildPaperProposals } from '@/lib/exam-blueprint';
import { ExamPlanner } from './planner';
import { NewPaperForm, PaperRowActions, type PaperRow, type SubjectOpt } from './client';
import { isOfficialKind } from '@/lib/exam-kinds';

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Planning d'une session : les épreuves, ordonnées par date et heure.
 *
 * Les matières proposées sont celles de la filière (coefficient > 0) : au
 * lycée marocain, un élève de SMA ne passe pas d'épreuve de comptabilité.
 */
export default async function ExamSessionPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requirePermission('tenants.manage');
  const t = await getTranslations('admin.exams');
  const tp = await getTranslations('admin.exams.papers');
  const session = (await auth())!;

  const data = await withTenant(session.user.tenantId, async (tx) => {
    const exam = await tx.examSession.findUnique({
      where: { id },
      include: {
        level: { select: { id: true, label: true, labelAr: true } },
        period: { select: { label: true, labelAr: true } },
        tracks: { include: { track: { select: { id: true, label: true, labelAr: true } } } },
        papers: {
          include: {
            subject: { select: { id: true, label: true, labelAr: true } },
            _count: { select: { marks: true } },
          },
          orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        },
      },
    });
    if (!exam) return null;

    // Matières applicables : union des coefficients des filières de la session.
    // Sans filière cochée, on prend le niveau seul (convention « toutes »).
    const trackIds = exam.tracks.map((x) => x.trackId);
    // Sans filière cochée : toutes les filières du niveau s'il en a, sinon le
    // programme du niveau seul.
    const scopeTrackIds =
      trackIds.length > 0
        ? trackIds
        : (await tx.track.findMany({ where: { levelId: exam.levelId, active: true }, select: { id: true } })).map((x) => x.id);
    const coefMaps = await Promise.all(
      scopeTrackIds.length > 0
        ? scopeTrackIds.map((trackId) => resolveCoefficients(tx, { levelId: exam.levelId, trackId }))
        : [resolveCoefficients(tx, { levelId: exam.levelId, trackId: null })],
    );

    const allSubjects = await tx.subject.findMany({
      select: { id: true, label: true, labelAr: true, order: true },
      orderBy: [{ order: 'asc' }, { label: 'asc' }],
    });

    // Une matière est retenue si elle a un coefficient > 0 dans au moins une
    // filière de la session ; on garde le coefficient le plus élevé comme
    // proposition (le plus courant : la filière principale de la session).
    const subjects: SubjectOpt[] = [];
    for (const s of allSubjects) {
      let best = 0;
      let certifying = false;
      for (const m of coefMaps) {
        const r = m.get(s.id);
        // Une matière n'est proposée que si le programme du niveau ou la filière
        // la porte : le coefficient « par défaut » d'une matière ramenait toutes
        // celles de l'établissement, avec des coefficients d'autres examens.
        if (!r || r.source === 'SUBJECT') continue;
        if (r.coefficient > best) best = r.coefficient;
        if (r.certifying) certifying = true;
      }
      if (best > 0) {
        subjects.push({
          id: s.id,
          label: localizedLabel(locale, s.label, s.labelAr),
          coefficient: best,
          certifying,
        });
      }
    }

    // Épreuves à planifier d'après la maquette, après mutualisation.
    // La maquette ne concerne que les examens officiels ; un examen interne
    // se compose à la main.
    const blueprint = isOfficialKind(exam.kind)
      ? await buildPaperProposals(tx, exam.id, locale)
      : { proposals: [], ungroupedCount: 0, tracksWithoutBlueprint: [] as string[], derivedTracks: [] as string[] };

    return {
      exam,
      subjects,
      blueprint,
      papers: exam.papers.map(
        (p): PaperRow => ({
          id: p.id,
          subjectId: p.subjectId,
          subjectLabel: localizedLabel(locale, p.subject.label, p.subject.labelAr),
          date: isoDate(p.date),
          startTime: p.startTime,
          durationMin: p.durationMin,
          coefficient: p.coefficient,
          maxValue: p.maxValue,
          markCount: p._count.marks,
        }),
      ),
    };
  });

  if (!data) notFound();
  const { exam, subjects, papers, blueprint } = data;
  const closed = exam.status === 'CLOSED';

  // Regroupement par jour : un planning d'examen se lit jour par jour.
  const byDate = new Map<string, PaperRow[]>();
  for (const p of papers) {
    const arr = byDate.get(p.date) ?? [];
    arr.push(p);
    byDate.set(p.date, arr);
  }

  const endTime = (p: PaperRow) => {
    const start = minutesOfTime(p.startTime);
    return start === null ? '—' : timeOfMinutes(start + p.durationMin);
  };

  return (
    <div className="px-3 py-3">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href={`/${locale}/admin/grades`} className="hover:text-brand-700">
          {t('breadcrumb')}
        </Link>
        <span className="mx-1.5">›</span>
        <Link href={`/${locale}/admin/exams`} className="hover:text-brand-700">
          {t('title')}
        </Link>
        <span className="mx-1.5">›</span>
        <span>{exam.label}</span>
      </nav>

      <header className="mb-4 overflow-hidden -mx-3 rounded-2xl border border-brand-200 title-band shadow-sm px-4 py-2.5">
        <h1 className="text-base font-bold text-slate-900">{exam.label}</h1>
        <p className="mt-0.5 text-sm text-slate-600">
          {t(`kinds.${exam.kind}` as never)} · {localizedLabel(locale, exam.level.label, exam.level.labelAr)}{' '}
          · {new Date(exam.startDate).toLocaleDateString(locale)} →{' '}
          {new Date(exam.endDate).toLocaleDateString(locale)}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {exam.tracks.length > 0
            ? exam.tracks
                .map((x) => localizedLabel(locale, x.track.label, x.track.labelAr))
                .join(' · ')
            : tp('allTracks')}
        </p>
      </header>

      {/* Planificateur glisser-déposer : le vivier des épreuves mutualisées
          d'un côté, la grille jours × créneaux de l'autre. */}
      {blueprint.proposals.length > 0 && (
        <div className="mb-4">
          <ExamPlanner
            sessionId={exam.id}
            proposals={blueprint.proposals}
            ungroupedCount={blueprint.ungroupedCount}
            tracksWithoutBlueprint={blueprint.tracksWithoutBlueprint}
            derivedTracks={blueprint.derivedTracks}
            minDate={isoDate(exam.startDate)}
            maxDate={isoDate(exam.endDate)}
            disabled={closed}
          />
        </div>
      )}

      {/* Rien à proposer : le dire, plutôt qu'un écran silencieux. */}
      {!isOfficialKind(exam.kind) && (
        <div className="mb-4 max-w-4xl rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          {tp('manualHint')}
        </div>
      )}
      {blueprint.proposals.length === 0 && isOfficialKind(exam.kind) && (
        <div className="mb-4 max-w-4xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>⚠ {tp('noProposals.title')}</strong> {tp('noProposals.hint')}{' '}
          <Link
            href={`/${locale}/admin/settings/tracks`}
            className="font-medium text-amber-800 underline"
          >
            {tp('noSubjects.action')} →
          </Link>
        </div>
      )}

      <div className="max-w-4xl space-y-3">
        <NewPaperForm
          sessionId={exam.id}
          subjects={subjects}
          minDate={isoDate(exam.startDate)}
          maxDate={isoDate(exam.endDate)}
          disabled={closed}
        />
      </div>

      {subjects.length === 0 && (
        <div className="mt-3 max-w-4xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>⚠ {tp('noSubjects.title')}</strong> {tp('noSubjects.hint')}{' '}
          <Link
            href={`/${locale}/admin/settings/tracks`}
            className="font-medium text-amber-800 underline"
          >
            {tp('noSubjects.action')} →
          </Link>
        </div>
      )}

      <div className="mt-5 max-w-4xl space-y-4">
        {[...byDate.entries()].map(([date, rows]) => (
          <section key={date} className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <h2 className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800">
              {new Date(date).toLocaleDateString(locale, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
              <span className="ms-2 text-xs font-normal text-slate-500">
                {tp('paperCount', { count: rows.length })}
              </span>
            </h2>
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-start">{tp('subject')}</th>
                  <th className="px-4 py-2 text-start">{tp('slot')}</th>
                  <th className="px-4 py-2 text-end">{tp('duration')}</th>
                  <th className="px-4 py-2 text-end">{tp('coefficient')}</th>
                  <th className="px-4 py-2 text-end">{tp('marks')}</th>
                  <th className="px-4 py-2 text-end">{tp('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2 font-medium text-slate-900">{p.subjectLabel}</td>
                    <td className="px-4 py-2 tabular-nums text-slate-700">
                      {p.startTime} → {endTime(p)}
                    </td>
                    <td className="px-4 py-2 text-end tabular-nums text-slate-600">
                      {p.durationMin} min
                    </td>
                    <td className="px-4 py-2 text-end tabular-nums text-slate-700">
                      {p.coefficient}
                    </td>
                    <td className="px-4 py-2 text-end tabular-nums text-slate-500">
                      {p.markCount > 0 ? p.markCount : '—'}
                    </td>
                    <td className="px-4 py-2 text-end">
                      <PaperRowActions
                        paper={p}
                        minDate={isoDate(exam.startDate)}
                        maxDate={isoDate(exam.endDate)}
                        disabled={closed}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

        {papers.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
            {tp('empty')}
          </div>
        )}
      </div>

      <p className="mt-4 max-w-4xl text-xs text-slate-500">{tp('nextPhase')}</p>
    </div>
  );
}
