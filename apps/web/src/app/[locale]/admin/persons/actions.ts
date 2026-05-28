'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { personCreateSchema, personUpdateSchema } from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function flatten<T>(parsed: z.SafeParseError<T>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join('.');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

function formToInput(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
  };
  return {
    type: get('type'),
    firstName: get('firstName'),
    lastName: get('lastName'),
    birthDate: get('birthDate'),
    gender: get('gender'),
    nationality: get('nationality'),
    cin: get('cin'),
    contacts: {
      email: get('contactEmail'),
      phone: get('contactPhone'),
      whatsapp: get('contactWhatsapp'),
    },
    address: {
      line1: get('addressLine1'),
      city: get('addressCity'),
      postalCode: get('addressPostalCode'),
      country: get('addressCountry'),
    },
  };
}

export async function createPersonAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('students.write');

  const parsed = personCreateSchema.safeParse(formToInput(formData));
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: flatten(parsed) };
  }

  const tenantId = session.user.tenantId;

  const created = await withTenant(tenantId, async (tx) => {
    const person = await tx.person.create({
      data: {
        tenantId,
        type: parsed.data.type,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        birthDate: parsed.data.birthDate,
        gender: parsed.data.gender,
        nationality: parsed.data.nationality,
        cin: parsed.data.cin,
        contacts: parsed.data.contacts ?? {},
        address: parsed.data.address ?? {},
      },
    });

    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'create',
      entityType: 'Person',
      entityId: person.id,
      after: {
        type: person.type,
        firstName: person.firstName,
        lastName: person.lastName,
      },
    });

    return person;
  });

  revalidatePath(`/admin/persons`);
  return { ok: true, data: { id: created.id } };
}

export async function updatePersonAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('students.write');

  const parsed = personUpdateSchema.safeParse(formToInput(formData));
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: flatten(parsed) };
  }

  const tenantId = session.user.tenantId;

  await withTenant(tenantId, async (tx) => {
    const before = await tx.person.findUnique({ where: { id } });
    if (!before) throw new Error('Personne introuvable');

    const updated = await tx.person.update({
      where: { id },
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        birthDate: parsed.data.birthDate,
        gender: parsed.data.gender,
        nationality: parsed.data.nationality,
        cin: parsed.data.cin,
        contacts: parsed.data.contacts ?? before.contacts ?? undefined,
        address: parsed.data.address ?? before.address ?? undefined,
      },
    });

    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'update',
      entityType: 'Person',
      entityId: id,
      before: {
        firstName: before.firstName,
        lastName: before.lastName,
        contacts: before.contacts,
      },
      after: {
        firstName: updated.firstName,
        lastName: updated.lastName,
        contacts: updated.contacts,
      },
    });
  });

  revalidatePath(`/admin/persons`);
  revalidatePath(`/admin/persons/${id}`);
  return { ok: true };
}

export async function softDeletePersonAction(id: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('students.write');

  const tenantId = session.user.tenantId;

  await withTenant(tenantId, async (tx) => {
    const before = await tx.person.findUnique({ where: { id } });
    if (!before) throw new Error('Personne introuvable');

    await tx.person.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'delete',
      entityType: 'Person',
      entityId: id,
      before: { firstName: before.firstName, lastName: before.lastName, type: before.type },
    });
  });

  revalidatePath(`/admin/persons`);
  redirect(`/admin/persons`);
}

export async function restorePersonAction(id: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('students.write');

  const tenantId = session.user.tenantId;

  await withTenant(tenantId, async (tx) => {
    await tx.person.update({
      where: { id },
      data: { deletedAt: null },
    });

    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'restore',
      entityType: 'Person',
      entityId: id,
    });
  });

  revalidatePath(`/admin/persons`);
  revalidatePath(`/admin/persons/${id}`);
  return { ok: true };
}
