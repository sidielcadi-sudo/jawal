'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { personCreateSchema, personUpdateSchema, TEACHER_SERVICE_CODE } from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import type { Prisma } from '@/lib/db';

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

/**
 * Déduit le service de rattachement d'une personne depuis son type/rôle :
 * TEACHER → service « Enseignants » ; STAFF → service de son type (PersonRole) ;
 * sinon null. Le service n'est jamais saisi à la main sur la fiche.
 */
async function deriveServiceId(
  tx: Tx,
  tenantId: string,
  type: string,
  roleId: string | null,
): Promise<string | null> {
  if (type === 'TEACHER') {
    const s = await tx.service.findUnique({
      where: { tenantId_code: { tenantId, code: TEACHER_SERVICE_CODE } },
      select: { id: true },
    });
    return s?.id ?? null;
  }
  if (type === 'STAFF' && roleId) {
    const r = await tx.personRole.findUnique({ where: { id: roleId }, select: { serviceId: true } });
    return r?.serviceId ?? null;
  }
  return null;
}

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

function safeJson<T>(
  v: FormDataEntryValue | null,
  validator: (x: unknown) => x is T,
): T | undefined {
  if (typeof v !== 'string' || v.trim() === '') return undefined;
  try {
    const parsed = JSON.parse(v);
    return validator(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Normalise la casse d'un nom : « charifi » → « Charifi », « EL AMRANI » → « El Amrani ». */
function titleCaseName(s: string | undefined): string | undefined {
  if (!s) return s;
  return s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_m, sep, ch) => sep + ch.toUpperCase());
}

function formToInput(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
  };

  const parents = safeJson(
    formData.get('parents'),
    (
      x,
    ): x is Array<{
      parentId: string;
      type: 'FATHER' | 'MOTHER' | 'LEGAL_GUARDIAN' | 'GUARDIAN';
    }> =>
      Array.isArray(x) &&
      x.every((p) => p && typeof p.parentId === 'string' && typeof p.type === 'string'),
  );

  const specialtySubjectIds = safeJson(
    formData.get('specialtySubjectIds'),
    (x): x is string[] => Array.isArray(x) && x.every((s) => typeof s === 'string'),
  );

  const cycleIds = safeJson(
    formData.get('cycleIds'),
    (x): x is string[] => Array.isArray(x) && x.every((s) => typeof s === 'string'),
  );

  const priorityClassIds = safeJson(
    formData.get('priorityClassIds'),
    (x): x is string[] => Array.isArray(x) && x.every((s) => typeof s === 'string'),
  );

  const diplomas = safeJson(
    formData.get('diplomas'),
    (x): x is Array<{ title: string; institution?: string; year?: number }> =>
      Array.isArray(x) && x.every((d) => d && typeof d.title === 'string'),
  );

  const availability = safeJson(
    formData.get('availability'),
    (x): x is Record<string, Array<{ from: string; to: string }>> =>
      typeof x === 'object' && x !== null && !Array.isArray(x),
  );

  const benefits = safeJson(
    formData.get('benefits'),
    (x): x is Array<{ label: string; amount: number }> =>
      Array.isArray(x) && x.every((b) => b && typeof b.label === 'string'),
  );

  const deductions = safeJson(
    formData.get('deductions'),
    (x): x is Array<{ label: string; amount: number; date?: string }> =>
      Array.isArray(x) && x.every((d) => d && typeof d.label === 'string'),
  );

  return {
    type: get('type'),
    roleId: get('roleId'),
    service: get('service'),
    firstName: titleCaseName(get('firstName')),
    lastName: titleCaseName(get('lastName')),
    birthDate: get('birthDate'),
    gender: get('gender'),
    nationality: get('nationality'),
    cin: get('cin'),
    regime: get('regime'),
    usesTransport: formData.get('usesTransport') === 'on' || formData.get('usesTransport') === 'true',
    cne: get('cne'),
    codeMassar: get('codeMassar'),
    imageRights: formData.get('imageRights') === 'on' || formData.get('imageRights') === 'true',
    exitRights: get('exitRights'),
    dietInfo: get('dietInfo'),
    originSchool: get('originSchool'),
    repeating: formData.get('repeating') === 'on' || formData.get('repeating') === 'true',
    contacts: {
      email: get('contactEmail'),
      phone: get('contactPhone'),
      // Par défaut, le WhatsApp reprend le numéro de téléphone s'il n'est pas saisi.
      whatsapp: get('contactWhatsapp') ?? get('contactPhone'),
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
    cnssNumber: get('cnssNumber'),
    amoNumber: get('amoNumber'),
    employmentStatus: get('employmentStatus'),
    contractualHoursPerWeek: get('contractualHoursPerWeek'),
    specialtySubjectIds,
    cycleIds,
    priorityClassIds,
    experienceYears: get('experienceYears'),
    diplomas,
    availability,
    rib: get('rib'),
    bankName: get('bankName'),
    payrollMethod: get('payrollMethod'),
    grossSalary: get('grossSalary'),
    netSalary: get('netSalary'),
    benefits,
    deductions,
  };
}

/** Champs élève additionnels rangés en metadata (clés définies uniquement). */
function buildStudentMeta(
  d: Partial<{
    cne: string;
    codeMassar: string;
    imageRights: boolean;
    exitRights: number;
    dietInfo: string;
    originSchool: string;
    repeating: boolean;
  }>,
  isStudent: boolean,
): Record<string, unknown> {
  if (!isStudent) return {};
  const m: Record<string, unknown> = {};
  if (d.cne !== undefined) m.cne = d.cne;
  if (d.codeMassar !== undefined) m.codeMassar = d.codeMassar;
  if (d.imageRights !== undefined) m.imageRights = d.imageRights;
  if (d.exitRights !== undefined) m.exitRights = d.exitRights;
  if (d.dietInfo !== undefined) m.dietInfo = d.dietInfo;
  if (d.originSchool !== undefined) m.originSchool = d.originSchool;
  if (d.repeating !== undefined) m.repeating = d.repeating;
  return m;
}

/** Bloc « Santé & sécurité » saisi à la création d'un élève (champs health_*). */
function buildHealthMeta(formData: FormData, isStudent: boolean): Record<string, unknown> {
  if (!isStudent) return {};
  const g = (k: string) => {
    const v = formData.get(`health_${k}`);
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
  };
  const b = (k: string) => formData.get(`health_${k}`) === 'on';
  const h = {
    allergies: g('allergies'),
    chronicConditions: g('chronicConditions'),
    treatments: g('treatments'),
    vaccinations: g('vaccinations'),
    doctorName: g('doctorName'),
    doctorPhone: g('doctorPhone'),
    emergencyContactName: g('emergencyContactName'),
    emergencyContactPhone: g('emergencyContactPhone'),
    paiNote: g('paiNote'),
    pai: b('pai'),
    medAuthorization: b('medAuthorization'),
    outingAuthorization: b('outingAuthorization'),
  };
  const hasAny = Object.values(h).some((v) => v !== null && v !== false);
  return hasAny ? { health: h } : {};
}

/** Champs RH employeur (TEACHER/STAFF) rangés en metadata. */
function buildEmployeeMeta(
  d: Partial<{ cnssNumber: string; amoNumber: string; employmentStatus: string }>,
  isEmployee: boolean,
): Record<string, unknown> {
  if (!isEmployee) return {};
  const m: Record<string, unknown> = {};
  if (d.cnssNumber !== undefined) m.cnssNumber = d.cnssNumber;
  if (d.amoNumber !== undefined) m.amoNumber = d.amoNumber;
  if (d.employmentStatus !== undefined) m.employmentStatus = d.employmentStatus;
  return m;
}

export async function createPersonAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
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
  const isTeacher = parsed.data.type === 'TEACHER';
  const roleId = isEmployee ? (parsed.data.roleId ?? null) : null;
  // Service de rattachement : pertinent uniquement pour le personnel (STAFF).
  const service = parsed.data.type === 'STAFF' ? (parsed.data.service ?? null) : null;
  const hireDate = isEmployee ? (parsed.data.hireDate ?? null) : null;
  const contractEndDate = isEmployee ? (parsed.data.contractEndDate ?? null) : null;
  const contractType = isEmployee ? (parsed.data.contractType ?? null) : null;
  const contractualHoursPerWeek = isTeacher ? (parsed.data.contractualHoursPerWeek ?? null) : null;
  // Régime + transport : pertinents uniquement pour un élève.
  const regime = parsed.data.type === 'STUDENT' ? (parsed.data.regime ?? null) : null;
  const usesTransport = parsed.data.type === 'STUDENT' ? (parsed.data.usesTransport ?? false) : false;
  const homeRoomRaw = formData.get('homeRoomId');
  const homeRoomId =
    isTeacher && typeof homeRoomRaw === 'string' && homeRoomRaw ? homeRoomRaw : null;

  const created = await withTenant(tenantId, async (tx) => {
    const serviceId = await deriveServiceId(tx, tenantId, parsed.data.type, roleId);
    const person = await tx.person.create({
      data: {
        tenantId,
        type: parsed.data.type,
        roleId,
        service,
        serviceId,
        metadata: {
          ...(homeRoomId ? { homeRoomId } : {}),
          ...buildStudentMeta(parsed.data, parsed.data.type === 'STUDENT'),
          ...buildEmployeeMeta(parsed.data, isEmployee),
          ...buildHealthMeta(formData, parsed.data.type === 'STUDENT'),
        },
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        birthDate: parsed.data.birthDate,
        gender: parsed.data.gender,
        nationality: parsed.data.nationality,
        cin: parsed.data.cin,
        regime,
        usesTransport,
        contacts: parsed.data.contacts ?? {},
        address: parsed.data.address ?? {},
        hireDate,
        contractEndDate,
        contractType,
        contractualHoursPerWeek,
        experienceYears: isEmployee ? (parsed.data.experienceYears ?? null) : null,
        availability: isEmployee ? (parsed.data.availability ?? {}) : {},
        rib: isEmployee ? (parsed.data.rib ?? null) : null,
        bankName: isEmployee ? (parsed.data.bankName ?? null) : null,
        payrollMethod: isEmployee ? (parsed.data.payrollMethod ?? null) : null,
        grossSalary: isEmployee ? (parsed.data.grossSalary ?? null) : null,
        netSalary: isEmployee ? (parsed.data.netSalary ?? null) : null,
        benefits: isEmployee ? (parsed.data.benefits ?? []) : [],
        deductions: isEmployee ? (parsed.data.deductions ?? []) : [],
      },
    });

    // Spécialités + cycles (TEACHER uniquement)
    if (isTeacher && parsed.data.specialtySubjectIds) {
      for (const subjectId of parsed.data.specialtySubjectIds) {
        await tx.teacherSpecialty.create({
          data: { tenantId, teacherId: person.id, subjectId },
        });
      }
    }
    if (isTeacher && parsed.data.cycleIds) {
      for (const cycleId of parsed.data.cycleIds) {
        await tx.teacherCycle.create({
          data: { tenantId, teacherId: person.id, cycleId },
        });
      }
    }
    if (isTeacher && parsed.data.priorityClassIds) {
      for (const classId of parsed.data.priorityClassIds) {
        await tx.teacherPriorityClass.create({
          data: { tenantId, teacherId: person.id, classId },
        });
      }
    }

    // Diplômes (TEACHER + STAFF)
    if (isEmployee && parsed.data.diplomas) {
      for (const [order, d] of parsed.data.diplomas.entries()) {
        await tx.diploma.create({
          data: {
            tenantId,
            personId: person.id,
            title: d.title,
            institution: d.institution,
            year: d.year,
            order,
          },
        });
      }
    }

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

export async function updatePersonAction(id: string, formData: FormData): Promise<ActionResult> {
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
    const isTeacher = before.type === 'TEACHER';
    const roleId = isEmployee ? (parsed.data.roleId ?? null) : null;
    const service = before.type === 'STAFF' ? (parsed.data.service ?? null) : null;
    const hireDate = isEmployee ? (parsed.data.hireDate ?? null) : null;
    const contractEndDate = isEmployee ? (parsed.data.contractEndDate ?? null) : null;
    const contractType = isEmployee ? (parsed.data.contractType ?? null) : null;
    const contractualHoursPerWeek = isTeacher
      ? (parsed.data.contractualHoursPerWeek ?? null)
      : null;
    // Régime & transport : VERROUILLÉS en édition (ils impactent la facturation).
    // On conserve toujours les valeurs existantes ; leur modification passe par
    // l'Inscription. Le formulaire les affiche désactivés.
    const regime = before.type === 'STUDENT' ? before.regime : null;
    const usesTransport = before.type === 'STUDENT' ? before.usesTransport : false;
    const serviceId = await deriveServiceId(tx, tenantId, before.type, roleId);

    const homeRoomRaw = formData.get('homeRoomId');
    const metadata = { ...(before.metadata as Record<string, unknown>) };
    if (isTeacher && typeof homeRoomRaw === 'string' && homeRoomRaw) metadata.homeRoomId = homeRoomRaw;
    else delete metadata.homeRoomId;
    Object.assign(metadata, buildStudentMeta(parsed.data, before.type === 'STUDENT'));
    Object.assign(metadata, buildEmployeeMeta(parsed.data, before.type === 'TEACHER' || before.type === 'STAFF'));

    const updated = await tx.person.update({
      where: { id },
      data: {
        roleId,
        service,
        serviceId,
        metadata: metadata as Prisma.InputJsonValue,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        birthDate: parsed.data.birthDate,
        gender: parsed.data.gender,
        nationality: parsed.data.nationality,
        cin: parsed.data.cin,
        regime,
        usesTransport,
        contacts: parsed.data.contacts ?? before.contacts ?? undefined,
        address: parsed.data.address ?? before.address ?? undefined,
        hireDate,
        contractEndDate,
        contractType,
        contractualHoursPerWeek,
        experienceYears: isEmployee ? (parsed.data.experienceYears ?? null) : null,
        availability:
          isEmployee && parsed.data.availability !== undefined
            ? parsed.data.availability
            : (before.availability ?? {}),
        rib: isEmployee ? (parsed.data.rib ?? null) : null,
        bankName: isEmployee ? (parsed.data.bankName ?? null) : null,
        payrollMethod: isEmployee ? (parsed.data.payrollMethod ?? null) : null,
        grossSalary: isEmployee ? (parsed.data.grossSalary ?? null) : null,
        netSalary: isEmployee ? (parsed.data.netSalary ?? null) : null,
        benefits:
          isEmployee && parsed.data.benefits !== undefined
            ? parsed.data.benefits
            : (before.benefits ?? []),
        deductions:
          isEmployee && parsed.data.deductions !== undefined
            ? parsed.data.deductions
            : (before.deductions ?? []),
      },
    });

    // Sync M2M : on remplace
    if (isTeacher && parsed.data.specialtySubjectIds !== undefined) {
      await tx.teacherSpecialty.deleteMany({ where: { teacherId: id } });
      for (const subjectId of parsed.data.specialtySubjectIds) {
        await tx.teacherSpecialty.create({
          data: { tenantId, teacherId: id, subjectId },
        });
      }
    }
    if (isTeacher && parsed.data.cycleIds !== undefined) {
      await tx.teacherCycle.deleteMany({ where: { teacherId: id } });
      for (const cycleId of parsed.data.cycleIds) {
        await tx.teacherCycle.create({
          data: { tenantId, teacherId: id, cycleId },
        });
      }
    }
    if (isTeacher && parsed.data.priorityClassIds !== undefined) {
      await tx.teacherPriorityClass.deleteMany({ where: { teacherId: id } });
      for (const classId of parsed.data.priorityClassIds) {
        await tx.teacherPriorityClass.create({
          data: { tenantId, teacherId: id, classId },
        });
      }
    }
    if (isEmployee && parsed.data.diplomas !== undefined) {
      await tx.diploma.deleteMany({ where: { personId: id } });
      for (const [order, d] of parsed.data.diplomas.entries()) {
        await tx.diploma.create({
          data: {
            tenantId,
            personId: id,
            title: d.title,
            institution: d.institution,
            year: d.year,
            order,
          },
        });
      }
    }

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

  const personType = await withTenant(tenantId, async (tx) => {
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
    return before.type;
  });

  revalidatePath(`/admin/persons`);
  // Reste sur la liste du même type (ex. Enseignants) plutôt que la liste globale.
  redirect(`/admin/persons?type=${personType}`);
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
