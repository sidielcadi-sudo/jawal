import 'server-only';
import type { Prisma } from '@/lib/db';

/**
 * Regroupement des épreuves par sujet identique.
 *
 * Le problème que ça résout : une session 2BAC couvrant SMA, SMB et SP demande
 * naïvement 21 épreuves (7 matières × 3 filières). En réalité l'établissement
 * n'en organise que 11, parce que le tronc littéraire (Arabe, Français,
 * Philosophie, Anglais) est **le même sujet** pour les trois filières, et que
 * Maths spécialité et Physique secondaire sont communs à SMA et SMB.
 *
 * La règle tient en une ligne : deux (filière, matière) fusionnent si elles
 * partagent le même `paperGroup` **non nul**. Un `paperGroup` nul signifie
 * « sujet propre » — même quand la durée coïncide, comme SVT 3 h en SMA, SMB
 * et SP, ou Gestion 3 h en Économie et TGC. Confondre les deux ferait composer
 * des élèves sur le sujet d'une autre filière.
 */

type Tx = Prisma.TransactionClient;

export type PaperProposal = {
  /** Clé stable : sert d'identifiant de ligne dans l'écran de génération. */
  key: string;
  subjectId: string;
  subjectLabel: string;
  durationMin: number;
  type: 'SPECIALITY' | 'SECONDARY' | 'LITERARY';
  /** Groupe de sujet partagé, null si sujet propre à la filière. */
  paperGroup: string | null;
  /** Filières couvertes par cette épreuve unique. */
  trackIds: string[];
  trackLabels: string[];
  /** Coefficient le plus élevé parmi les filières couvertes. */
  coefficient: number;
  /** Une épreuve identique déjà planifiée pour cette clé. */
  existingPaperId: string | null;
  /** Créneau déjà posé, pour préremplir le planificateur. */
  existingDate: string | null;
  existingStartTime: string | null;
};

export type ProposalSummary = {
  proposals: PaperProposal[];
  /** Nombre d'épreuves si l'on ne mutualisait rien (une par filière). */
  ungroupedCount: number;
  /** Filières de la session sans aucune maquette d'épreuve. */
  tracksWithoutBlueprint: string[];
};

/**
 * Clé de fusion de deux (filière, matière).
 *
 * Avec un `paperGroup`, la matière et le groupe suffisent : toutes les
 * filières du groupe composent sur le même sujet, donc une seule épreuve.
 * Sans groupe, la filière entre dans la clé — ce qui force une épreuve
 * distincte même quand la durée coïncide (SVT 3 h en SMA/SMB/SP,
 * Gestion 3 h en Économie/TGC).
 */
export function paperMergeKey(b: {
  subjectId: string;
  trackId: string;
  paperGroup: string | null;
  durationMin: number;
}): string {
  return b.paperGroup
    ? `g:${b.subjectId}:${b.paperGroup}:${b.durationMin}`
    : `t:${b.subjectId}:${b.trackId}`;
}

/**
 * Épreuves à planifier pour une session, après mutualisation.
 *
 * Les propositions sont triées par type (spécialité d'abord — ce sont les
 * épreuves les plus longues, qu'on cale en premier dans un planning), puis par
 * durée décroissante.
 */
