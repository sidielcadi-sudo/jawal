'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  enrollmentCreateSchema,
  enrollmentValidateSchema,
  enrollmentWithdrawSchema,
} from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import {
  applyDiscount,
  computeSiblingDiscount,
  readSiblingDiscountPct,
} from '@/lib/enrollment-discount';

type Result<T = void> =
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

function input(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : '';
  };
  return get;
}

/**
 * Crée un dossier d'inscription en mode DRAFT. Ne génère pas d'échéancier
 * et n'affecte pas l'élève à une classe — c'est la validation qui le fait.
 */
export async function createEnrollmentAction(
  formData: FormData,
): Promise<Result<{ id: string }>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const get = input(formData);
  const parsed = enrollmentCreateSchema.safeParse({
    studentId: get('studentId'),
    academicYearId: get('academicYearId'),
    levelId: get('levelId'),
    notes: get('notes'),
  });
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: flatten(parsed) };
  }

  const tenantId = session.user.tenantId;

  try {
    const id = await withTenant(tenantId, async (tx) => {
      // Vérifie qu'il n'y a pas déjà un dossier non-WITHDRAWN/GRADUATED pour
      // l'élève sur cette année (le @@unique gère le cas, mais on veut un msg
      // plus clair côté UI).
      const existing = await tx.enrollment.findUnique({
        where: {
          studentId_academicYearId: {
            studentId: parsed.data.studentId,
            academicYearId: parsed.data.academicYearId,
          },
        },
      });
      if (existing) {
        throw new Error('Un dossier existe déjà pour cet élève sur cette année.');
      }

      const created = await tx.enrollment.create({
        data: {
          tenantId,
          studentId: parsed.data.studentId,
          academicYearId: parsed.data.academicYearId,
          levelId: parsed.data.levelId,
          status: 'DRAFT',
          notes: parsed.data.notes ?? null,
          createdByUserId: session.user.id,
        },
      });
      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'create',
        entityType: 'Enrollment',
        entityId: created.id,
        after: {
          studentId: parsed.data.studentId,
          academicYearId: parsed.data.academicYearId,
          levelId: parsed.data.levelId,
        },
      });
      return created.id;
    });

    revalidatePath('/admin/enrollments');
    return { ok: true, data: { id } };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

/**
 * Passe un dossier DRAFT en ACTIVE :
 *  1) calcule le rang fratrie (1 = aîné) et le pct de réduction tenant ;
 *  2) crée le StudentClass correspondant ;
 *  3) génère les Installments depuis FeeScheduleItem du (level × year),
 *     en appliquant la réduction pct sur chaque échéance.
 * Idempotent sur les Installments : si feesGenerated est déjà true, on
 * ne les regénère pas.
 */
