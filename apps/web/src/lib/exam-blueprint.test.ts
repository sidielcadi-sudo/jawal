import { describe, expect, it } from 'vitest';
import { paperMergeKey } from './exam-blueprint';
import { PRESET_BLUEPRINTS, type PresetBlueprint } from './morocco-tracks';

/**
 * Le référentiel utilise des *codes* ; en base ce sont des UUID. La clé de
 * fusion ne se soucie que de l'égalité, donc on peut la nourrir avec les codes.
 */
const keyOf = (b: PresetBlueprint) =>
  paperMergeKey({
    subjectId: b.subjectCode,
    trackId: b.trackCode,
    paperGroup: b.paperGroup,
    durationMin: b.durationMin,
  });

/** Épreuves à organiser pour une session couvrant ces filières. */
function groupFor(trackCodes: string[]) {
  const rows = PRESET_BLUEPRINTS.filter((b) => trackCodes.includes(b.trackCode));
  const groups = new Map<string, PresetBlueprint[]>();
  for (const b of rows) {
    const k = keyOf(b);
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  return { rows, groups };
}

describe('mutualisation des épreuves', () => {
  it('SMA + SMB + SP : 21 couples ramenés à 11 épreuves', () => {
    const { rows, groups } = groupFor(['2bac-sma', '2bac-smb', '2bac-sp']);
    expect(rows).toHaveLength(21); // 7 matières × 3 filières
    expect(groups.size).toBe(11);
  });

  it('le tronc littéraire des scientifiques est UNE épreuve pour les trois filières', () => {
    const { groups } = groupFor(['2bac-sma', '2bac-smb', '2bac-sp']);
    for (const subject of ['ar', 'fr', 'philo', 'angl']) {
      const entry = [...groups.values()].find(
        (g) => g[0]!.subjectCode === subject && g[0]!.paperGroup === 'sci-lit',
      );
      expect(entry, `groupe littéraire ${subject}`).toBeDefined();
      expect(entry!.map((b) => b.trackCode).sort()).toEqual(['2bac-sma', '2bac-smb', '2bac-sp']);
    }
  });

  it('SVT reste 3 épreuves distinctes : même durée, sujets différents', () => {
    const { groups } = groupFor(['2bac-sma', '2bac-smb', '2bac-sp']);
    const svt = [...groups.values()].filter((g) => g[0]!.subjectCode === 'svt');
    expect(svt).toHaveLength(3);
    for (const g of svt) {
      expect(g).toHaveLength(1);
      expect(g[0]!.durationMin).toBe(180);
    }
  });

  it('Maths spécialité et Physique secondaire sont communs à SMA et SMB', () => {
    const { groups } = groupFor(['2bac-sma', '2bac-smb']);
    const math = [...groups.values()].find(
      (g) => g[0]!.subjectCode === 'math' && g[0]!.type === 'SPECIALITY',
    );
    expect(math!.map((b) => b.trackCode).sort()).toEqual(['2bac-sma', '2bac-smb']);
    expect(math![0]!.durationMin).toBe(240);

    const pc = [...groups.values()].find(
      (g) => g[0]!.subjectCode === 'pc' && g[0]!.type === 'SECONDARY',
    );
    expect(pc).toHaveLength(2);
  });

  it('Gestion reste distincte entre Économie et TGC malgré la même durée', () => {
    const { groups } = groupFor(['2bac-eco', '2bac-tgc']);
    const gestion = [...groups.values()].filter((g) => g[0]!.subjectCode === 'gestion');
    expect(gestion).toHaveLength(2);
    expect(gestion.every((g) => g[0]!.durationMin === 180)).toBe(true);
    // … alors que les maths, elles, sont mutualisées.
    const math = [...groups.values()].find((g) => g[0]!.subjectCode === 'math');
    expect(math!.map((b) => b.trackCode).sort()).toEqual(['2bac-eco', '2bac-tgc']);
  });

  it('Lettres + Sciences Humaines : toutes les épreuves sont mutualisées', () => {
    const { rows, groups } = groupFor(['2bac-lettres', '2bac-sh']);
    expect(rows).toHaveLength(12); // 6 matières × 2 filières
    expect(groups.size).toBe(6); // … mais 6 sujets seulement
    expect([...groups.values()].every((g) => g.length === 2)).toBe(true);
  });

  it('SVT + Agronomie mutualisent le tronc littéraire, pas les spécialités', () => {
    const { groups } = groupFor(['2bac-svt', '2bac-agro']);
    const lit = [...groups.values()].filter((g) => g[0]!.paperGroup === 'svt-agro-lit');
    expect(lit).toHaveLength(4);
    expect(lit.every((g) => g.length === 2)).toBe(true);
    // Les spécialités (SVT 4 h, Agronomie 4 h) restent propres à leur filière.
    const specs = [...groups.values()].filter((g) => g[0]!.type === 'SPECIALITY');
    expect(specs).toHaveLength(2);
    expect(specs.every((g) => g.length === 1)).toBe(true);
  });

  it('Arts Appliqués ne mutualise avec personne', () => {
    const { groups } = groupFor(['2bac-arts']);
    expect([...groups.values()].every((g) => g.length === 1)).toBe(true);
  });
});

describe('cohérence du référentiel', () => {
  it('une filière ne déclare jamais deux fois la même matière', () => {
    const seen = new Set<string>();
    for (const b of PRESET_BLUEPRINTS) {
      const k = `${b.trackCode}|${b.subjectCode}`;
      expect(seen.has(k), `doublon ${k}`).toBe(false);
      seen.add(k);
    }
  });

  it('à l’intérieur d’un groupe de sujet, la durée est la même partout', () => {
    const byGroup = new Map<string, Set<number>>();
    for (const b of PRESET_BLUEPRINTS) {
      if (!b.paperGroup) continue;
      const k = `${b.paperGroup}|${b.subjectCode}`;
      byGroup.set(k, (byGroup.get(k) ?? new Set()).add(b.durationMin));
    }
    for (const [k, durations] of byGroup) {
      expect(durations.size, `durées divergentes dans ${k}`).toBe(1);
    }
  });

  it('chaque filière a exactement une épreuve de spécialité', () => {
    const specs = new Map<string, number>();
    for (const b of PRESET_BLUEPRINTS) {
      if (b.type !== 'SPECIALITY') continue;
      specs.set(b.trackCode, (specs.get(b.trackCode) ?? 0) + 1);
    }
    for (const [track, n] of specs) {
      expect(n, `${track} déclare ${n} spécialités`).toBe(1);
    }
  });
});