export async function buildPaperProposals(
  tx: Tx,
  sessionId: string,
  locale = 'fr',
): Promise<ProposalSummary> {
  const session = await tx.examSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      levelId: true,
      tracks: { select: { trackId: true } },
      papers: {
        select: {
          id: true,
          subjectId: true,
          durationMin: true,
          date: true,
          startTime: true,
          tracks: { select: { trackId: true } },
        },
      },
    },
  });
  if (!session) return { proposals: [], ungroupedCount: 0, tracksWithoutBlueprint: [] };

  // Convention de la session : aucune filière cochée = toutes celles du niveau.
  const levelTracks = await tx.track.findMany({
    where: { levelId: session.levelId, active: true },
    select: { id: true, label: true, labelAr: true, order: true },
    orderBy: { order: 'asc' },
  });
  const label = (t: { label: string; labelAr: string | null }) =>
    locale === 'ar' ? (t.labelAr ?? t.label) : t.label;
  const trackLabel = new Map(levelTracks.map((t) => [t.id, label(t)]));

  const selected = session.tracks.map((t) => t.trackId);
  const trackIds = selected.length > 0 ? selected : levelTracks.map((t) => t.id);
  if (trackIds.length === 0) return { proposals: [], ungroupedCount: 0, tracksWithoutBlueprint: [] };

  const blueprints = await tx.examBlueprint.findMany({
    where: { trackId: { in: trackIds } },
    select: {
      trackId: true,
      subjectId: true,
      durationMin: true,
      type: true,
      paperGroup: true,
      subject: { select: { label: true, labelAr: true, order: true } },
    },
  });

  // Coefficients de filière, pour proposer le bon coefficient d'épreuve.
  const coefRows = await tx.trackSubjectCoefficient.findMany({
    where: { trackId: { in: trackIds } },
    select: { trackId: true, subjectId: true, coefficient: true },
  });
  const coefOf = new Map(coefRows.map((c) => [`${c.trackId}|${c.subjectId}`, c.coefficient]));


  const grouped = new Map<string, PaperProposal>();
  for (const b of blueprints) {
    const key = paperMergeKey(b);
    const existing = grouped.get(key);
    const coef = coefOf.get(`${b.trackId}|${b.subjectId}`) ?? 1;
    if (existing) {
      existing.trackIds.push(b.trackId);
      existing.trackLabels.push(trackLabel.get(b.trackId) ?? '—');
      existing.coefficient = Math.max(existing.coefficient, coef);
      // Une durée divergente à l'intérieur d'un même groupe est une anomalie
      // de paramétrage : on retient la plus longue, jamais la plus courte.
      existing.durationMin = Math.max(existing.durationMin, b.durationMin);
      continue;
    }
    grouped.set(key, {
      key,
      subjectId: b.subjectId,
      subjectLabel: label(b.subject),
      durationMin: b.durationMin,
      type: b.type,
      paperGroup: b.paperGroup,
      trackIds: [b.trackId],
      trackLabels: [trackLabel.get(b.trackId) ?? '—'],
      coefficient: coef,
      existingPaperId: null,
      existingDate: null,
      existingStartTime: null,
    });
  }

  // Rapprochement avec les épreuves déjà créées : même matière et même
  // ensemble de filières → la proposition est considérée comme déjà planifiée.
  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join() === [...b].sort().join();
  for (const proposal of grouped.values()) {
    const match = session.papers.find(
      (p) =>
        p.subjectId === proposal.subjectId &&
        (p.tracks.length === 0
          ? proposal.trackIds.length === trackIds.length
          : sameSet(
              p.tracks.map((x) => x.trackId),
              proposal.trackIds,
            )),
    );
    proposal.existingPaperId = match?.id ?? null;
    proposal.existingDate = match ? match.date.toISOString().slice(0, 10) : null;
    proposal.existingStartTime = match?.startTime ?? null;
  }

  const typeRank = { SPECIALITY: 0, SECONDARY: 1, LITERARY: 2 } as const;
  const proposals = [...grouped.values()].sort(
    (a, b) =>
      typeRank[a.type] - typeRank[b.type] ||
      b.durationMin - a.durationMin ||
      a.subjectLabel.localeCompare(b.subjectLabel),
  );

  const withBlueprint = new Set(blueprints.map((b) => b.trackId));
  return {
    proposals,
    ungroupedCount: blueprints.length,
    tracksWithoutBlueprint: trackIds
      .filter((id) => !withBlueprint.has(id))
      .map((id) => trackLabel.get(id) ?? '—'),
  };
}
