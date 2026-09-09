import 'server-only';
import type { Prisma } from '@/lib/db';

/**
 * Moyennes du lycée marocain.
 *
 * Le contrôle continu (Evaluation/Grade) existait déjà. Ce module ajoute la
 * couche certificative : examen semestriel local, Régional (1BAC) et National
 * (2BAC), et la pondération réglementaire qui les combine.
 *
 *   Tronc commun : CC 40 % + Semestriel 60 %
 *   1ʳᵉ Bac      : CC 30 % + Semestriel 40 % + Régional 30 %
 *   2ᵉ Bac       : CC 20 % + Semestriel 30 % + National  50 %
 *
 * Deux principes tiennent tout le reste :
 *
 *  1. **La filière porte le coefficient**, pas le niveau. Deux élèves de 1BAC
 *     n'ont pas le même coefficient en maths selon qu'ils sont en SMA (7) ou
 *     en Lettres (2). D'où la cascade de résolution ci-dessous.
 *  2. **Une composante absente ne pénalise jamais** : si l'examen régional
 *     n'a pas encore eu lieu, on renormalise sur les composantes disponibles
 *     plutôt que de compter zéro.
 */

export type Tx = Prisma.TransactionClient;

/** Les quatre composantes d'une moyenne, en pourcentages (somme = 100). */
export type Weights = {
  cc: number;
  semester: number;
  regional: number;
  national: number;
};

/** Pondérations réglementaires par défaut, par famille de niveau. */
export const DEFAULT_WEIGHTS = {
  TRONC_COMMUN: { cc: 40, semester: 60, regional: 0, national: 0 },
  BAC1: { cc: 30, semester: 40, regional: 30, national: 0 },
  BAC2: { cc: 20, semester: 30, regional: 0, national: 50 },
} as const satisfies Record<string, Weights>;

export type WeightPreset = keyof typeof DEFAULT_WEIGHTS;

/** Somme des quatre composantes — doit valoir 100 pour une règle valide. */
export function weightsTotal(w: Weights): number {
  return round2(w.cc + w.semester + w.regional + w.national);
}

export function areWeightsValid(w: Weights): boolean {
  const all = [w.cc, w.semester, w.regional, w.national];
  if (all.some((v) => !Number.isFinite(v) || v < 0 || v > 100)) return false;
  return Math.abs(weightsTotal(w) - 100) < 0.01;
}

/* ────────────────────────────────────────────────────────────────────────
   Résolution du coefficient d'une matière
   ──────────────────────────────────────────────────────────────────────── */

export type CoefficientSource = 'TRACK' | 'CURRICULUM' | 'SUBJECT';

export type ResolvedCoefficient = {
  subjectId: string;
  coefficient: number;
  /** D'où vient la valeur — affiché dans l'écran de paramétrage. */
  source: CoefficientSource;
  /** Matière évaluée à l'épreuve certificative de la filière. */
  certifying: boolean;
};

/**
 * Coefficients applicables à un élève, par matière, selon sa filière.
 *
 * Cascade, du plus spécifique au plus général :
 *   1. `TrackSubjectCoefficient` — le coefficient réglementaire de la filière ;
 *   2. `CurriculumSubject`       — le coefficient du niveau ;
 *   3. `Subject.coefficient`     — le repli global.
 *
 * `trackId` null (collège, primaire) → la cascade démarre au niveau.
 */
export async function resolveCoefficients(
  tx: Tx,
  opts: { levelId: string; trackId?: string | null },
): Promise<Map<string, ResolvedCoefficient>> {
  const [subjects, curriculum, trackCoefs] = await Promise.all([
    tx.subject.findMany({ select: { id: true, coefficient: true } }),
    tx.curriculumSubject.findMany({
      where: { levelId: opts.levelId },
      select: { subjectId: true, coefficient: true },
    }),
    opts.trackId
      ? tx.trackSubjectCoefficient.findMany({
          where: { trackId: opts.trackId },
          select: { subjectId: true, coefficient: true, certifying: true },
        })
      : Promise.resolve([]),
  ]);

  const out = new Map<string, ResolvedCoefficient>();
  for (const s of subjects) {
    out.set(s.id, {
      subjectId: s.id,
      coefficient: s.coefficient,
      source: 'SUBJECT',
      certifying: false,
    });
  }
  for (const c of curriculum) {
    const cur = out.get(c.subjectId);
    if (cur) out.set(c.subjectId, { ...cur, coefficient: c.coefficient, source: 'CURRICULUM' });
  }
  for (const c of trackCoefs) {
    const cur = out.get(c.subjectId);
    if (cur) {
      out.set(c.subjectId, {
        ...cur,
        coefficient: c.coefficient,
        source: 'TRACK',
        certifying: c.certifying,
      });
    }
  }
  return out;
}

