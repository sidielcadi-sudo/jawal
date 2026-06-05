import 'server-only';
import type { Prisma } from '@/lib/db';
import type { SurveyAudienceValue, SurveyCreate, SurveyResponseSubmit } from '@jawal/shared';

type Tx = Prisma.TransactionClient;

/**
 * Audiences d'enquête qui concernent un profil donné. Un parent voit les
 * enquêtes PARENTS + ALL, un enseignant TEACHERS + ALL, etc.
 */
export function audiencesFor(
  profile: 'PARENT' | 'TEACHER' | 'STAFF' | 'STUDENT',
): SurveyAudienceValue[] {
  const map: Record<typeof profile, SurveyAudienceValue> = {
    PARENT: 'PARENTS',
    TEACHER: 'TEACHERS',
    STAFF: 'STAFF',
    STUDENT: 'STUDENTS',
  };
  return ['ALL', map[profile]];
}

/** Liste des enquêtes (admin) avec nombre de réponses. À appeler dans withTenant. */
export async function listSurveys(tx: Tx) {
  const surveys = await tx.survey.findMany({
    orderBy: [{ createdAt: 'desc' }],
    include: {
      _count: { select: { responses: true, questions: true } },
    },
  });
  return surveys;
}

/** Crée une enquête + ses questions (statut DRAFT). */
export async function createSurvey(tx: Tx, tenantId: string, userId: string, input: SurveyCreate) {
  // periodId optionnel : on valide qu'il appartient au tenant (RLS le garantit déjà).
  const periodId = input.periodId
    ? ((await tx.period.findUnique({ where: { id: input.periodId }, select: { id: true } }))?.id ??
      null)
    : null;

  return tx.survey.create({
    data: {
      tenantId,
      title: input.title,
      description: input.description ?? null,
      audience: input.audience,
      anonymous: input.anonymous,
      periodId,
      createdById: userId,
      questions: {
        create: input.questions.map((q, i) => ({
          tenantId,
          label: q.label,
          type: q.type,
          required: q.required,
          order: i,
        })),
      },
    },
  });
}

/** Enquête + questions pour un répondant (ordre stable). */
export async function getSurveyForRespond(tx: Tx, id: string) {
  return tx.survey.findUnique({
    where: { id },
    include: { questions: { orderBy: { order: 'asc' } } },
  });
}

/** Un utilisateur a-t-il déjà répondu à cette enquête ? */
export async function hasResponded(tx: Tx, surveyId: string, userId: string): Promise<boolean> {
  const r = await tx.surveyResponse.findFirst({
    where: { surveyId, submittedById: userId },
    select: { id: true },
  });
  return r !== null;
}

/**
 * Enquêtes ouvertes destinées à un profil, avec l'état « déjà répondu »
 * pour l'utilisateur courant.
 */
export async function listOpenSurveysFor(
  tx: Tx,
  profile: 'PARENT' | 'TEACHER' | 'STAFF' | 'STUDENT',
  userId: string,
) {
  const surveys = await tx.survey.findMany({
    where: { status: 'OPEN', audience: { in: audiencesFor(profile) } },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { questions: true } },
      responses: { where: { submittedById: userId }, select: { id: true } },
    },
  });
  return surveys.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    questionCount: s._count.questions,
    answered: s.responses.length > 0,
  }));
}

type SubmitResult =
  | { ok: true }
  | { ok: false; error: 'NOT_OPEN' | 'ALREADY_ANSWERED' | 'NOT_FOUND' | 'MISSING_REQUIRED' };

/**
 * Enregistre une réponse complète. Vérifie que l'enquête est ouverte, que
 * l'utilisateur n'a pas déjà répondu, et que les questions requises sont
 * renseignées. L'unicité (survey, user) en base est le garde-fou final.
 */
