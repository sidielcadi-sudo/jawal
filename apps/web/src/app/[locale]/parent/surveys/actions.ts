'use server';

import { revalidatePath } from 'next/cache';
import { surveyResponseSubmitSchema, type SurveyAnswerInput } from '@jawal/shared';
import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { submitResponse } from '@/lib/survey';

type Result = { ok: true } | { ok: false; error: string };

/**
 * Soumission d'une réponse d'enquête par un parent. La validation métier
 * (enquête ouverte, audience, doublon, questions requises) est faite dans
 * `submitResponse` ; ici on contrôle l'authentification parent + le format.
 */
export async function submitSurveyResponseAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  if (!session.user.isParent) return { ok: false, error: 'Réservé aux comptes parent.' };

  const raw = (() => {
    const v = formData.get('answers');
    if (typeof v !== 'string') return [];
    try {
      return JSON.parse(v) as SurveyAnswerInput[];
    } catch {
      return [];
    }
  })();

  const parsed = surveyResponseSubmitSchema.safeParse({
    surveyId: formData.get('surveyId'),
    answers: raw,
  });
  if (!parsed.success) return { ok: false, error: 'Réponse invalide.' };

  const tenantId = session.user.tenantId;
  const result = await withTenant(tenantId, (tx) =>
    submitResponse(tx, tenantId, session.user.id, parsed.data),
  );

  if (!result.ok) {
    const messages: Record<string, string> = {
      NOT_OPEN: "Cette enquête n'est plus ouverte.",
      ALREADY_ANSWERED: 'Vous avez déjà répondu à cette enquête.',
      NOT_FOUND: 'Enquête introuvable.',
      MISSING_REQUIRED: 'Merci de répondre aux questions obligatoires.',
    };
    return { ok: false, error: messages[result.error] ?? 'Erreur' };
  }

  revalidatePath('/parent/surveys');
  return { ok: true };
}
