import 'server-only';
import { withTenant } from '@/lib/db';
import { safeSendEmail } from '@/lib/email';

/**
 * Relances de paiement aux parents : un rappel à J-3 puis une alerte à J-1.
 *
 * Deux échéances distinctes plutôt qu'une fenêtre « dans 3 jours ou moins » :
 * on veut exactement deux envois par échéance, pas un par jour. Le job est donc
 * conçu pour tourner une fois par jour et ne cible que les échéances tombant
 * précisément dans 3 jours ou dans 1 jour.
 *
 * Idempotence : `reminder3dSentAt` / `reminder1dSentAt` marquent l'envoi, donc
 * un job relancé le même jour ne renvoie rien.
 */
const OFFSETS = [3, 1] as const;
export type ReminderOffset = (typeof OFFSETS)[number];

/** Jour civil à J+n, en UTC, borné à la journée entière. */
function dayRange(offset: number): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset),
  );
  const end = new Date(start.getTime() + 86400000);
  return { start, end };
}

export async function runPaymentRemindersForTenant(
  tenantId: string,
): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;

  const tenant = await withTenant(tenantId, (tx) =>
    tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true, currency: true } }),
  );
  const tenantName = tenant?.name ?? 'Jawal';
  const currency = tenant?.currency ?? 'MAD';

  for (const offset of OFFSETS) {
    const { start, end } = dayRange(offset);

    const rows = await withTenant(tenantId, (tx) =>
      tx.installment.findMany({
        where: {
          status: { not: 'CANCELLED' },
          dueDate: { gte: start, lt: end },
        },
        include: {
          payments: { select: { amount: true } },
          student: {
            select: {
              firstName: true,
              lastName: true,
              contacts: true,
              relationsAsChild: {
                select: { parent: { select: { contacts: true } } },
              },
            },
          },
        },
      }),
    );

    for (const inst of rows) {
      const rest =
        Number(inst.amount) - inst.payments.reduce((s, p) => s + Number(p.amount), 0);
      // Échéance déjà soldée : plus rien à relancer.
      if (rest <= 0.005) {
        skipped++;
        continue;
      }

      const already = offset === 3 ? inst.reminder3dSentAt : inst.reminder1dSentAt;
      if (already) {
        skipped++;
        continue;
      }

      const emails = new Set<string>();
      const own = (inst.student.contacts ?? {}) as { email?: string };
      if (own.email) emails.add(own.email);
      for (const rel of inst.student.relationsAsChild) {
        const c = (rel.parent.contacts ?? {}) as { email?: string };
        if (c.email) emails.add(c.email);
      }
      if (emails.size === 0) {
        skipped++;
        continue;
      }

      const childName = `${inst.student.firstName} ${inst.student.lastName}`;
      const dateStr = inst.dueDate.toLocaleDateString('fr-FR');
      const amountStr = `${rest.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${currency}`;
      const urgent = offset === 1;

      await Promise.all(
        [...emails].map((to) =>
          safeSendEmail({
            to,
            subject: urgent
              ? `[${tenantName}] Rappel urgent — échéance du ${dateStr} (${amountStr})`
              : `[${tenantName}] Échéance à régler le ${dateStr} (${amountStr})`,
            html: `
              <p>Bonjour,</p>
              <p>${
                urgent
                  ? `L’échéance ci-dessous arrive à terme <strong>demain</strong>.`
                  : `L’échéance ci-dessous arrive à terme <strong>dans 3 jours</strong>.`
              }</p>
              <ul>
                <li>Élève : <strong>${childName}</strong></li>
                <li>Échéance : <strong>${inst.label}</strong></li>
                <li>Date limite : <strong>${dateStr}</strong></li>
                <li>Montant restant dû : <strong>${amountStr}</strong></li>
              </ul>
              <p>Vous pouvez régler en ligne depuis votre espace parent, ou auprès de l’administration.</p>
              <p>Cordialement,<br/>${tenantName}</p>
              <hr/>
              <p style="font-size:11px;color:#888">Notification automatique — ne pas répondre à cet email.</p>
            `,
            text: `${childName} — ${inst.label} : ${amountStr} à régler avant le ${dateStr}.`,
          }),
        ),
      );

      await withTenant(tenantId, (tx) =>
        tx.installment.update({
          where: { id: inst.id },
          data: offset === 3 ? { reminder3dSentAt: new Date() } : { reminder1dSentAt: new Date() },
        }),
      );
      sent++;
    }
  }

  return { sent, skipped };
}
