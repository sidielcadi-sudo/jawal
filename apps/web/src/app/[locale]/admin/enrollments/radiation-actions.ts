'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requireRoleCode } from '@/lib/auth/rbac';
import { logAudit } from '@/lib/audit';
import { withTenant } from '@/lib/db';
import { alertRole } from '@/lib/staff-alerts';
import { loadRefundItems, paidSum, computeRefund, refundableMap } from '@/lib/refund';
import { postDebtWaiver } from '@/lib/accounting-hooks';
import { safeSendEmail } from '@/lib/email';
import { htmlToPdf } from '@/lib/pdf';
import { pdfFilename } from '@/lib/pdf-filename';
import { renderRadiationCertificate } from '@/lib/radiation-certificate-html';
import type { Prisma } from '@jawal/db';

type Result = { ok: true } | { ok: false; error: string };
const TYPES = ['TRANSFERT', 'DEPART', 'AUTRE'] as const;

/** Rôles responsables de chaque étape. `tenant_admin` peut tout valider. */
const ROLE_VIE_SCOLAIRE = ['cpe', 'tenant_admin'];
const ROLE_COMPTA = ['comptable', 'tenant_admin'];
const ROLE_DIRECTION = ['direction', 'tenant_admin'];

const L = (locale: string, fr: string, ar: string) => (locale === 'ar' ? ar : fr);

function revalidate(enrollmentId: string) {
  revalidatePath(`/admin/enrollments/${enrollmentId}`);
}

/**
 * Envoie un e-mail aux parents/tuteurs d'un élève et journalise chaque envoi
 * (NotificationLog, canal EMAIL). Best-effort : n'interrompt jamais l'opération.
 */
async function notifyParentsByEmail(
  tenantId: string,
  studentId: string,
  relatedId: string,
  template: string,
  subject: string,
  bodyText: string,
  attachments?: { filename: string; content: Buffer }[],
) {
  try {
    const rels = await withTenant(tenantId, (tx) =>
      tx.personRelation.findMany({
        where: { childId: studentId },
        include: { parent: { select: { firstName: true, lastName: true, contacts: true } } },
      }),
    );
    const bodyHtml = `<p>${bodyText.replace(/\n/g, '<br>')}</p>`;
    const notifs: Array<{ recipient: string; recipientName: string; status: 'SENT' | 'FAILED' | 'SKIPPED' }> = [];
    for (const r of rels) {
      const email = ((r.parent.contacts ?? {}) as { email?: string }).email?.trim();
      const recipientName = `${r.parent.lastName} ${r.parent.firstName}`;
      if (!email) {
        notifs.push({ recipient: '', recipientName, status: 'SKIPPED' });
        continue;
      }
      const res = await safeSendEmail({ to: email, subject, html: bodyHtml, text: bodyText, attachments });
      notifs.push({ recipient: email, recipientName, status: res.ok ? 'SENT' : 'FAILED' });
    }
    if (notifs.length > 0) {
      await withTenant(tenantId, async (tx) => {
        for (const n of notifs) {
          await tx.notificationLog.create({
            data: {
              tenantId,
              channel: 'EMAIL',
              recipient: n.recipient,
              recipientName: n.recipientName,
              studentId,
              template,
              body: bodyText,
              status: n.status,
              sentAt: n.status === 'SENT' ? new Date() : null,
              relatedType: 'RadiationRequest',
              relatedId,
            },
          });
        }
      });
    }
  } catch (e) {
    console.error('[radiation] notification parents échouée', e);
  }
}

async function tenantLocale(tx: Prisma.TransactionClient): Promise<string> {
  const t = await tx.tenant.findFirst({ select: { localeDefault: true } });
  return t?.localeDefault ?? 'fr';
}

