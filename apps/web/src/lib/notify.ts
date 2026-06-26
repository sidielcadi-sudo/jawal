/**
 * Abstraction d'envoi de notifications (WhatsApp / SMS / e-mail).
 *
 * v1 = driver « log » : le message est rendu et journalisé en base
 * (`NotificationLog`, statut SENT) sans appel externe. Point d'intégration du
 * vrai fournisseur (Meta Cloud API / 360dialog / Twilio…) balisé ci-dessous :
 * quand `NOTIFY_DRIVER` ≠ "log", le message est mis en file (statut PENDING)
 * pour qu'un worker l'expédie et mette à jour le statut.
 */
import type { Prisma } from '@jawal/db';
import { renderTemplate, type NotifyData } from './notify-templates';

export type NotifyChannel = 'WHATSAPP' | 'SMS' | 'EMAIL';

export type NotifyItem = {
  channel?: NotifyChannel;
  /** Destinataire (n° WhatsApp / téléphone / e-mail). Vide → message SKIPPED. */
  recipient: string | null | undefined;
  recipientName?: string | null;
  template: string;
  data: NotifyData;
  studentId?: string | null;
  relatedType?: string | null;
  relatedId?: string | null;
};

const DRIVER = process.env.NOTIFY_DRIVER ?? 'log';

/**
 * Journalise (et « envoie » via le driver actif) un lot de notifications dans
 * le contexte tenant courant. Retourne le décompte par statut.
 */
export async function sendNotifications(
  tx: Prisma.TransactionClient,
  tenantId: string,
  locale: string,
  items: NotifyItem[],
): Promise<{ sent: number; skipped: number; queued: number }> {
  let sent = 0;
  let skipped = 0;
  let queued = 0;

  for (const it of items) {
    const channel = it.channel ?? 'WHATSAPP';
    const body = renderTemplate(it.template, it.data, locale);
    const recipient = (it.recipient ?? '').trim();

    let status: 'SENT' | 'SKIPPED' | 'PENDING' | 'FAILED';
    let sentAt: Date | null = null;

    if (!recipient) {
      status = 'SKIPPED';
      skipped++;
    } else if (DRIVER === 'log') {
      // Driver de développement : on considère le message « envoyé » (journalisé).
      status = 'SENT';
      sentAt = new Date();
      sent++;
    } else {
      // ── Point d'intégration fournisseur réel ──────────────────────────────
      // Mettre en file ; un worker appellera l'API WhatsApp/SMS puis passera
      // le statut à SENT/FAILED avec l'éventuelle erreur.
      status = 'PENDING';
      queued++;
    }

    await tx.notificationLog.create({
      data: {
        tenantId,
        channel,
        recipient,
        recipientName: it.recipientName ?? null,
        studentId: it.studentId ?? null,
        template: it.template,
        body,
        status,
        sentAt,
        relatedType: it.relatedType ?? null,
        relatedId: it.relatedId ?? null,
      },
    });
  }

  return { sent, skipped, queued };
}

/** Numéro de contact préféré d'un parent (WhatsApp prioritaire, sinon téléphone). */
export function parentRecipient(contacts: unknown): string | null {
  const c = (contacts ?? {}) as { whatsapp?: string; phone?: string };
  return c.whatsapp?.trim() || c.phone?.trim() || null;
}
