import 'server-only';
import type { Prisma } from '@/lib/db';

/**
 * Planification des épreuves : détection des incompatibilités horaires
 * (RF-02.3).
 *
 * La règle métier n'est pas « deux épreuves ne peuvent pas se chevaucher »,
 * mais « **un élève** ne peut pas être à deux épreuves à la fois ». Tout tient
 * donc à la résolution du *cohorte* : l'ensemble des élèves concernés par une
 * session.
 *
 *   cohorte(session) = les filières cochées sur la session
 *                      … ou, si aucune n'est cochée, TOUTES les filières du
 *                      niveau (convention retenue à la création de session).
 *
 * Deux sessions se croisent si elles portent sur le même niveau et que leurs
 * cohortes se recoupent. Une session « toutes filières » croise donc toutes
 * les sessions de son niveau.
 */

type Tx = Prisma.TransactionClient;

/** "08:30" → 510. Renvoie null si le format n'est pas HH:MM. */
export function minutesOfTime(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** 510 → "08:30". */
export function timeOfMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Deux intervalles [start, start+duration[ se chevauchent-ils ? */
export function intervalsOverlap(
  aStart: number,
  aDuration: number,
  bStart: number,
  bDuration: number,
): boolean {
  return aStart < bStart + bDuration && bStart < aStart + aDuration;
}

export type ScheduleConflict = {
  paperId: string;
  sessionId: string;
  sessionLabel: string;
  subjectLabel: string;
  date: Date;
  startTime: string;
  durationMin: number;
  /** Filières réellement partagées — ce sont elles qui créent le conflit. */
  sharedTracks: string[];
};

export type PaperDraft = {
  /** Épreuve en cours de modification, à exclure de la comparaison. */
  paperId?: string | null;
  sessionId: string;
  date: Date;
  startTime: string;
  durationMin: number;
  /**
   * Filières réellement couvertes par l'épreuve. Une épreuve mutualisée n'en
   * couvre qu'une partie : sans cette précision, l'Arabe des scientifiques
   * bloquerait la Comptabilité des économistes au même créneau.
   * Omis = toutes les filières de la session.
   */
  trackIds?: string[];
};

/**
 * Épreuves déjà planifiées qui entrent en collision avec `draft`, pour les
 * élèves concernés. Vide = créneau libre.
 *
 * On compare sur toute l'**année scolaire** et non sur la seule session :
 * deux sessions distinctes (un semestriel et un blanc, par exemple) peuvent
 * viser les mêmes élèves le même jour.
 */
export async function findScheduleConflicts(
  tx: Tx,
  draft: PaperDraft,
  locale = 'fr',
): Promise<ScheduleConflict[]> {
  const start = minutesOfTime(draft.startTime);
  if (start === null || draft.durationMin <= 0) return [];

  const session = await tx.examSession.findUnique({
    where: { id: draft.sessionId },
    select: {
      id: true,
      academicYearId: true,
      levelId: true,
      tracks: { select: { trackId: true } },
    },
  });
  if (!session) return [];

  // Filières du niveau : sert à développer la convention « aucune cochée =
  // toutes ». Sans ce développement, une session « toutes filières » ne
  // croiserait rien.
  const levelTracks = await tx.track.findMany({
    where: { levelId: session.levelId },
    select: { id: true, label: true, labelAr: true },
  });
  const trackLabel = new Map(
    levelTracks.map((t) => [t.id, locale === 'ar' ? (t.labelAr ?? t.label) : t.label]),
  );
  const allLevelTrackIds = levelTracks.map((t) => t.id);
  const cohortOf = (trackIds: string[]) => (trackIds.length > 0 ? trackIds : allLevelTrackIds);

  const draftCohort = new Set(
    draft.trackIds && draft.trackIds.length > 0
      ? draft.trackIds
      : cohortOf(session.tracks.map((t) => t.trackId)),
  );

  // Candidats : mêmes année + niveau + date, hors épreuve en cours d'édition.
  const candidates = await tx.examPaper.findMany({
    where: {
      date: draft.date,
      id: draft.paperId ? { not: draft.paperId } : undefined,
      session: { academicYearId: session.academicYearId, levelId: session.levelId },
    },
    select: {
      id: true,
      date: true,
      startTime: true,
      durationMin: true,
      subject: { select: { label: true, labelAr: true } },
      tracks: { select: { trackId: true } },
      session: {
        select: { id: true, label: true, tracks: { select: { trackId: true } } },
      },
    },
  });

  const conflicts: ScheduleConflict[] = [];
  for (const c of candidates) {
    const cStart = minutesOfTime(c.startTime);
    if (cStart === null) continue;
    if (!intervalsOverlap(start, draft.durationMin, cStart, c.durationMin)) continue;

    // Les filières portées par l'épreuve priment ; à défaut (épreuves créées
    // à la main), on retombe sur celles de la session.
    const otherCohort =
      c.tracks.length > 0
        ? c.tracks.map((t) => t.trackId)
        : cohortOf(c.session.tracks.map((t) => t.trackId));
    const shared = otherCohort.filter((id) => draftCohort.has(id));
    if (shared.length === 0) continue; // publics disjoints → pas de conflit

    conflicts.push({
      paperId: c.id,
      sessionId: c.session.id,
      sessionLabel: c.session.label,
      subjectLabel: locale === 'ar' ? (c.subject.labelAr ?? c.subject.label) : c.subject.label,
      date: c.date,
      startTime: c.startTime,
      durationMin: c.durationMin,
      sharedTracks: shared.map((id) => trackLabel.get(id) ?? '—'),
    });
  }
  return conflicts;
}

/**
 * L'épreuve tombe-t-elle dans la plage de dates de sa session ? Une épreuve
 * hors plage passe inaperçue dans les listings filtrés par session.
 */
export function isWithinSession(date: Date, sessionStart: Date, sessionEnd: Date): boolean {
  const d = date.getTime();
  return d >= sessionStart.getTime() && d <= sessionEnd.getTime();
}
