'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { findGroupOverlaps, splitIntoGroups, type GroupShape } from '@/lib/class-groups';

type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string };

async function guard() {
  const session = await auth();
  if (!session?.user) return null;
  await requirePermission('classes.write');
  return session;
}

const touch = (classId: string) => {
  revalidatePath(`/admin/classes/${classId}/groups`);
  revalidatePath(`/admin/classes/${classId}/timetable`);
};

/**
 * Vérifie qu'aucun élève ne se retrouve dans deux groupes de la même matière.
 *
 * Contrôle transversal : il porte sur TOUS les groupes de la classe pour cette
 * matière, pas sur celui qu'on modifie. Une composition valide prise seule peut
 * devenir invalide face aux autres — c'est justement le cas qu'on veut attraper.
 */
async function assertNoOverlap(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  classId: string,
  subjectId: string | null,
) {
  const groups = await tx.classGroup.findMany({
    where: { classId, subjectId },
    select: { id: true, name: true, subjectId: true, members: { select: { studentId: true } } },
  });
  const shapes: GroupShape[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    subjectId: g.subjectId,
    memberIds: g.members.map((m) => m.studentId),
  }));
  const overlaps = findGroupOverlaps(shapes);
  if (overlaps.length === 0) return;

  const names = new Map(groups.map((g) => [g.id, g.name]));
  const ids = overlaps.map((o) => o.studentId);
  const students = await tx.person.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true },
  });
  const byId = new Map(students.map((s) => [s.id, `${s.lastName} ${s.firstName}`]));
  const detail = overlaps
    .slice(0, 5)
    .map(
      (o) =>
        `${byId.get(o.studentId) ?? o.studentId} (${o.groupIds.map((g) => names.get(g) ?? g).join(' + ')})`,
    )
    .join(' ; ');
  throw new Error(
    `Un élève ne peut pas être dans deux groupes de la même matière : ${detail}` +
      (overlaps.length > 5 ? ` … et ${overlaps.length - 5} autres` : ''),
  );
}