/**
 * Règle de pondération applicable : la règle de la filière si elle existe,
 * sinon celle du niveau (trackId null), sinon `null` — à l'appelant de
 * décider du repli (généralement `DEFAULT_WEIGHTS`).
 */
export async function resolveWeights(
  tx: Tx,
  opts: { academicYearId: string; levelId: string; trackId?: string | null },
): Promise<{ weights: Weights; locked: boolean; ruleId: string | null }> {
  const rules = await tx.gradingRule.findMany({
    where: {
      academicYearId: opts.academicYearId,
      levelId: opts.levelId,
      OR: [{ trackId: opts.trackId ?? null }, { trackId: null }],
    },
    select: {
      id: true,
      trackId: true,
      ccWeight: true,
      semesterWeight: true,
      regionalWeight: true,
      nationalWeight: true,
      locked: true,
    },
  });
  // La règle de filière prime sur la règle de niveau.
  const rule =
    rules.find((r) => opts.trackId && r.trackId === opts.trackId) ??
    rules.find((r) => r.trackId === null) ??
    null;
  if (!rule) {
    return { weights: { cc: 100, semester: 0, regional: 0, national: 0 }, locked: false, ruleId: null };
  }
  return {
    weights: {
      cc: rule.ccWeight,
      semester: rule.semesterWeight,
      regional: rule.regionalWeight,
      national: rule.nationalWeight,
    },
    locked: rule.locked,
    ruleId: rule.id,
  };
}

/* ────────────────────────────────────────────────────────────────────────
   Combinaison des composantes
   ──────────────────────────────────────────────────────────────────────── */

/** Notes d'une matière, ramenées sur la même échelle (/20 en général). */
export type Components = {
  cc: number | null;
  semester: number | null;
  regional: number | null;
  national: number | null;
};

export type CombinedAverage = {
  /** Moyenne pondérée, ou null si aucune composante n'est disponible. */
  value: number | null;
  /** Part du barème effectivement couverte (100 = toutes les composantes). */
  coveragePct: number;
  /** Composantes réellement utilisées, avec leur poids renormalisé. */
  used: { key: keyof Components; weight: number; value: number }[];
  /** Composantes attendues par le barème mais pas encore saisies. */
  missing: (keyof Components)[];
};

/**
 * Combine les composantes selon le barème. Une composante attendue mais
 * absente est **exclue puis le barème renormalisé** — sinon un élève qui n'a
 * pas encore passé l'examen national afficherait une moyenne divisée par deux
 * en cours d'année, ce qui n'a aucun sens pédagogique.
 *
 * `coveragePct` dit ce que vaut le chiffre : 50 % signifie que la moitié du
 * barème manque encore. C'est cette information qui doit accompagner la
 * moyenne à l'écran, pas la moyenne seule.
 */
export function combineAverage(components: Components, weights: Weights): CombinedAverage {
  const entries: { key: keyof Components; weight: number }[] = [
    { key: 'cc', weight: weights.cc },
    { key: 'semester', weight: weights.semester },
    { key: 'regional', weight: weights.regional },
    { key: 'national', weight: weights.national },
  ];

  const used: CombinedAverage['used'] = [];
  const missing: (keyof Components)[] = [];
  let availableWeight = 0;
  let expectedWeight = 0;

  for (const e of entries) {
    if (e.weight <= 0) continue; // composante hors barème pour ce niveau
    expectedWeight += e.weight;
    const v = components[e.key];
    if (v === null || !Number.isFinite(v)) {
      missing.push(e.key);
      continue;
    }
    availableWeight += e.weight;
    used.push({ key: e.key, weight: e.weight, value: v });
  }

  if (availableWeight <= 0) {
    return { value: null, coveragePct: 0, used: [], missing };
  }

  const weighted = used.reduce((s, u) => s + u.value * u.weight, 0) / availableWeight;
  return {
    value: round2(weighted),
    coveragePct: expectedWeight > 0 ? round2((availableWeight / expectedWeight) * 100) : 0,
    used,
    missing,
  };
}

/**
 * Moyenne générale : moyenne des moyennes de matière, pondérée par le
 * coefficient de la filière. Les matières sans note ne comptent pas — ni au
 * numérateur, ni au dénominateur.
 */
export function generalAverage(
  subjectAverages: { subjectId: string; average: number | null }[],
  coefficients: Map<string, ResolvedCoefficient>,
): { value: number | null; totalCoefficient: number } {
  let sum = 0;
  let total = 0;
  for (const s of subjectAverages) {
    if (s.average === null || !Number.isFinite(s.average)) continue;
    const coef = coefficients.get(s.subjectId)?.coefficient ?? 1;
    if (coef <= 0) continue;
    sum += s.average * coef;
    total += coef;
  }
  return { value: total > 0 ? round2(sum / total) : null, totalCoefficient: round2(total) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
