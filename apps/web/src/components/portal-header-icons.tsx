import { listMyAlertsAction, unreadMessagesCountAction } from '@/app/[locale]/admin/alerts-actions';
import { AlertsBell } from '@/app/[locale]/admin/alerts-bell';
import { MessagesLink } from './messages-link';

/**
 * Bloc d'en-tête commun à tous les portails (admin, parent, élève) :
 * enveloppe (messages non lus) + cloche (alertes in-app).
 */
export async function PortalHeaderIcons({
  locale,
  messagesHref,
  messagesLabel,
}: {
  locale: string;
  /** Omis pour les portails sans messagerie (ex. élève) → seule la cloche s'affiche. */
  messagesHref?: string;
  messagesLabel?: string;
}) {
  const [{ alerts, unread }, msgCount] = await Promise.all([
    listMyAlertsAction(),
    messagesHref ? unreadMessagesCountAction() : Promise.resolve(0),
  ]);
  return (
    <>
      {messagesHref && (
        <MessagesLink href={messagesHref} label={messagesLabel ?? 'Messages'} initialCount={msgCount} />
      )}
      <AlertsBell locale={locale} initialAlerts={alerts} initialUnread={unread} />
    </>
  );
}