export async function validateEnrollmentAction(
  formData: FormData,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const get = input(formData);
  const parsed = enrollmentValidateSchema.safeParse({
    enrollmentId: get('enrollmentId'),
    classId: get('classId'),
    discountPctOverride: get('discountPctOverride') || undefined,
    discountReason: get('discountReason') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: flatten(parsed) };
  }

  const tenantId = session.user.tenantId;

  try {
    await withTenant(tenantId, async (tx) => {
      const enrollment = await tx.enrollment.findUnique({
        where: { id: parsed.data.enrollmentId },
      });
      if (!enrollment) throw new Error('Dossier introuvable.');
      if (enrollment.status === 'WITHDRAWN' || enrollment.status === 'GRADUATED') {
        throw new Error('Dossier clos, impossible de valider.');
      }

      const cls = await tx.class.findUnique({ where: { id: parsed.data.classId } });
      if (!cls) throw new Error('Classe introuvable.');
      if (cls.academicYearId !== enrollment.academicYearId) {
        throw new Error('La classe n\'appartient pas à cette année scolaire.');
      }
      if (cls.levelId !== enrollment.levelId) {
        throw new Error('La classe n\'est pas au bon niveau pour ce dossier.');
      }

      // 1) Calcul du rang fratrie pour cette année
      const childRels = await tx.personRelation.findMany({
        where: { childId: enrollment.studentId },
        select: { parentId: true },
      });
      const parentIds = childRels.map((r) => r.parentId);

      let siblingsAlreadyActive = 0;
      if (parentIds.length > 0) {
        const siblingChildren = await tx.personRelation.findMany({
          where: {
            parentId: { in: parentIds },
            childId: { not: enrollment.studentId },
          },
          distinct: ['childId'],
          select: { childId: true },
        });
        const siblingIds = siblingChildren.map((s) => s.childId);
        if (siblingIds.length > 0) {
          siblingsAlreadyActive = await tx.enrollment.count({
            where: {
              studentId: { in: siblingIds },
              academicYearId: enrollment.academicYearId,
              status: 'ACTIVE',
            },
          });
        }
      }

      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      const tenantPct = readSiblingDiscountPct(tenant?.settings);
      const auto = computeSiblingDiscount(siblingsAlreadyActive, tenantPct);
      const finalPct = parsed.data.discountPctOverride ?? auto.pct;

      // 2) Affectation classe — réutilise StudentClass existant si déjà là
      await tx.studentClass.upsert({
        where: {
          studentId_classId: {
            studentId: enrollment.studentId,
            classId: parsed.data.classId,
          },
        },
        update: { unenrolledAt: null },
        create: {
          tenantId,
          studentId: enrollment.studentId,
          classId: parsed.data.classId,
        },
      });

      // 3) Génération des Installments si pas encore fait
      let createdInstallments = 0;
      if (!enrollment.feesGenerated) {
        const fees = await tx.feeScheduleItem.findMany({
          where: {
            academicYearId: enrollment.academicYearId,
            levelId: enrollment.levelId,
          },
        });
        const yearStart = (await tx.academicYear.findUniqueOrThrow({
          where: { id: enrollment.academicYearId },
        })).startDate;

        for (const fee of fees) {
          const baseAmount = Number(fee.totalAmount);
          const discounted = applyDiscount(baseAmount, finalPct);
          const perInstallment = Math.round((discounted / fee.installmentCount) * 100) / 100;

          for (let i = 0; i < fee.installmentCount; i++) {
            const monthIndex = ((fee.firstDueMonth - 1) + i) % 12;
            const yearOffset = Math.floor(((fee.firstDueMonth - 1) + i) / 12);
            const dueDate = new Date(
              Date.UTC(yearStart.getUTCFullYear() + yearOffset, monthIndex, 5),
            );
            await tx.installment.create({
              data: {
                tenantId,
                studentId: enrollment.studentId,
                feeScheduleItemId: fee.id,
                label: `${fee.label} (${i + 1}/${fee.installmentCount})`,
                amount: perInstallment,
                dueDate,
                status: 'PENDING',
              },
            });
            createdInstallments += 1;
          }
        }
      }

      // 4) Mise à jour du dossier
      await tx.enrollment.update({
        where: { id: enrollment.id },
        data: {
          status: 'ACTIVE',
          classId: parsed.data.classId,
          siblingRank: auto.rank,
          discountPct: finalPct > 0 ? finalPct : null,
          discountReason: parsed.data.discountReason ?? null,
          feesGenerated: true,
          validatedAt: new Date(),
          validatedByUserId: session.user.id,
        },
      });

      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'validate',
        entityType: 'Enrollment',
        entityId: enrollment.id,
        after: {
          classId: parsed.data.classId,
          siblingRank: auto.rank,
          discountPct: finalPct,
          createdInstallments,
        },
      });
    });

    revalidatePath('/admin/enrollments');
    revalidatePath(`/admin/enrollments/${parsed.data.enrollmentId}`);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

/**
 * Marque un dossier comme WITHDRAWN : annule les Installments restants
 * (PENDING/PARTIAL → CANCELLED, on garde PAID intact) et marque la fin
 * d'inscription en classe (StudentClass.unenrolledAt = now).
 */
export async function withdrawEnrollmentAction(
  formData: FormData,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requirePermission('tenants.manage');

  const get = input(formData);
  const parsed = enrollmentWithdrawSchema.safeParse({
    enrollmentId: get('enrollmentId'),
    reason: get('reason'),
  });
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: flatten(parsed) };
  }

  const tenantId = session.user.tenantId;

  try {
    await withTenant(tenantId, async (tx) => {
      const enrollment = await tx.enrollment.findUnique({
        where: { id: parsed.data.enrollmentId },
      });
      if (!enrollment) throw new Error('Dossier introuvable.');
      if (enrollment.status === 'WITHDRAWN' || enrollment.status === 'GRADUATED') {
        throw new Error('Dossier déjà clos.');
      }

      // Annule les échéances restantes (préserve PAID, marque le reste CANCELLED)
      const cancelled = await tx.installment.updateMany({
        where: {
          studentId: enrollment.studentId,
          status: { in: ['PENDING', 'PARTIAL'] },
        },
        data: { status: 'CANCELLED' },
      });

      // Désinscrit de la classe
      if (enrollment.classId) {
        await tx.studentClass.updateMany({
          where: {
            studentId: enrollment.studentId,
            classId: enrollment.classId,
            unenrolledAt: null,
          },
          data: { unenrolledAt: new Date() },
        });
      }

      await tx.enrollment.update({
        where: { id: enrollment.id },
        data: {
          status: 'WITHDRAWN',
          withdrawnAt: new Date(),
          withdrawalReason: parsed.data.reason,
        },
      });

      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'withdraw',
        entityType: 'Enrollment',
        entityId: enrollment.id,
        after: { reason: parsed.data.reason, cancelledInstallments: cancelled.count },
      });
    });

    revalidatePath('/admin/enrollments');
    revalidatePath(`/admin/enrollments/${parsed.data.enrollmentId}`);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}
