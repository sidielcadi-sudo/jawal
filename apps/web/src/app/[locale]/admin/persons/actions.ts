'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { personCreateSchema, personUpdateSchema, TEACHER_SERVICE_CODE } from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission, requireRoleCode } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import type { Prisma } from '@/lib/db';
import { sendNotifications, parentRecipient, emailRecipient, type NotifyItem } from '@/lib/notify';
import { renderTemplate } from '@/lib/notify-templates';
import { sendDirectMessage } from '@/lib/inapp-message';
import { alertRole } from '@/lib/staff-alerts';
import { checkMove, moveRefusalMessage } from '@/lib/class-move';

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

/** Rôles autorisés à (ré)affecter la classe d'un élève depuis sa fiche. */
const CLASS_CHANGE_ROLES = ['tenant_admin', 'direction', 'cpe', 'scolarite'];

/**
 * Change la classe d'un élève (vie scolaire / direction / admin). Désactive la
 * classe active courante, (ré)active la nouvelle, et synchronise la classe du
 * dossier d'inscription de l'année. Action dédiée : n'exige pas `students.write`
 * (réservé à la modification complète de la fiche).
 */
export async function changeStudentClassAction(
  studentId: string,
  classId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requireRoleCode(CLASS_CHANGE_ROLES);
  const tenantId = session.user.tenantId;
  if (!classId) return { ok: false, error: 'Classe requise.' };

  try {
    await withTenant(tenantId, async (tx) => {
      const student = await tx.person.findUnique({
        where: { id: studentId },
        select: {
          type: true,
          firstName: true,
          lastName: true,
          contacts: true,
          userPersons: { select: { userId: true, user: { select: { email: true } } } },
        },
      });
      if (!student || student.type !== 'STUDENT') throw new Error('Élève introuvable.');

      const cls = await tx.class.findUnique({
        where: { id: classId },
        include: { _count: { select: { students: { where: { unenrolledAt: null } } } } },
      });
      if (!cls || cls.deletedAt) throw new Error('Classe introuvable ou archivée.');

      const current = await tx.studentClass.findFirst({
        where: { studentId, unenrolledAt: null },
        select: { id: true, classId: true, class: { select: { name: true, nameAr: true } } },
      });
      if (current?.classId === classId) return; // déjà dans cette classe

      // Garde-fous du déplacement. Seule la capacité était vérifiée : on
      // pouvait donc glisser un élève de 2AC dans une classe de 3AC, ou un
      // élève de Sciences Maths dans une classe de Lettres — et fausser tous
      // ses coefficients sans qu'aucun écran ne le signale.
      const enr = await tx.enrollment.findFirst({
        where: {
          studentId,
          academicYearId: cls.academicYearId,
          status: { notIn: ['WITHDRAWN', 'GRADUATED', 'REFUSE'] },
        },
        select: {
          status: true,
          academicYearId: true,
          levelId: true,
          trackId: true,
          classId: true,
        },
      });
      if (enr) {
        const verdict = checkMove(
          { ...enr, classId: current?.classId ?? enr.classId },
          {
            id: cls.id,
            academicYearId: cls.academicYearId,
            levelId: cls.levelId,
            trackId: cls.trackId,
            capacity: cls.capacity,
            enrolled: cls._count.students,
          },
        );
        if (!verdict.ok) throw new Error(moveRefusalMessage(verdict.reason, cls.capacity));
      } else if (cls._count.students >= cls.capacity) {
        // Pas de dossier sur l'année (cas d'un élève sans inscription) : au
        // moins la capacité doit tenir.
        throw new Error(`Capacité atteinte (${cls.capacity}).`);
      }

      // Désactive l'appartenance de classe courante.
      if (current) {
        await tx.studentClass.update({ where: { id: current.id }, data: { unenrolledAt: new Date() } });
      }
      // (Ré)active la nouvelle appartenance.
      const existing = await tx.studentClass.findUnique({
        where: { studentId_classId: { studentId, classId } },
      });
      if (existing) {
        await tx.studentClass.update({
          where: { id: existing.id },
          data: { unenrolledAt: null, enrolledAt: new Date() },
        });
      } else {
        await tx.studentClass.create({ data: { tenantId, studentId, classId } });
      }

      // Synchronise la classe du dossier d'inscription de l'année → l'attestation
      // de scolarité, l'emploi du temps et l'équipe pédagogique (lus par classe)
      // reflètent automatiquement la nouvelle classe.
      await tx.enrollment.updateMany({
        where: {
          studentId,
          academicYearId: cls.academicYearId,
          status: { notIn: ['WITHDRAWN', 'GRADUATED', 'REFUSE'] },
        },
        data: { classId },
      });

      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'change_class',
        entityType: 'StudentClass',
        entityId: studentId,
        after: { studentId, classId, from: current?.classId ?? null },
      });

      // ── Notifications : parents, élève, profs (ancienne + nouvelle classe),
      //    vie scolaire ─────────────────────────────────────────────────────
      await notifyClassChange(tx, {
        tenantId,
        fromUserId: session.user.id,
        studentId,
        student,
        childName: `${student.firstName} ${student.lastName}`,
        oldClass: current?.class.name ?? '—',
        oldClassId: current?.classId ?? null,
        newClass: cls.name,
        newClassId: classId,
        academicYearId: cls.academicYearId,
      });
    });
    revalidatePath(`/admin/persons/${studentId}`);
    revalidatePath(`/admin/persons/${studentId}/edit`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

type PersonContact = { contacts: unknown; userPersons: { userId: string; user: { email: string | null } | null }[] };

/**
 * Signale un changement de classe à toutes les parties : parents, élève,
 * professeurs de la nouvelle classe et vie scolaire. Chaque destinataire reçoit
 * un message interne (portail) et un e-mail ; la vie scolaire une alerte cloche.
 */
async function notifyClassChange(
  tx: Tx,
  args: {
    tenantId: string;
    fromUserId: string;
    studentId: string;
    student: PersonContact;
    childName: string;
    oldClass: string;
    oldClassId: string | null;
    newClass: string;
    newClassId: string;
    academicYearId: string;
  },
): Promise<void> {
  const { tenantId, fromUserId, childName, oldClass, newClass } = args;
  const locale = (await tx.tenant.findFirst({ select: { localeDefault: true } }))?.localeDefault ?? 'fr';
  const data = { child: childName, oldClass, newClass };
  const familyBody = renderTemplate('class.changed', data, locale);
  const familySubject = `Changement de classe — ${childName}`;
  const items: NotifyItem[] = [];

  // Parents référents.
  const relations = await tx.personRelation.findMany({
    where: { childId: args.studentId },
    select: { parent: { select: { id: true, contacts: true, userPersons: { select: { userId: true, user: { select: { email: true } } } } } } },
    orderBy: { createdAt: 'asc' },
  });
  const seenParents = new Set<string>();
  for (const r of relations) {
    if (seenParents.has(r.parent.id)) continue;
    seenParents.add(r.parent.id);
    const up = r.parent.userPersons[0];
    if (up?.userId) {
      await sendDirectMessage(tx, { tenantId, fromUserId, toUserId: up.userId, subject: familySubject, body: familyBody });
    }
    items.push({ channel: 'EMAIL', recipient: emailRecipient(r.parent.contacts, up?.user?.email), template: 'class.changed', data, studentId: args.studentId, relatedType: 'StudentClass', relatedId: args.studentId });
  }

  // Élève.
  const su = args.student.userPersons[0];
  if (su?.userId) {
    await sendDirectMessage(tx, { tenantId, fromUserId, toUserId: su.userId, subject: familySubject, body: familyBody });
  }
  items.push({ channel: 'EMAIL', recipient: emailRecipient(args.student.contacts, su?.user?.email), template: 'class.changed', data, studentId: args.studentId, relatedType: 'StudentClass', relatedId: args.studentId });

  // Professeurs concernés : nouvelle classe (« a rejoint ») ET ancienne classe
  // (« a quitté »). Un prof présent dans les deux n'est prévenu qu'une fois
  // (priorité à la nouvelle classe).
  const seenTeachers = new Set<string>();
  const notifyTeachers = async (
    classId: string,
    template: 'class.teacher' | 'class.teacherLeft',
    subject: string,
  ) => {
    const body = renderTemplate(template, data, locale);
    const assigns = await tx.teacherAssignment.findMany({
      where: { classId, academicYearId: args.academicYearId },
      select: { teacher: { select: { id: true, contacts: true, userPersons: { select: { userId: true, user: { select: { email: true } } } } } } },
    });
    for (const a of assigns) {
      if (seenTeachers.has(a.teacher.id)) continue;
      seenTeachers.add(a.teacher.id);
      const up = a.teacher.userPersons[0];
      if (up?.userId) {
        await sendDirectMessage(tx, { tenantId, fromUserId, toUserId: up.userId, subject, body });
      }
      items.push({ channel: 'EMAIL', recipient: emailRecipient(a.teacher.contacts, up?.user?.email), template, data, relatedType: 'StudentClass', relatedId: args.studentId });
    }
  };
  await notifyTeachers(args.newClassId, 'class.teacher', `Nouvel élève — ${newClass}`);
  if (args.oldClassId && args.oldClassId !== args.newClassId) {
    await notifyTeachers(args.oldClassId, 'class.teacherLeft', `Départ d'élève — ${oldClass}`);
  }

  // Vie scolaire : alerte cloche.
  await alertRole(tx, tenantId, ['cpe', 'scolarite'], {
    type: 'CLASS_CHANGE',
    title: `Changement de classe — ${childName}`,
    body: `${oldClass} → ${newClass}`,
    link: `/admin/persons/${args.studentId}`,
    relatedType: 'StudentClass',
    relatedId: args.studentId,
  });

  await sendNotifications(tx, tenantId, locale, items);
}

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

/**
 * Le code MASSAR est unique par établissement. On vérifie le conflit en amont
 * pour rendre une erreur de champ lisible, plutôt que de laisser remonter la
 * violation de contrainte Postgres depuis la transaction.
 */
async function massarIdConflict(
  tenantId: string,
  massarId: string | undefined,
  excludePersonId?: string,
): Promise<string | null> {
  if (!massarId) return null;
  const clash = await withTenant(tenantId, (tx) =>
    tx.person.findFirst({
      where: {
        massarId,
        deletedAt: null,
        ...(excludePersonId ? { id: { not: excludePersonId } } : {}),
      },
      select: { firstName: true, lastName: true },
    }),
  );
  return clash
    ? `Le code Massar « ${massarId} » est déjà attribué à ${clash.lastName} ${clash.firstName}.`
    : null;
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
    // État civil bilingue (colonnes dédiées).
    firstNameAr: get('firstNameAr'),
    lastNameAr: get('lastNameAr'),
    birthPlace: get('birthPlace'),
    birthPlaceAr: get('birthPlaceAr'),
    nationalityAr: get('nationalityAr'),
    addressAr: get('addressAr'),
    cityAr: get('cityAr'),
    // fatherFirstNameAr / motherFirstNameAr ne sont plus saisis : les parents
    // sont rattachés via le bloc « Parents / Tuteurs ». Les colonnes restent
    // alimentées par l'import MASSAR et sont préservées à la mise à jour.
    regime: get('regime'),
    usesTransport: formData.get('usesTransport') === 'on' || formData.get('usesTransport') === 'true',
    cne: get('cne'),
    massarId: get('massarId'),
    imageRights: formData.get('imageRights') === 'on' || formData.get('imageRights') === 'true',
    exitRights: get('exitRights'),
    dietInfo: get('dietInfo'),
    originSchool: get('originSchool'),
    originSchoolAr: get('originSchoolAr'),
    repeating: formData.get('repeating') === 'on' || formData.get('repeating') === 'true',
    contacts: {
      email: get('contactEmail'),
      phone: get('contactPhone'),
      // Règle métier : le WhatsApp EST le portable renseigné — plus de saisie
      // séparée, donc plus de risque de divergence entre les deux numéros.
      whatsapp: get('contactPhone'),
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

/**
 * Champs élève additionnels rangés en metadata (clés définies uniquement).
 * Le code MASSAR n'y figure plus : il a sa colonne `massarId`, unique par
 * établissement, qui sert de clé à l'import MASSAR.
 */
function buildStudentMeta(
  d: Partial<{
    cne: string;
    imageRights: boolean;
    exitRights: number;
    dietInfo: string;
    originSchool: string;
    originSchoolAr: string;
    repeating: boolean;
  }>,
  isStudent: boolean,
): Record<string, unknown> {
  if (!isStudent) return {};
  const m: Record<string, unknown> = {};
  if (d.cne !== undefined) m.cne = d.cne;
  if (d.imageRights !== undefined) m.imageRights = d.imageRights;
  if (d.exitRights !== undefined) m.exitRights = d.exitRights;
  if (d.dietInfo !== undefined) m.dietInfo = d.dietInfo;
  if (d.originSchool !== undefined) m.originSchool = d.originSchool;
  if (d.originSchoolAr !== undefined) m.originSchoolAr = d.originSchoolAr;
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
  d: Partial<{ cnssNumber: string; amoNumber: string }>,
  isEmployee: boolean,
): Record<string, unknown> {
  if (!isEmployee) return {};
  const m: Record<string, unknown> = {};
  if (d.cnssNumber !== undefined) m.cnssNumber = d.cnssNumber;
  if (d.amoNumber !== undefined) m.amoNumber = d.amoNumber;
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

  if (parsed.data.type === 'STUDENT') {
    const conflict = await massarIdConflict(tenantId, parsed.data.massarId);
    if (conflict) return { ok: false, error: conflict, fieldErrors: { massarId: conflict } };
  }

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
        // État civil bilingue (colonnes dédiées, saisies FR + AR).
        firstNameAr: parsed.data.firstNameAr ?? null,
        lastNameAr: parsed.data.lastNameAr ?? null,
        birthPlace: parsed.data.birthPlace ?? null,
        birthPlaceAr: parsed.data.birthPlaceAr ?? null,
        nationalityAr: parsed.data.nationalityAr ?? null,
        addressAr: parsed.data.addressAr ?? null,
        cityAr: parsed.data.cityAr ?? null,
        cin: parsed.data.cin,
        // Code MASSAR : élèves seulement, et vide → null (la contrainte
        // d'unicité tolère plusieurs NULL, pas plusieurs chaînes vides).
        massarId: parsed.data.type === 'STUDENT' ? (parsed.data.massarId || null) : null,
        regime,
        usesTransport,
        contacts: parsed.data.contacts ?? {},
        address: parsed.data.address ?? {},
        hireDate,
        contractEndDate,
        contractType,
        contractualHoursPerWeek,
        employmentStatus: isEmployee ? (parsed.data.employmentStatus ?? 'ACTIVE') : null,
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

  const conflict = await massarIdConflict(tenantId, parsed.data.massarId, id);
  if (conflict) return { ok: false, error: conflict, fieldErrors: { massarId: conflict } };

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
        // État civil bilingue (colonnes dédiées, saisies FR + AR).
        firstNameAr: parsed.data.firstNameAr ?? null,
        lastNameAr: parsed.data.lastNameAr ?? null,
        birthPlace: parsed.data.birthPlace ?? null,
        birthPlaceAr: parsed.data.birthPlaceAr ?? null,
        nationalityAr: parsed.data.nationalityAr ?? null,
        addressAr: parsed.data.addressAr ?? null,
        cityAr: parsed.data.cityAr ?? null,
        // Prénoms des parents en arabe : plus saisis (bloc « Parents /
        // Tuteurs »), donc conservés tels que l'import MASSAR les a posés.
        fatherFirstNameAr: parsed.data.fatherFirstNameAr ?? before.fatherFirstNameAr,
        motherFirstNameAr: parsed.data.motherFirstNameAr ?? before.motherFirstNameAr,
        cin: parsed.data.cin,
        massarId: before.type === 'STUDENT' ? (parsed.data.massarId || null) : null,
        regime,
        usesTransport,
        contacts: parsed.data.contacts ?? before.contacts ?? undefined,
        address: parsed.data.address ?? before.address ?? undefined,
        hireDate,
        contractEndDate,
        contractType,
        contractualHoursPerWeek,
        employmentStatus: isEmployee ? (parsed.data.employmentStatus ?? 'ACTIVE') : null,
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