/** Crée un groupe. `subjectId` vide = groupe polyvalent, valable pour toutes les matières. */
export async function createGroupAction(input: {
  classId: string;
  subjectId: string | null;
  name: string;
}): Promise<Result<{ id: string }>> {
  const session = await guard();
  if (!session) return { ok: false, error: 'Non autorisé' };
  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Le nom du groupe est requis.' };
  const tenantId = session.user.tenantId;

  try {
    const id = await withTenant(tenantId, async (tx) => {
      const cls = await tx.class.findUnique({
        where: { id: input.classId },
        select: { id: true },
      });
      if (!cls) throw new Error('Classe introuvable.');

      const last = await tx.classGroup.findFirst({
        where: { classId: input.classId, subjectId: input.subjectId },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      const g = await tx.classGroup.create({
        data: {
          tenantId,
          classId: input.classId,
          subjectId: input.subjectId,
          name,
          order: (last?.order ?? 0) + 10,
        },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'ClassGroup',
        entityId: g.id,
        after: { classId: input.classId, subjectId: input.subjectId, name },
      });
      return g.id;
    });
    touch(input.classId);
    return { ok: true, data: { id } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

export async function renameGroupAction(
  groupId: string,
  input: { name: string; nameAr?: string },
): Promise<Result> {
  const session = await guard();
  if (!session) return { ok: false, error: 'Non autorisé' };
  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Le nom du groupe est requis.' };

  try {
    const classId = await withTenant(session.user.tenantId, async (tx) => {
      const g = await tx.classGroup.update({
        where: { id: groupId },
        data: { name, nameAr: input.nameAr?.trim() || null },
        select: { classId: true },
      });
      return g.classId;
    });
    touch(classId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/**
 * Supprime un groupe. Ses séances d'emploi du temps partent avec (cascade) :
 * une séance sans groupe n'aurait plus de public. On le compte pour le dire.
 */
export async function deleteGroupAction(groupId: string): Promise<Result<{ entries: number }>> {
  const session = await guard();
  if (!session) return { ok: false, error: 'Non autorisé' };

  try {
    const out = await withTenant(session.user.tenantId, async (tx) => {
      const g = await tx.classGroup.findUnique({
        where: { id: groupId },
        select: { classId: true, name: true, _count: { select: { entries: true } } },
      });
      if (!g) throw new Error('Groupe introuvable.');
      await tx.classGroup.delete({ where: { id: groupId } });
      await logAudit(tx, {
        tenantId: session.user.tenantId,
        userId: session.user.id,
        action: 'delete',
        entityType: 'ClassGroup',
        entityId: groupId,
        before: { name: g.name, entries: g._count.entries },
      });
      return { classId: g.classId, entries: g._count.entries };
    });
    touch(out.classId);
    return { ok: true, data: { entries: out.entries } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Remplace la composition d'un groupe. */
export async function setGroupMembersAction(
  groupId: string,
  studentIds: string[],
): Promise<Result<{ count: number }>> {
  const session = await guard();
  if (!session) return { ok: false, error: 'Non autorisé' };
  const tenantId = session.user.tenantId;

  try {
    const out = await withTenant(tenantId, async (tx) => {
      const g = await tx.classGroup.findUnique({
        where: { id: groupId },
        select: { id: true, classId: true, subjectId: true, name: true },
      });
      if (!g) throw new Error('Groupe introuvable.');

      // Un groupe ne contient que des élèves de SA classe : le reste serait une
      // faute de saisie silencieuse.
      const inClass = await tx.studentClass.findMany({
        where: { classId: g.classId, unenrolledAt: null, studentId: { in: studentIds } },
        select: { studentId: true },
      });
      const allowed = new Set(inClass.map((x) => x.studentId));
      const rejected = studentIds.filter((s) => !allowed.has(s));
      if (rejected.length > 0) {
        throw new Error(`${rejected.length} élève(s) ne sont pas dans cette classe.`);
      }

      await tx.classGroupMember.deleteMany({ where: { groupId } });
      if (allowed.size > 0) {
        await tx.classGroupMember.createMany({
          data: [...allowed].map((studentId) => ({ tenantId, groupId, studentId })),
          skipDuplicates: true,
        });
      }

      await assertNoOverlap(tx, g.classId, g.subjectId);
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'ClassGroup',
        entityId: groupId,
        after: { members: allowed.size },
      });
      return { classId: g.classId, count: allowed.size };
    });
    touch(out.classId);
    return { ok: true, data: { count: out.count } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/**
 * Répartition automatique : crée `count` groupes et distribue l'effectif.
 *
 * Remplace les groupes existants de la matière — c'est un geste de mise en
 * place, pas un ajout. On le dit dans l'écran, et on refuse si des séances
 * d'emploi du temps sont déjà accrochées aux groupes qu'on s'apprête à
 * supprimer : elles disparaîtraient en silence.
 */
export async function autoSplitAction(input: {
  classId: string;
  subjectId: string | null;
  count: number;
}): Promise<Result<{ groups: number; students: number }>> {
  const session = await guard();
  if (!session) return { ok: false, error: 'Non autorisé' };
  if (input.count < 2 || input.count > 6) {
    return { ok: false, error: 'Le nombre de groupes doit être entre 2 et 6.' };
  }
  const tenantId = session.user.tenantId;

  try {
    const out = await withTenant(tenantId, async (tx) => {
      const existing = await tx.classGroup.findMany({
        where: { classId: input.classId, subjectId: input.subjectId },
        select: { id: true, name: true, _count: { select: { entries: true } } },
      });
      const withEntries = existing.filter((g) => g._count.entries > 0);
      if (withEntries.length > 0) {
        throw new Error(
          `Des séances d'emploi du temps utilisent déjà ${withEntries
            .map((g) => g.name)
            .join(', ')}. Supprimez-les d'abord, ou composez les groupes à la main.`,
        );
      }

      const students = await tx.studentClass.findMany({
        where: { classId: input.classId, unenrolledAt: null },
        select: { studentId: true, student: { select: { lastName: true, firstName: true } } },
        orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
      });
      if (students.length === 0) throw new Error('Aucun élève dans cette classe.');

      await tx.classGroup.deleteMany({ where: { id: { in: existing.map((g) => g.id) } } });

      const parts = splitIntoGroups(
        students.map((s) => s.studentId),
        input.count,
      );
      for (const [i, memberIds] of parts.entries()) {
        const g = await tx.classGroup.create({
          data: {
            tenantId,
            classId: input.classId,
            subjectId: input.subjectId,
            name: `Groupe ${i + 1}`,
            nameAr: `المجموعة ${i + 1}`,
            order: (i + 1) * 10,
          },
        });
        if (memberIds.length > 0) {
          await tx.classGroupMember.createMany({
            data: memberIds.map((studentId) => ({ tenantId, groupId: g.id, studentId })),
          });
        }
      }

      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'Class',
        entityId: input.classId,
        after: { autoSplit: input.count, subjectId: input.subjectId, students: students.length },
      });
      return { groups: parts.length, students: students.length };
    });
    touch(input.classId);
    return { ok: true, data: out };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

const message = (e: unknown) => (e instanceof Error ? e.message : 'Erreur');

/**
 * Fixe le nombre d'heures réellement dédoublées pour une (classe, matière).
 *
 * La valeur appartient au couple, pas au groupe : elle est donc écrite sur
 * **tous** les groupes de la matière en un seul geste. C'est le seul chemin
 * d'écriture, ce qui garantit qu'ils ne divergent pas.
 *
 * `null` rétablit le comportement par défaut : le dédoublement porte sur la
 * totalité du volume.
 */
export async function setSplitHoursAction(input: {
  classId: string;
  subjectId: string | null;
  hours: number | null;
}): Promise<Result<{ groups: number }>> {
  const session = await guard();
  if (!session) return { ok: false, error: 'Non autorisé' };
  if (input.hours != null && (!Number.isInteger(input.hours) || input.hours < 0 || input.hours > 40)) {
    return { ok: false, error: 'Le nombre d’heures dédoublées doit être un entier entre 0 et 40.' };
  }

  try {
    const count = await withTenant(session.user.tenantId, async (tx) => {
      const r = await tx.classGroup.updateMany({
        where: { classId: input.classId, subjectId: input.subjectId },
        data: { splitHours: input.hours },
      });
      await logAudit(tx, {
        tenantId: session.user.tenantId,
        userId: session.user.id,
        action: 'update',
        entityType: 'Class',
        entityId: input.classId,
        after: { subjectId: input.subjectId, splitHours: input.hours, groups: r.count },
      });
      return r.count;
    });
    touch(input.classId);
    return { ok: true, data: { groups: count } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
