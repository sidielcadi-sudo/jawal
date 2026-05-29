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

  let parents: Array<{ parentId: string; type: 'FATHER' | 'MOTHER' | 'LEGAL_GUARDIAN' | 'GUARDIAN' }> | undefined;
  const parentsRaw = formData.get('parents');
  if (typeof parentsRaw === 'string' && parentsRaw.trim() !== '') {
    try {
      const arr = JSON.parse(parentsRaw);
      if (Array.isArray(arr)) {
        parents = arr.filter(
          (p) => p && typeof p.parentId === 'string' && p.parentId && typeof p.type === 'string',
        );
      }
    } catch {
      // ignore — Zod ne recevra rien et le champ restera undefined
    }
  }

  return {
    type: get('type'),
    roleId: get('roleId'),
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
    parents,
    hireDate: get('hireDate'),
    contractEndDate: get('contractEndDate'),
    contractType: get('contractType'),
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

  // roleId, hireDate, contractEndDate, contractType n'ont de sens que pour TEACHER/STAFF.
  const isEmployee = parsed.data.type === 'TEACHER' || parsed.data.type === 'STAFF';
  const roleId = isEmployee ? parsed.data.roleId ?? null : null;
  const hireDate = isEmployee ? parsed.data.hireDate ?? null : null;
  const contractEndDate = isEmployee ? parsed.data.contractEndDate ?? null : null;
  const contractType = isEmployee ? parsed.data.contractType ?? null : null;

  const created = await withTenant(tenantId, async (tx) => {
    const person = await tx.person.create({
      data: {
        tenantId,
        type: parsed.data.type,
        roleId,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        birthDate: parsed.data.birthDate,
        gender: parsed.data.gender,
        nationality: parsed.data.nationality,
        cin: parsed.data.cin,
        contacts: parsed.data.contacts ?? {},
        address: parsed.data.address ?? {},
        hireDate,
        contractEndDate,
        contractType,
      },
    });

    // Liens parents (uniquement pour les élèves)
    if (parsed.data.type === 'STUDENT' && parsed.data.parents && parsed.data.parents.length > 0) {
      for (const link of parsed.data.parents) {
        await tx.personRelation.create({
          data: {
            tenantId,
            childId: person.id,
            parentId: link.parentId,
            type: link.type,
          },
        });
      }
    }

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
        roleId,
        parents: parsed.data.parents?.length ?? 0,
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

    const isEmployee = before.type === 'TEACHER' || before.type === 'STAFF';
    const roleId = isEmployee ? parsed.data.roleId ?? null : null;
    const hireDate = isEmployee ? parsed.data.hireDate ?? null : null;
    const contractEndDate = isEmployee ? parsed.data.contractEndDate ?? null : null;
    const contractType = isEmployee ? parsed.data.contractType ?? null : null;

    const updated = await tx.person.update({
      where: { id },
      data: {
        roleId,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        birthDate: parsed.data.birthDate,
        gender: parsed.data.gender,
        nationality: parsed.data.nationality,
        cin: parsed.data.cin,
        contacts: parsed.data.contacts ?? before.contacts ?? undefined,
        address: parsed.data.address ?? before.address ?? undefined,
        hireDate,
        contractEndDate,
        contractType,
      },
    });

    // Synchronisation des liens parents (seulement pour STUDENT).
    // On efface puis recrée — plus simple et idempotent.
    if (before.type === 'STUDENT' && parsed.data.parents !== undefined) {
      await tx.personRelation.deleteMany({ where: { childId: id } });
      for (const link of parsed.data.parents) {
        await tx.personRelation.create({
          data: {
            tenantId,
            childId: id,
            parentId: link.parentId,
            type: link.type,
          },
        });
      }
    }

    await logAudit(tx, {
      tenantId,
      userId: session.user.id,
      action: 'update',
      entityType: 'Person',
      entityId: id,
      before: {
        firstName: before.firstName,
        lastName: before.lastName,
        roleId: before.roleId,
        contacts: before.contacts,
      },
      after: {
        firstName: updated.firstName,
        lastName: updated.lastName,
        roleId: updated.roleId,
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
