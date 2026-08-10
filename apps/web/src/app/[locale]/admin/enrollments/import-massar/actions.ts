'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import {
  analyzeMassarCsv,
  runMassarImport,
  type MassarImportStats,
  type MassarPreview,
} from '@/lib/massar-import';

/** Enveloppe des actions d'import MASSAR — la logique est dans `@/lib/massar-import`. */

export async function previewMassarAction(
  csvText: string,
  yearId: string,
): Promise<{ ok: true; preview: MassarPreview } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié.' };
  await requirePermission('tenants.manage');

  const res = await analyzeMassarCsv(session.user.tenantId, csvText, yearId);
  if (!res.ok) return res;
  return { ok: true, preview: res.preview };
}

export async function commitMassarAction(
  csvText: string,
  yearId: string,
): Promise<{ ok: true; stats: MassarImportStats } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié.' };
  await requirePermission('tenants.manage');

  const tenantId = session.user.tenantId;
  const res = await runMassarImport(tenantId, session.user.id, csvText, yearId, (tx, summary) =>
    logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'import_massar',
      entityType: 'Enrollment',
      after: summary,
    }),
  );
  if (!res.ok) return res;

  revalidatePath('/admin/enrollments');
  revalidatePath('/admin/persons');
  return res;
}
