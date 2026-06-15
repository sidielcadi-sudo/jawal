import 'server-only';
import { randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import { getTranslations } from 'next-intl/server';
import { withTenant } from '@/lib/db';
import { loadDocumentData } from '@/lib/document-data';
import { renderDocumentHTML } from '@/lib/document-html';
import { htmlToPdf } from '@/lib/pdf';
import { ensureParentAccess } from '@/lib/parent-access';
import { safeSendEmail } from '@/lib/email';

type ParentMail = {
  personId: string;
  email: string;
  tempPassword: string | null;
};

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * À l'activation d'une inscription (AFFECTE → ACTIVE), envoie aux parents un
 * e-mail de confirmation avec en pièces jointes : certificat de scolarité,
 * attestation/reçu de paiement (PDF), QR du portail, et les identifiants
 * d'accès (créés si nécessaire). Best-effort : ne lève jamais — les erreurs
 * sont loguées pour ne pas bloquer l'activation.
 */
export async function sendEnrollmentActivationEmails(opts: {
  tenantId: string;
  enrollmentId: string;
}): Promise<void> {
  const { tenantId, enrollmentId } = opts;
  try {
    const ctx = await withTenant(tenantId, async (tx) => {
      const enr = await tx.enrollment.findUnique({
        where: { id: enrollmentId },
        select: {
          studentId: true,
          academicYearId: true,
          academicYear: { select: { label: true } },
          student: { select: { firstName: true, lastName: true } },
        },
      });
      if (!enr) return null;

      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, localeDefault: true, currency: true },
      });
      if (!tenant) return null;

      // Parents rattachés à l'élève (type PARENT).
      const relations = await tx.personRelation.findMany({
        where: { childId: enr.studentId },
        select: {
          parent: { select: { id: true, type: true, contacts: true } },
        },
      });

      const parents: ParentMail[] = [];
      for (const rel of relations) {
        const p = rel.parent;
        if (!p || p.type !== 'PARENT') continue;
        const res = await ensureParentAccess(tx, tenantId, p);
        if (!res.ok) continue; // pas d'email ou rôle parent absent → on saute
        parents.push({ personId: p.id, email: res.email, tempPassword: res.tempPassword });
      }

      // Données des deux documents (année de l'inscription).
      const certificat = await loadDocumentData(tx, {
        studentId: enr.studentId,
        type: 'CERTIFICAT_SCOLARITE',
        yearId: enr.academicYearId,
      });
      const paiement = await loadDocumentData(tx, {
        studentId: enr.studentId,
        type: 'ATTESTATION_PAIEMENT',
        yearId: enr.academicYearId,
      });

      return { enr, tenant, parents, certificat, paiement };
    });

    if (!ctx) return;
    const { enr, tenant, parents, certificat, paiement } = ctx;
    if (parents.length === 0) return;

    const locale = tenant.localeDefault;
    const dir: 'ltr' | 'rtl' = locale === 'ar' ? 'rtl' : 'ltr';
    const t = await getTranslations({ locale, namespace: 'admin.documents' });

    // Génération des PDF (hors transaction : Playwright).
    const attachments: { filename: string; content: Buffer }[] = [];
    if (certificat) {
      const html = renderDocumentHTML(certificat, {
        tenantName: tenant.name,
        locale,
        dir,
        currency: tenant.currency,
        refId: randomUUID().slice(0, 8).toUpperCase(),
        t,
      });
      attachments.push({ filename: 'certificat-scolarite.pdf', content: await htmlToPdf(html) });
    }
    if (paiement) {
      const html = renderDocumentHTML(paiement, {
        tenantName: tenant.name,
        locale,
        dir,
        currency: tenant.currency,
        refId: randomUUID().slice(0, 8).toUpperCase(),
        t,
      });
      attachments.push({ filename: 'recu-paiement.pdf', content: await htmlToPdf(html) });
    }

    const baseUrl = process.env.APP_URL ?? 'http://localhost:3000';
    const portalUrl = `${baseUrl}/${locale}/parent`;
    const qrPng = await QRCode.toBuffer(portalUrl, { width: 220, margin: 1 });

    const studentName = `${enr.student.firstName} ${enr.student.lastName}`;
    const studentFull = `${enr.student.lastName} ${enr.student.firstName}`;
    const year = enr.academicYear.label;

    for (const parent of parents) {
      const credLines: string[] = [
        `Login : <strong>${esc(parent.email)}</strong>`,
      ];
      const credText: string[] = [`Login : ${parent.email}`];
      if (parent.tempPassword) {
        credLines.push(`Mot de passe temporaire : <strong>${esc(parent.tempPassword)}</strong>`);
        credText.push(`Mot de passe temporaire : ${parent.tempPassword}`);
      }
      credLines.push(`Portail : <a href="${esc(portalUrl)}">${esc(portalUrl)}</a>`);
      credText.push(`Portail : ${portalUrl}`);

      const html =
        `<p>Madame, Monsieur,</p>` +
        `<p>L'inscription de <strong>${esc(studentName)}</strong> au sein de notre ` +
        `établissement pour l'année scolaire <strong>${esc(year)}</strong> est désormais validée.</p>` +
        `<p>Vous trouverez en pièces jointes :</p>` +
        `<ul>` +
        `<li>✔️ Certificat de scolarité</li>` +
        `<li>✔️ Reçu de paiement</li>` +
        `<li>✔️ Identifiants d'accès au Portail Parents</li>` +
        `</ul>` +
        `<p>${credLines.join('<br/>')}<br/>` +
        `<img src="cid:portal-qr" alt="QR portail" width="160" height="160" /></p>` +
        `<p>Nous vous souhaitons la bienvenue au sein de notre établissement.</p>` +
        `<p>Cordialement,<br/>Le secrétariat</p>`;

      const text =
        `Madame, Monsieur,\n\n` +
        `L'inscription de ${studentName} au sein de notre établissement pour l'année ` +
        `scolaire ${year} est désormais validée.\n\n` +
        `Pièces jointes : Certificat de scolarité, Reçu de paiement.\n\n` +
        `Identifiants d'accès au Portail Parents :\n${credText.join('\n')}\n\n` +
        `Nous vous souhaitons la bienvenue au sein de notre établissement.\n` +
        `Cordialement, Le secrétariat`;

      await safeSendEmail({
        to: parent.email,
        subject: `Confirmation d'inscription – ${studentFull}`,
        html,
        text,
        attachments: [
          ...attachments,
          { filename: 'qr-portail.png', content: qrPng, cid: 'portal-qr' },
        ],
      });
    }
  } catch (e) {
    console.error('[activation-email] échec', e);
  }
}
