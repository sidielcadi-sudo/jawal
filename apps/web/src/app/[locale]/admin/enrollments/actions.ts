'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  bulkReenrollSchema,
  enrollmentCreateSchema,
  enrollmentValidateSchema,
  enrollmentWithdrawSchema,
} from '@jawal/shared';
import { auth } from '@/lib/auth';
import { requirePermission } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant, type Prisma } from '@/lib/db';
import {
  applyDiscount,
  computeSiblingDiscount,
  readSiblingDiscountPct,
} from '@/lib/enrollment-discount';
import { applicableAnnualFees, buildInstallments, type FeeCategory } from '@/lib/fees';

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

/**
 * Génère l'échéancier d'un élève réinscrit, pour les seules catégories de
 * frais cochées dans le lot.
 *
 * La réduction fratrie est calculée ici plutôt que laissée à l'agent : sur
 * plusieurs centaines de dossiers, l'appliquer à la main est la garantie de
 * l'oublier. Le rang se lit sur les dossiers **déjà créés** pour l'année
 * cible dans la même famille — d'où l'importance de l'ordre de traitement :
 * le premier enfant rencontré est l'aîné, les suivants sont des cadets.
 *
 * Cantine et transport ne sont posés que si l'élève est concerné (régime,
 * transport scolaire), même s'ils sont cochés : cocher « Cantine » veut dire
 * « génère la cantine à ceux qui en ont une », pas « facture tout le monde ».
 */
async function generateBulkInstallments(
  tx: Prisma.TransactionClient,
  opts: {
    tenantId: string;
    enrollmentId: string;
    studentId: string;
    academicYearId: string;
    levelId: string;
    categories: FeeCategory[];
    siblingPct: number;
  },
): Promise<{ feeCount: number; pct: number }> {
  const fees = await tx.feeScheduleItem.findMany({
    where: {
      academicYearId: opts.academicYearId,
      levelId: opts.levelId,
      kind: 'ANNUAL',
      category: { in: opts.categories },
    },
  });
  if (fees.length === 0) return { feeCount: 0, pct: 0 };

  const student = await tx.person.findUnique({
    where: { id: opts.studentId },
    select: { regime: true, usesTransport: true },
  });
  const applicable = applicableAnnualFees(
    fees.map((f) => ({ ...f, category: f.category as FeeCategory })),
    { usesTransport: student?.usesTransport ?? false, regime: student?.regime ?? null },
  );
  if (applicable.length === 0) return { feeCount: 0, pct: 0 };

  // Rang dans la fratrie : nombre de frères/sœurs déjà inscrits sur l'année.
  const rels = await tx.personRelation.findMany({
    where: { childId: opts.studentId },
    select: { parentId: true },
  });
  let siblingsEnrolled = 0;
  if (rels.length > 0) {
    const sibs = await tx.personRelation.findMany({
      where: { parentId: { in: rels.map((r) => r.parentId) }, childId: { not: opts.studentId } },
      distinct: ['childId'],
      select: { childId: true },
    });
    if (sibs.length > 0) {
      siblingsEnrolled = await tx.enrollment.count({
        where: {
          studentId: { in: sibs.map((s) => s.childId) },
          academicYearId: opts.academicYearId,
          status: { in: ['ACTIVE', 'AFFECTE', 'INSCRIPTION_VALIDEE', 'ACCEPTE'] },
        },
      });
    }
  }
  const { rank, pct } = computeSiblingDiscount(siblingsEnrolled, opts.siblingPct);

  const yearStart = (
    await tx.academicYear.findUniqueOrThrow({ where: { id: opts.academicYearId } })
  ).startDate;

  for (const fee of applicable) {
    const drafts = buildInstallments(
      {
        id: fee.id,
        label: fee.label,
        category: fee.category as FeeCategory,
        totalAmount: Number(fee.totalAmount),
        installmentCount: fee.installmentCount,
        installmentLocked: fee.installmentLocked,
        firstDueMonth: fee.firstDueMonth,
      },
      { pct, count: fee.installmentCount, yearStart },
    );
    for (const d of drafts) {
      await tx.installment.create({
        data: {
          tenantId: opts.tenantId,
          studentId: opts.studentId,
          feeScheduleItemId: d.feeScheduleItemId,
          label: d.label,
          amount: d.amount,
          dueDate: d.dueDate,
          status: 'PENDING',
        },
      });
    }
  }

  await tx.enrollment.update({
    where: { id: opts.enrollmentId },
    data: {
      feesGenerated: true,
      siblingRank: rank,
      discountPct: pct > 0 ? pct : null,
      discountReason: pct > 0 ? `Fratrie (rang ${rank}) −${pct}%` : null,
    },
  });

  return { feeCount: applicable.length, pct };
}