/** Demande de radiation/transfert (administration ou Vie scolaire pour le parent). */
export async function requestRadiationAction(input: {
  enrollmentId: string;
  type: string;
  reason?: string;
  destinationSchool?: string;
  noteRequested?: boolean;
}): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requireRoleCode(['cpe', 'scolarite', 'direction', 'tenant_admin']);
  const type = (TYPES.includes(input.type as (typeof TYPES)[number]) ? input.type : 'TRANSFERT') as (typeof TYPES)[number];
  const tenantId = session.user.tenantId;
  try {
    await withTenant(tenantId, async (tx) => {
      const enr = await tx.enrollment.findUnique({
        where: { id: input.enrollmentId },
        select: { studentId: true, status: true, archivedAt: true, student: { select: { firstName: true, lastName: true } } },
      });
      if (!enr) throw new Error('Dossier introuvable.');
      if (enr.archivedAt) throw new Error('Dossier archivé (Historique), non modifiable.');
      if (!['ACTIVE', 'AFFECTE', 'INSCRIPTION_VALIDEE'].includes(enr.status)) throw new Error('Radiation possible seulement sur un dossier inscrit/actif.');
      const open = await tx.radiationRequest.count({ where: { enrollmentId: input.enrollmentId, status: { notIn: ['REJECTED', 'APPROVED'] } } });
      if (open > 0) throw new Error('Une demande de radiation est déjà en cours.');
      const r = await tx.radiationRequest.create({
        data: {
          tenantId,
          enrollmentId: input.enrollmentId,
          studentId: enr.studentId,
          type,
          reason: input.reason?.trim() || null,
          destinationSchool: input.destinationSchool?.trim() || null,
          noteRequested: !!input.noteRequested,
          requestedByUserId: session.user.id,
        },
      });
      await logAudit(tx, { tenantId, userId: session.user.id, action: 'request_radiation', entityType: 'RadiationRequest', entityId: r.id });
      const loc = await tenantLocale(tx);
      const name = `${enr.student.lastName} ${enr.student.firstName}`;
      await alertRole(tx, tenantId, ROLE_VIE_SCOLAIRE, {
        type: 'RADIATION_STEP',
        title: L(loc, 'Nouvelle demande de radiation', 'طلب شطب جديد'),
        body: L(loc, `${name} — à vérifier par la Vie scolaire.`, `${name} — للتحقق من طرف الحياة المدرسية.`),
        link: `enrollments/${input.enrollmentId}`,
        relatedType: 'RadiationRequest',
        relatedId: r.id,
      });
    });
    revalidate(input.enrollmentId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

type ReqRow = {
  status: string;
  enrollmentId: string;
  studentId: string;
  student: { firstName: string; lastName: string };
};

async function advance(
  id: string,
  roles: string[],
  expected: string,
  apply: (tx: Prisma.TransactionClient, tenantId: string, userId: string, req: ReqRow, loc: string, name: string) => Promise<void>,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requireRoleCode(roles);
  const tenantId = session.user.tenantId;
  try {
    let enrollmentId = '';
    await withTenant(tenantId, async (tx) => {
      const req = await tx.radiationRequest.findUnique({
        where: { id },
        select: { status: true, enrollmentId: true, studentId: true, student: { select: { firstName: true, lastName: true } } },
      });
      if (!req) throw new Error('Demande introuvable.');
      if (req.status !== expected) throw new Error('Étape invalide.');
      enrollmentId = req.enrollmentId;
      const loc = await tenantLocale(tx);
      await apply(tx, tenantId, session.user.id, req, loc, `${req.student.lastName} ${req.student.firstName}`);
    });
    revalidate(enrollmentId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Vie scolaire : situation vérifiée. Déclenche la vérification remboursement si départ en cours d'année. */
export async function validateVieScolaireAction(id: string, comment?: string): Promise<Result> {
  return advance(id, ROLE_VIE_SCOLAIRE, 'REQUESTED', async (tx, tenantId, userId, req, loc, name) => {
    await tx.radiationRequest.update({
      where: { id },
      data: { status: 'VIE_SCOLAIRE_OK', vieScolaireByUserId: userId, vieScolaireAt: new Date(), vieScolaireComment: comment?.trim() || null },
    });
    await logAudit(tx, { tenantId, userId, action: 'radiation_viescolaire', entityType: 'RadiationRequest', entityId: id });

    // Remboursement : départ en cours d'année avec des frais payés → dossier compta.
    const enr = await tx.enrollment.findUnique({
      where: { id: req.enrollmentId },
      select: { academicYearId: true, academicYear: { select: { startDate: true, endDate: true } } },
    });
    let midYearRefund = false;
    if (enr && new Date() < enr.academicYear.endDate) {
      const items = await loadRefundItems(tx, req.studentId, enr.academicYearId);
      if (paidSum(items) > 0) {
        midYearRefund = true;
        // Pré-calcul par défaut (base « par échéance ») pour que le tableau
        // s'affiche d'emblée côté comptable, sans avoir à cliquer « Recalculer ».
        const tenant = await tx.tenant.findFirst({ select: { settings: true } });
        const comp = computeRefund(items, {
          basis: 'INSTALLMENT',
          refundable: refundableMap(tenant?.settings),
          now: new Date(),
          yearStart: enr.academicYear.startDate,
          yearEnd: enr.academicYear.endDate,
        });
        await tx.radiationRefund.upsert({
          where: { radiationRequestId: id },
          create: {
            tenantId,
            radiationRequestId: id,
            studentId: req.studentId,
            status: 'PENDING_CHECK',
            basis: 'INSTALLMENT',
            paidTotal: comp.paidTotal,
            consumedTotal: comp.consumedTotal,
            computedAmount: comp.computedAmount,
            breakdown: comp.lines,
          },
          update: {},
        });
      }
    }

    await alertRole(tx, tenantId, ROLE_COMPTA, {
      type: midYearRefund ? 'REFUND_CHECK' : 'RADIATION_STEP',
      title: midYearRefund
        ? L(loc, 'Remboursement à vérifier', 'استرجاع للتحقق')
        : L(loc, 'Radiation à vérifier (comptabilité)', 'شطب للتحقق (المحاسبة)'),
      body: midYearRefund
        ? L(loc, `${name} — élève radié en milieu d'année, vérifier remboursement.`, `${name} — تلميذ مشطوب في منتصف السنة، تحقق من الاسترجاع.`)
        : L(loc, `${name} — vérifier la situation financière.`, `${name} — تحقق من الوضعية المالية.`),
      link: `enrollments/${req.enrollmentId}`,
      relatedType: 'RadiationRequest',
      relatedId: id,
    });
  });
}

/** Comptabilité : valide les paiements (calcule s'il reste des dettes). */
export async function validateComptaAction(id: string, comment?: string): Promise<Result> {
  return advance(id, ROLE_COMPTA, 'VIE_SCOLAIRE_OK', async (tx, tenantId, userId, req, loc, name) => {
    const unpaid = await tx.installment.findMany({ where: { studentId: req.studentId, status: { in: ['PENDING', 'PARTIAL'] } }, include: { payments: { select: { amount: true } } } });
    const due = unpaid.reduce((s, i) => s + Math.max(0, Number(i.amount) - i.payments.reduce((x, p) => x + Number(p.amount), 0)), 0);
    await tx.radiationRequest.update({
      where: { id },
      data: { status: 'COMPTA_OK', comptaByUserId: userId, comptaAt: new Date(), comptaComment: comment?.trim() || null, debtCleared: due <= 0.01 },
    });
    await logAudit(tx, { tenantId, userId, action: 'radiation_compta', entityType: 'RadiationRequest', entityId: id, after: { debtCleared: due <= 0.01 } });
    await alertRole(tx, tenantId, ROLE_DIRECTION, {
      type: 'RADIATION_STEP',
      title: L(loc, 'Radiation à valider (direction)', 'شطب للمصادقة (الإدارة)'),
      body: L(loc, `${name} — validation finale requise.`, `${name} — المصادقة النهائية مطلوبة.`),
      link: `enrollments/${req.enrollmentId}`,
      relatedType: 'RadiationRequest',
      relatedId: id,
    });
  });
}

/**
 * Direction : valide la radiation → élève transféré, échéances annulées,
 * documents générés, dossier archivé, **espace élève fermé** (comptes désactivés)
 * et **mail envoyé aux parents** avec le certificat de radiation en pièce jointe.
 */
export async function approveRadiationAction(id: string, comment?: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requireRoleCode(ROLE_DIRECTION);
  const tenantId = session.user.tenantId;

  try {
    // 1. Transaction : valider, annuler échéances, retirer/archiver, fermer l'espace
    //    élève, et collecter les données nécessaires au mail (hors tx).
    const ctx = await withTenant(tenantId, async (tx) => {
      const req = await tx.radiationRequest.findUnique({
        where: { id },
        select: {
          status: true,
          enrollmentId: true,
          studentId: true,
          type: true,
          destinationSchool: true,
          debtCleared: true,
          student: { select: { firstName: true, lastName: true, birthDate: true, cin: true } },
        },
      });
      if (!req) throw new Error('Demande introuvable.');
      if (req.status !== 'COMPTA_OK') throw new Error('Étape invalide.');

      const now = new Date();
      await tx.radiationRequest.update({
        where: { id },
        data: { status: 'APPROVED', directionByUserId: session.user.id, directionComment: comment?.trim() || null, approvedAt: now, docsGeneratedAt: now },
      });
      // Échéances impayées annulées. Les **échues** (période déjà fréquentée)
      // sont un vrai reste dû → **abandon de créance** tracé (waived*) +
      // comptabilisé (remise OD), donc visible dans « Créances annulées ». Les
      // échéances futures (service non rendu) sont simplement annulées.
      const loc = await tenantLocale(tx);
      const waiveReason = L(loc, 'Abandon de créance — radiation', 'التنازل عن الدين — الشطب');
      const unpaid = await tx.installment.findMany({
        where: { studentId: req.studentId, status: { in: ['PENDING', 'PARTIAL'] } },
        include: { payments: { select: { amount: true } } },
      });
      for (const inst of unpaid) {
        const paid = inst.payments.reduce((s, p) => s + Number(p.amount), 0);
        const remaining = Math.round((Number(inst.amount) - paid) * 100) / 100;
        if (remaining > 0 && inst.dueDate.getTime() <= now.getTime()) {
          await tx.installment.update({
            where: { id: inst.id },
            data: { status: 'CANCELLED', waivedAmount: remaining, waivedReason: waiveReason, waivedByUserId: session.user.id, waivedAt: now },
          });
          // Radiation = non-recouvrement → créance irrécouvrable (CGNC 6585).
          await postDebtWaiver(tx, tenantId, { id: inst.id, label: inst.label }, remaining, now, session.user.id, 'IRRECOUVRABLE');
        } else {
          await tx.installment.update({ where: { id: inst.id }, data: { status: 'CANCELLED' } });
        }
      }

      const enr = await tx.enrollment.findUnique({
        where: { id: req.enrollmentId },
        select: { level: { select: { label: true } }, academicYear: { select: { label: true } } },
      });
      await tx.enrollment.update({
        where: { id: req.enrollmentId },
        data: { status: 'WITHDRAWN', withdrawnAt: now, withdrawalReason: 'Radiation / transfert', archivedAt: now },
      });

      // L'élève quitte l'établissement : on ferme ses affectations de classe
      // encore ouvertes. Sans cela il resterait listé partout où l'on filtre
      // sur `studentClass.unenrolledAt` (appel, carnet, notes…).
      await tx.studentClass.updateMany({
        where: { studentId: req.studentId, unenrolledAt: null },
        data: { unenrolledAt: now },
      });

      // Fermeture de l'espace de l'élève : désactiver les comptes utilisateurs liés.
      const studentUsers = await tx.userPerson.findMany({ where: { personId: req.studentId }, select: { userId: true } });
      if (studentUsers.length > 0) {
        await tx.user.updateMany({ where: { id: { in: studentUsers.map((u) => u.userId) } }, data: { disabledAt: now } });
      }

      // Parents/tuteurs destinataires du mail.
      const rels = await tx.personRelation.findMany({
        where: { childId: req.studentId },
        include: { parent: { select: { firstName: true, lastName: true, contacts: true } } },
      });

      const tenant = await tx.tenant.findFirst({ select: { name: true } });
      await logAudit(tx, { tenantId, userId: session.user.id, action: 'radiation_approved', entityType: 'RadiationRequest', entityId: id });

      return { req, enr, rels, tenant, loc, approvedAt: now };
    });

    revalidate(ctx.req.enrollmentId);

    // 2. Hors transaction : génération du certificat PDF + envoi des mails parents.
    const tenantName = ctx.tenant?.name ?? 'Établissement';
    const name = `${ctx.req.student.lastName} ${ctx.req.student.firstName}`;
    let pdf: Buffer | null = null;
    try {
      const html = renderRadiationCertificate({
        tenantName,
        type: ctx.req.type,
        destinationSchool: ctx.req.destinationSchool,
        approvedAt: ctx.approvedAt,
        debtCleared: ctx.req.debtCleared,
        student: ctx.req.student,
        levelLabel: ctx.enr?.level.label ?? '',
        yearLabel: ctx.enr?.academicYear.label ?? '',
      });
      pdf = await htmlToPdf(html);
    } catch (e) {
      console.error('[radiation] génération certificat échouée', e);
    }

    const subject = L(ctx.loc, `Radiation de ${name} — ${tenantName}`, `شطب ${name} — ${tenantName}`);
    const bodyText = L(
      ctx.loc,
      `Madame, Monsieur,\n\nNous vous informons que la radiation de ${name} a été prononcée et que son dossier scolaire est désormais clôturé. L'accès à son espace en ligne a été fermé.\n\nVous trouverez ci-joint le certificat de radiation.\n\nPour toute question, rapprochez-vous de l'établissement.\n\n${tenantName}`,
      `السيدة، السيد،\n\nنعلمكم بأنه تم شطب ${name} وأن ملفه المدرسي أصبح مغلقاً. تم إغلاق الولوج إلى فضائه الرقمي.\n\nتجدون رفقته شهادة الشطب.\n\nلأي استفسار، يرجى الاتصال بالمؤسسة.\n\n${tenantName}`,
    );
    const bodyHtml = `<p>${bodyText.replace(/\n/g, '<br>')}</p>`;
    const attachments = pdf
      ? [{ filename: `${pdfFilename(`certificat-radiation-${ctx.req.student.lastName}`)}.pdf`, content: pdf }]
      : undefined;

    const notifs: Array<{ recipient: string; recipientName: string; status: 'SENT' | 'FAILED' | 'SKIPPED' }> = [];
    for (const r of ctx.rels) {
      const email = ((r.parent.contacts ?? {}) as { email?: string }).email?.trim();
      const recipientName = `${r.parent.lastName} ${r.parent.firstName}`;
      if (!email) {
        notifs.push({ recipient: '', recipientName, status: 'SKIPPED' });
        continue;
      }
      const res = await safeSendEmail({ to: email, subject, html: bodyHtml, text: bodyText, attachments });
      notifs.push({ recipient: email, recipientName, status: res.ok ? 'SENT' : 'FAILED' });
    }

    // 3. Traçabilité : journaliser les envois (NotificationLog).
    if (notifs.length > 0) {
      await withTenant(tenantId, async (tx) => {
        for (const n of notifs) {
          await tx.notificationLog.create({
            data: {
              tenantId,
              channel: 'EMAIL',
              recipient: n.recipient,
              recipientName: n.recipientName,
              studentId: ctx.req.studentId,
              template: 'radiation_approved',
              body: bodyText,
              status: n.status,
              sentAt: n.status === 'SENT' ? new Date() : null,
              relatedType: 'RadiationRequest',
              relatedId: id,
            },
          });
        }
      });
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}

export async function rejectRadiationAction(id: string, reason: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Non authentifié' };
  await requireRoleCode(ROLE_DIRECTION);
  const tenantId = session.user.tenantId;
  const motif = reason?.trim() || null;
  try {
    let enrollmentId = '';
    const ctx = await withTenant(tenantId, async (tx) => {
      const req = await tx.radiationRequest.findUnique({
        where: { id },
        select: { status: true, enrollmentId: true, studentId: true, student: { select: { firstName: true, lastName: true } } },
      });
      if (!req) throw new Error('Introuvable.');
      if (req.status === 'APPROVED' || req.status === 'REJECTED') throw new Error('Demande déjà clôturée.');
      enrollmentId = req.enrollmentId;
      await tx.radiationRequest.update({ where: { id }, data: { status: 'REJECTED', rejectionReason: motif } });
      const tenant = await tx.tenant.findFirst({ select: { name: true } });
      const loc = await tenantLocale(tx);
      return { studentId: req.studentId, name: `${req.student.lastName} ${req.student.firstName}`, tenantName: tenant?.name ?? 'Établissement', loc };
    });
    revalidate(enrollmentId);

    // Notifier les parents du refus, avec le motif.
    const subject = L(ctx.loc, `Demande de radiation refusée — ${ctx.name}`, `طلب الشطب مرفوض — ${ctx.name}`);
    const bodyText = L(
      ctx.loc,
      `Madame, Monsieur,\n\nVotre demande de radiation/transfert concernant ${ctx.name} a été examinée et n'a pas été acceptée.\n\nMotif : ${motif ?? 'non précisé'}\n\nL'élève reste inscrit. Pour toute question, rapprochez-vous de l'établissement.\n\n${ctx.tenantName}`,
      `السيدة، السيد،\n\nتمت دراسة طلب الشطب/التحويل الخاص بـ ${ctx.name} ولم تتم الموافقة عليه.\n\nالسبب: ${motif ?? 'غير محدد'}\n\nيبقى التلميذ مسجلاً. لأي استفسار، يرجى الاتصال بالمؤسسة.\n\n${ctx.tenantName}`,
    );
    await notifyParentsByEmail(tenantId, ctx.studentId, id, 'radiation_rejected', subject, bodyText);

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur' };
  }
}