export async function submitResponse(
  tx: Tx,
  tenantId: string,
  userId: string,
  input: SurveyResponseSubmit,
): Promise<SubmitResult> {
  const survey = await tx.survey.findUnique({
    where: { id: input.surveyId },
    include: { questions: true },
  });
  if (!survey) return { ok: false, error: 'NOT_FOUND' };
  if (survey.status !== 'OPEN') return { ok: false, error: 'NOT_OPEN' };

  if (await hasResponded(tx, survey.id, userId)) {
    return { ok: false, error: 'ALREADY_ANSWERED' };
  }

  const byId = new Map(survey.questions.map((q) => [q.id, q]));
  const answers = input.answers.filter((a) => byId.has(a.questionId));

  // Validation des questions obligatoires.
  for (const q of survey.questions) {
    if (!q.required) continue;
    const a = answers.find((x) => x.questionId === q.id);
    const filled = q.type === 'RATING_5' ? a?.rating != null : (a?.text ?? '').trim().length > 0;
    if (!filled) return { ok: false, error: 'MISSING_REQUIRED' };
  }

  await tx.surveyResponse.create({
    data: {
      tenantId,
      surveyId: survey.id,
      submittedById: survey.anonymous ? null : userId,
      answers: {
        create: answers
          .map((a) => {
            const q = byId.get(a.questionId)!;
            if (q.type === 'RATING_5') {
              if (a.rating == null) return null;
              return { tenantId, questionId: q.id, rating: a.rating };
            }
            const text = (a.text ?? '').trim();
            if (!text) return null;
            return { tenantId, questionId: q.id, text };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null),
      },
    },
  });

  // Anti-doublon même en mode anonyme : on trace une réponse "vide" portant
  // l'identité, sans réponses, pour bloquer une seconde soumission.
  if (survey.anonymous) {
    await tx.surveyResponse.create({
      data: { tenantId, surveyId: survey.id, submittedById: userId },
    });
  }

  return { ok: true };
}

export type QuestionResult = {
  id: string;
  label: string;
  type: 'RATING_5' | 'TEXT';
  /** RATING_5 : moyenne /5 + nb de notes + distribution [n1..n5]. */
  average: number | null;
  count: number;
  distribution: number[];
  /** TEXT : réponses libres. */
  texts: string[];
};

/** Résultats agrégés d'une enquête (admin). */
export async function getSurveyResults(tx: Tx, id: string) {
  const survey = await tx.survey.findUnique({
    where: { id },
    include: {
      questions: {
        orderBy: { order: 'asc' },
        include: { answers: { select: { rating: true, text: true } } },
      },
      _count: { select: { responses: true } },
    },
  });
  if (!survey) return null;

  // periodId est une colonne scalaire (pas de relation Prisma) → label à part.
  const periodLabel = survey.periodId
    ? ((await tx.period.findUnique({ where: { id: survey.periodId }, select: { label: true } }))
        ?.label ?? null)
    : null;

  // Réponses "réelles" = soumissions ayant au moins une réponse (en anonyme on
  // crée un marqueur vide pour l'anti-doublon ; on ne le compte pas comme tour).
  const realResponses = await tx.surveyResponse.count({
    where: { surveyId: id, answers: { some: {} } },
  });

  const questions: QuestionResult[] = survey.questions.map((q) => {
    if (q.type === 'RATING_5') {
      const ratings = q.answers.map((a) => a.rating).filter((r): r is number => r != null);
      const distribution = [0, 0, 0, 0, 0];
      for (const r of ratings) if (r >= 1 && r <= 5) distribution[r - 1]!++;
      const average =
        ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null;
      return {
        id: q.id,
        label: q.label,
        type: 'RATING_5',
        average,
        count: ratings.length,
        distribution,
        texts: [],
      };
    }
    const texts = q.answers.map((a) => a.text).filter((t): t is string => !!t && t.trim() !== '');
    return {
      id: q.id,
      label: q.label,
      type: 'TEXT',
      average: null,
      count: texts.length,
      distribution: [],
      texts,
    };
  });

  return { survey, periodLabel, realResponses, questions };
}

/**
 * KPI satisfaction (/5) : moyenne de toutes les notes RATING_5 des enquêtes
 * ouvertes ou clôturées. Si `periodId` est fourni, on inclut les enquêtes de
 * cette période **et** les enquêtes sans période (portée globale). Renvoie
 * null si aucune note (le KPI reste alors « N/A »).
 */
export async function computeSatisfaction(tx: Tx, periodId: string | null): Promise<number | null> {
  const answers = await tx.surveyAnswer.findMany({
    where: {
      rating: { not: null },
      question: { type: 'RATING_5' },
      response: {
        survey: {
          status: { in: ['OPEN', 'CLOSED'] },
          ...(periodId ? { OR: [{ periodId }, { periodId: null }] } : {}),
        },
      },
    },
    select: { rating: true },
  });
  if (answers.length === 0) return null;
  const sum = answers.reduce((s, a) => s + (a.rating ?? 0), 0);
  return sum / answers.length;
}