/**
 * Réinscription en lot d'une année source vers une année cible.
 *
 * Pour chaque item :
 *  - REENROLL → crée un Enrollment (student × targetYear × targetLevel)
 *  - REPEAT → même niveau que la source
 *  - GRADUATE → marque la source enrollment GRADUATED
 *  - SKIP → no-op
 *
 * Idempotent : si un dossier (student × targetYear) existe déjà, on saute
 * et on incrémente skipped.
 *
 * Sans catégorie de frais cochée, la création reste en DRAFT et l'échéancier
 * se fait dossier par dossier. Avec, le lot génère l'échéancier (réduction
 * fratrie comprise) et passe les dossiers en « Inscription validée » ;
 * l'affectation de classe et les pièces restent manuelles.
 */
export async function bulkReenrollAction(
  formData: FormData,
): Promise<
  Result<{
    created: number;
    graduated: number;
    skipped: number;
    feesGenerated: number;
    errors: string[];
  }>
> {
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

  const parsed = bulkReenrollSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: flatten(parsed) };
  }

  if (parsed.data.sourceYearId === parsed.data.targetYearId) {
    return { ok: false, error: 'L\'année cible doit être différente de l\'année source.' };
  }

  const tenantId = session.user.tenantId;
  const errors: string[] = [];
  let created = 0;
  let graduated = 0;
  let skipped = 0;
  let feesGenerated = 0;
  const withFees = parsed.data.feeCategories.length > 0;
  // Statut porté par le lot : « En attente » ouvre un dossier à instruire,
  // « Inscription validée » réinscrit d'office.
  const targetStatus = parsed.data.targetStatus;
  const decided = targetStatus === 'INSCRIPTION_VALIDEE';

  try {
    await withTenant(tenantId, async (tx) => {
      // Réduction fratrie du tenant : appliquée aux cadets de chaque famille.
      const tenant = await tx.tenant.findFirst({ select: { settings: true } });
      const siblingPct = readSiblingDiscountPct(tenant?.settings);

      const sourceIds = parsed.data.items.map((i) => i.sourceEnrollmentId);
      const sources = await tx.enrollment.findMany({
        where: { id: { in: sourceIds }, academicYearId: parsed.data.sourceYearId },
        select: { id: true, studentId: true, levelId: true, status: true },
      });
      const byId = new Map(sources.map((s) => [s.id, s]));

      for (const item of parsed.data.items) {
        const src = byId.get(item.sourceEnrollmentId);
        if (!src) {
          errors.push(`Dossier source introuvable : ${item.sourceEnrollmentId.slice(0, 8)}…`);
          continue;
        }

        if (item.decision === 'SKIP') {
          skipped += 1;
          continue;
        }

        if (item.decision === 'GRADUATE') {
          if (src.status !== 'GRADUATED') {
            await tx.enrollment.update({
              where: { id: src.id },
              data: { status: 'GRADUATED' },
            });
          }
          graduated += 1;
          continue;
        }

        const targetLevelId =
          item.decision === 'REPEAT' ? src.levelId : item.targetLevelId ?? null;
        if (!targetLevelId) {
          errors.push(`Niveau cible manquant pour ${src.id.slice(0, 8)}…`);
          continue;
        }

        const existing = await tx.enrollment.findUnique({
          where: {
            studentId_academicYearId: {
              studentId: src.studentId,
              academicYearId: parsed.data.targetYearId,
            },
          },
        });
        if (existing) {
          skipped += 1;
          continue;
        }

        // Le statut vient du choix de l'agent, pas de la génération d'échéancier :
        // on peut vouloir un échéancier sur un dossier encore à instruire, ou
        // l'inverse. Le reste (affectation de classe, pièces) se traite ensuite.
        const enrollment = await tx.enrollment.create({
          data: {
            tenantId,
            studentId: src.studentId,
            academicYearId: parsed.data.targetYearId,
            levelId: targetLevelId,
            status: targetStatus,
            decidedAt: decided ? new Date() : null,
            decidedByUserId: decided ? session.user.id : null,
            notes:
              item.decision === 'REPEAT'
                ? 'Redoublement — créé par réinscription en lot'
                : 'Réinscription en lot',
            createdByUserId: session.user.id,
          },
        });
        created += 1;

        if (withFees) {
          try {
            const gen = await generateBulkInstallments(tx, {
              tenantId,
              enrollmentId: enrollment.id,
              studentId: src.studentId,
              academicYearId: parsed.data.targetYearId,
              levelId: targetLevelId,
              categories: parsed.data.feeCategories,
              siblingPct,
            });
            feesGenerated += gen.feeCount;
          } catch (e) {
            errors.push(
              `Échéancier non généré (${src.id.slice(0, 8)}…) : ${
                e instanceof Error ? e.message : 'erreur'
              }`,
            );
          }
        }
      }

      await logAudit(tx, {
        tenantId,
        userId: session.user.id,
        action: 'bulkReenroll',
        entityType: 'Enrollment',
        entityId: parsed.data.targetYearId,
        after: {
          sourceYearId: parsed.data.sourceYearId,
          targetYearId: parsed.data.targetYearId,
          itemsTotal: parsed.data.items.length,
          created,
          graduated,
          skipped,
          targetStatus,
          feeCategories: parsed.data.feeCategories,
          feesGenerated,
          errorsCount: errors.length,
        },
      });
    });

    revalidatePath('/admin/enrollments');
    return { ok: true, data: { created, graduated, skipped, feesGenerated, errors } };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}
