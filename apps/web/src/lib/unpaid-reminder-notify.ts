import 'server-only';
import { withTenant } from '@/lib/db';
import { safeSendEmail } from '@/lib/email';

/**
 * Envoie aux parents la relance d'impayé saisie depuis Finances › Gestion des
 * impayés.
 *
 * L'écran ne faisait qu'enregistrer la relance dans `PaymentReminder` : rien ne
 * partait aux familles. Le message reprend la note rédigée par l'établissement
 * et y joint le détail des échéances non soldées, pour que le parent sache sur
 * quoi porte la demande.
 *
 * Best-effort, comme les autres notifications : un envoi qui échoue ne doit pas
 * annuler la relance déjà enregistrée.
 */
export async function notifyPaymentReminder(
  tenantId: string,
  studentId: string,
  note: string,
): Promise<{ recipients: number }> {
  const data = await withTenant(tenantId, async (tx) => {
    const student = await tx.person.findUnique({
      where: { id: studentId },
      select: {
        firstName: true,
        lastName: true,
        contacts: true,
        relationsAsChild: { select: { parent: { select: { contacts: true } } } },
      },
    });
    if (!student) return null;

    const installments = await tx.installment.findMany({
      where: { studentId, status: { not: 'CANCELLED' } },
      include: { payments: { select: { amount: true } } },
      orderBy: { dueDate: 'asc' },
    });
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, currency: true },
    });
    return { student, installments, tenant };
  });
  if (!data) return { recipients: 0 };

  const { student, installments, tenant } = data;
  const tenantName = tenant?.name ?? 'Jawal';
  const currency = tenant?.currency ?? 'MAD';

  const unpaid = installments
    .map((i) => ({
      label: i.label,
      dueDate: i.dueDate,
      rest: Number(i.amount) - i.payments.reduce((s, p) => s + Number(p.amount), 0),
    }))
    .filter((i) => i.rest > 0.005);
  const total = unpaid.reduce((s, i) => s + i.rest, 0);

  const emails = new Set<string>();
  const own = (student.contacts ?? {}) as { email?: string };
  if (own.email) emails.add(own.email);
  for (const rel of student.relationsAsChild) {
    const c = (rel.parent.contacts ?? {}) as { email?: string };
    if (c.email) emails.add(c.email);
  }
  if (emails.size === 0) return { recipients: 0 };

  const childName = `${student.lastName} ${student.firstName}`;
  const money = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${currency}`;
  const rows = unpaid
    .map(
      (i) =>
        `<li>${i.label} — échéance du ${i.dueDate.toLocaleDateString('fr-FR')} : <strong>${money(i.rest)}</strong></li>`,
    )
    .join('');

  await Promise.all(
    [...emails].map((to) =>
      safeSendEmail({
        to,
        subject: `[${tenantName}] Relance de paiement — ${childName}`,
        html: `
          <p>Bonjour,</p>
          <p>${note.replace(/\n/g, '<br/>')}</p>
          ${
            unpaid.length > 0
              ? `<p>Échéances non soldées pour <strong>${childName}</strong> :</p>
                 <ul>${rows}</ul>
                 <p>Total restant dû : <strong>${money(total)}</strong></p>`
              : ''
          }
          <p>Vous pouvez régler en ligne depuis votre espace parent, ou auprès de l’administration.</p>
          <p>Cordialement,<br/>${tenantName}</p>
          <hr/>
          <p style="font-size:11px;color:#888">Notification automatique — ne pas répondre à cet email.</p>
        `,
        text: `${note}\n\n${childName} — total restant dû : ${money(total)}.`,
      }),
    ),
  );

  return { recipients: emails.size };
}
