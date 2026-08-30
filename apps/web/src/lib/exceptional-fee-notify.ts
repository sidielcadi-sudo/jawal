import 'server-only';
import { withTenant } from '@/lib/db';
import { safeSendEmail } from '@/lib/email';

/**
 * Prévient les parents concernés qu'un frais exceptionnel vient d'être publié.
 *
 * Le message porte les trois informations qui déclenchent une décision ou un
 * paiement : le libellé de la sortie, la date de l'activité et la date limite
 * de paiement.
 *
 * Best-effort, comme les autres notifications : un envoi qui échoue ne doit pas
 * faire échouer la publication, qui est déjà enregistrée en base.
 */
export async function notifyExceptionalFeePublished(
  tenantId: string,
  feeId: string,
): Promise<void> {
  const data = await withTenant(tenantId, async (tx) => {
    const fee = await tx.exceptionalFee.findUnique({
      where: { id: feeId },
      include: {
        assignments: {
          include: {
            student: {
              select: {
                firstName: true,
                lastName: true,
                contacts: true,
                relationsAsChild: {
                  select: { parent: { select: { firstName: true, lastName: true, contacts: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!fee) return null;
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, currency: true },
    });
    return { fee, tenant };
  });
  if (!data) return;

  const { fee, tenant } = data;
  const tenantName = tenant?.name ?? 'Jawal';
  const currency = tenant?.currency ?? 'MAD';
  const fmtDate = (d: Date | null) => (d ? d.toLocaleDateString('fr-FR') : null);
  const activityDate = fmtDate(fee.activityDate);
  const dueDate = fmtDate(fee.dueDate);
  const amount = `${Number(fee.amount).toLocaleString('fr-FR')} ${currency}`;

  // Un parent peut avoir plusieurs enfants concernés : on regroupe par adresse
  // pour n'envoyer qu'un message par destinataire, listant les enfants.
  const byEmail = new Map<string, string[]>();
  for (const a of fee.assignments) {
    const childName = `${a.student.firstName} ${a.student.lastName}`;
    const emails = new Set<string>();
    const own = (a.student.contacts ?? {}) as { email?: string };
    if (own.email) emails.add(own.email);
    for (const rel of a.student.relationsAsChild) {
      const c = (rel.parent.contacts ?? {}) as { email?: string };
      if (c.email) emails.add(c.email);
    }
    for (const e of emails) {
      const list = byEmail.get(e) ?? [];
      if (!list.includes(childName)) list.push(childName);
      byEmail.set(e, list);
    }
  }
  if (byEmail.size === 0) return;

  const lines = [
    activityDate ? `<li>Date de la sortie : <strong>${activityDate}</strong></li>` : '',
    dueDate ? `<li>Date limite de paiement : <strong>${dueDate}</strong></li>` : '',
    `<li>Montant : <strong>${amount}</strong></li>`,
  ]
    .filter(Boolean)
    .join('');

  const consent = fee.mandatory
    ? '<p>Cette sortie est obligatoire : le montant a été ajouté à votre échéancier.</p>'
    : '<p>Cette sortie est facultative : merci d’indiquer votre accord depuis votre espace parent.</p>';

  await Promise.all(
    [...byEmail].map(([email, children]) =>
      safeSendEmail({
        to: email,
        subject: `[${tenantName}] ${fee.label}${dueDate ? ` — à régler avant le ${dueDate}` : ''}`,
        html: `
          <p>Bonjour,</p>
          <p>Nous vous informons de la sortie <strong>${fee.label}</strong>
          concernant ${children.length > 1 ? 'vos enfants' : 'votre enfant'} :
          <strong>${children.join(', ')}</strong>.</p>
          ${fee.description ? `<p>${fee.description}</p>` : ''}
          <ul>${lines}</ul>
          ${consent}
          <p>Cordialement,<br/>${tenantName}</p>
          <hr/>
          <p style="font-size:11px;color:#888">Notification automatique — ne pas répondre à cet email.</p>
        `,
        text:
          `${fee.label} — ${children.join(', ')}. ` +
          (activityDate ? `Sortie le ${activityDate}. ` : '') +
          (dueDate ? `À régler avant le ${dueDate}. ` : '') +
          `Montant : ${amount}.`,
      }),
    ),
  );
}
