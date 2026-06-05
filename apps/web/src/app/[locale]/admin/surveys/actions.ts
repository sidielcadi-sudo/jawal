'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { surveyCreateSchema } from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { createSurvey } from '@/lib/survey';

type Result<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function fl<T>(parsed: z.SafeParseError<T>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join('.');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

const PERM = 'communication.write';

export async function createSurveyAction(formData: FormData): Promise<Result<{ id: string }>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission(PERM);

  const rawQuestions = (() => {
    const v = formData.get('questions');
    if (typeof v !== 'string') return [];
    try {
      return JSON.parse(v);
    } catch {
      return [];
    }
  })();

  const periodId = (formData.get('periodId') as string | null)?.trim() || undefined;
  const parsed = surveyCreateSchema.safeParse({
    title: (formData.get('title') as string | null)?.trim() ?? '',
    description: (formData.get('description') as string | null)?.trim() || undefined,
    audience: formData.get('audience'),
    periodId,
    anonymous: formData.get('anonymous') === 'on' || formData.get('anonymous') === 'true',
    questions: rawQuestions,
  });
  if (!parsed.success) return { ok: false, error: 'Données invalides.', fieldErrors: fl(parsed) };

  const tenantId = session.user.tenantId;
  const survey = await withTenant(tenantId, async (tx) => {
    const s = await createSurvey(tx, tenantId, session.user.id, parsed.data);
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'create',
      entityType: 'Survey',
      entityId: s.id,
      after: { title: s.title, audience: s.audience },
    });
    return s;
  });

  revalidatePath('/admin/surveys');
  return { ok: true, data: { id: survey.id } };
}

async function setStatus(id: string, status: 'OPEN' | 'CLOSED', action: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission(PERM);

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    await tx.survey.update({
      where: { id },
      data: {
        status,
        opensAt: status === 'OPEN' ? new Date() : undefined,
        closesAt: status === 'CLOSED' ? new Date() : undefined,
      },
    });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action,
      entityType: 'Survey',
      entityId: id,
    });
  });
  revalidatePath('/admin/surveys');
  revalidatePath(`/admin/surveys/${id}`);
  return { ok: true };
}

export async function openSurveyAction(id: string): Promise<Result> {
  return setStatus(id, 'OPEN', 'open');
}

export async function closeSurveyAction(id: string): Promise<Result> {
  return setStatus(id, 'CLOSED', 'close');
}

export async function deleteSurveyAction(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission(PERM);

  const tenantId = session.user.tenantId;
  await withTenant(tenantId, async (tx) => {
    const before = await tx.survey.findUnique({ where: { id }, select: { title: true } });
    if (!before) throw new Error('Enquête introuvable');
    await tx.survey.delete({ where: { id } });
    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'delete',
      entityType: 'Survey',
      entityId: id,
      before: { title: before.title },
    });
  });
  revalidatePath('/admin/surveys');
  return { ok: true };
}
