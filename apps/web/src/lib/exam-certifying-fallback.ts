/**
 * Épreuves déduites des matières certificatives, faute de maquette.
 *
 * Le générateur d'épreuves lisait uniquement la maquette (`ExamBlueprint`) :
 * durée réglementaire, type, sujet partagé. Or seules les filières de 2BAC en
 * ont une. Une session régionale de 1BAC ne proposait donc **rien**, alors que
 * le paramétrage des filières dit précisément quelles matières y sont évaluées
 * (Arabe, Français, Éducation islamique… marquées « certificatives »).
 *
 * Quand une filière n'a pas de maquette, on part donc de ses matières
 * certificatives. Deux choix, faute de mieux, et signalés à l'écran :
 *
 *  - une durée par défaut de deux heures ;
 *  - un sujet commun par matière aux filières concernées — c'est le cas de
 *    l'examen régional, dont les épreuves sont les mêmes pour les filières
 *    d'une session. La maquette reste le moyen de séparer deux sujets.
 */

export const DEFAULT_CERTIFYING_DURATION_MIN = 120;

/** Groupe de sujet des épreuves déduites : fusionne une matière entre filières. */
export const CERTIFYING_PAPER_GROUP = 'certificative';

export type CertifyingRow<S> = {
  trackId: string;
  subjectId: string;
  certifying: boolean;
  subject: S;
};

export function certifyingFallback<S>(
  rows: CertifyingRow<S>[],
  tracksWithBlueprint: ReadonlySet<string>,
) {
  return rows
    .filter((r) => r.certifying && !tracksWithBlueprint.has(r.trackId))
    .map((r) => ({
      trackId: r.trackId,
      subjectId: r.subjectId,
      durationMin: DEFAULT_CERTIFYING_DURATION_MIN,
      type: 'LITERARY' as const,
      paperGroup: CERTIFYING_PAPER_GROUP as string | null,
      subject: r.subject,
    }));
}
