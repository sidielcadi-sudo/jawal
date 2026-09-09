'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { timetableEntryUpsertSchema } from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { checkSlotComposition } from '@/lib/class-groups';

type Result<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Refus de composition d'une case — cf. lib/class-groups. */
const SLOT_ERRORS: Record<string, string> = {
  WHOLE_CLASS_PRESENT:
    "Une séance en classe entière occupe déjà ce créneau. Supprimez-la avant d'y placer des groupes.",
  GROUP_ALREADY_PLACED: 'Ce groupe a déjà une séance sur ce créneau.',
  GROUPS_PRESENT:
    'Des séances de groupe occupent ce créneau. Supprimez-les avant de repasser en classe entière.',
};

function flatten<T>(parsed: z.SafeParseError<T>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join('.');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Upsert d'une case d'EDT. Si tous les champs subject/teacher/room sont vides,
 * la case est supprimée (équivalent à un effacement).
 */
export async function upsertTimetableEntryAction(formData: FormData): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const raw = formData.get('payload');
  if (typeof raw !== 'string') return { ok: false, error: 'Payload manquant' };
  let parsedJson;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'JSON invalide' };
  }

  const parsed = timetableEntryUpsertSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: flatten(parsed) };
  }

  const tenantId = session.user.tenantId;

  try {
    await withTenant(tenantId, async (tx) => {
      // Vérifie que le slot existe et n'est pas un break
      const slot = await tx.timetableSlot.findUnique({ where: { id: parsed.data.slotId } });
      if (!slot) throw new Error('Créneau horaire introuvable.');
      if (slot.isBreak) throw new Error('Impossible de placer un cours dans une pause.');

      // Si tous les champs cours sont vides → suppression de la case
      const isEmpty =
        !parsed.data.subjectId && !parsed.data.teacherId && !parsed.data.roomId && !parsed.data.note;

      const groupId = parsed.data.groupId ?? null;

      // Un groupe doit appartenir à CETTE classe : une séance de « Groupe 1 »
      // de la 2AC-B placée sur la 2AC-A n'aurait aucun public.
      if (groupId) {
        const g = await tx.classGroup.findUnique({
          where: { id: groupId },
          select: { classId: true, name: true },
        });
        if (!g) throw new Error('Groupe introuvable.');
        if (g.classId !== parsed.data.classId) {
          throw new Error(`Le groupe « ${g.name} » n'appartient pas à cette classe.`);
        }
      }

      // Toutes les séances de la case : le dédoublement en autorise plusieurs.
      const occupants = await tx.timetableEntry.findMany({
        where: {
          classId: parsed.data.classId,
          academicYearId: parsed.data.academicYearId,
          dayOfWeek: parsed.data.dayOfWeek,
          slotId: parsed.data.slotId,
        },
        select: { id: true, groupId: true },
      });
      const existing = occupants.find((o) => o.groupId === groupId) ?? null;

      // Composition de la case. Les index partiels refusent les doublons
      // stricts ; mêler classe entière et groupes ne les viole pas, alors que
      // c'est incohérent — les élèves du groupe seraient attendus deux fois.
      if (!isEmpty) {
        const verdict = checkSlotComposition(
          occupants.map((o) => ({ entryId: o.id, groupId: o.groupId })),
          { groupId },
          existing?.id,
        );
        if (!verdict.ok) throw new Error(SLOT_ERRORS[verdict.reason]);
      }

      if (isEmpty) {
        if (existing) {
          await tx.timetableEntry.delete({ where: { id: existing.id } });
          await logAudit(tx, {
            tenantId,
            userId: session.user.id,
            action: 'delete',
            entityType: 'TimetableEntry',
            entityId: existing.id,
          });
        }
        return;
      }

      if (existing) {
        await tx.timetableEntry.update({
          where: { id: existing.id },
          data: {
            subjectId: parsed.data.subjectId ?? null,
            teacherId: parsed.data.teacherId ?? null,
            roomId: parsed.data.roomId ?? null,
            note: parsed.data.note ?? null,
          },
        });
      } else {
        await tx.timetableEntry.create({
          data: {
            tenantId,
            academicYearId: parsed.data.academicYearId,
            classId: parsed.data.classId,
            slotId: parsed.data.slotId,
            dayOfWeek: parsed.data.dayOfWeek,
            subjectId: parsed.data.subjectId ?? null,
            teacherId: parsed.data.teacherId ?? null,
            roomId: parsed.data.roomId ?? null,
            groupId,
            note: parsed.data.note ?? null,
          },
        });
      }

      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'upsert',
        entityType: 'TimetableEntry',
        entityId: `${parsed.data.classId}|${parsed.data.dayOfWeek}|${parsed.data.slotId}${
          groupId ? `|${groupId}` : ''
        }`,
        after: {
          subjectId: parsed.data.subjectId,
          teacherId: parsed.data.teacherId,
          roomId: parsed.data.roomId,
        },
      });
    });

    revalidatePath(`/admin/classes/${parsed.data.classId}/timetable`);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}
