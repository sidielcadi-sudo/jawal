import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import type * as NotificationsType from 'expo-notifications';
import { api } from './api';

/**
 * Notifications push (Expo). Enregistre le jeton de l'appareil auprès de l'API
 * après connexion, et affiche les notifications reçues au premier plan.
 *
 * ⚠️ Expo Go a **retiré le push distant** (remote notifications) depuis le SDK 53 :
 * le simple import d'`expo-notifications` y déclenche une erreur fatale (le module
 * appelle `addPushTokenListener` au chargement). On charge donc le module en
 * **lazy `require`** UNIQUEMENT hors Expo Go — Metro n'exécute le code d'un module
 * qu'au moment du `require`, donc rien ne s'exécute côté Expo Go.
 *
 * Le push reste pleinement disponible en **development build / EAS Build**.
 */

export const isExpoGo = Constants.executionEnvironment === 'storeClient';

let Notifications: typeof NotificationsType | null = null;
if (!isExpoGo) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Notifications = require('expo-notifications') as typeof NotificationsType;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

function getProjectId(): string | undefined {
  return (
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId
  );
}

async function getExpoToken(): Promise<string | null> {
  if (!Notifications || !Device.isDevice) return null;
  const projectId = getProjectId();
  const res = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return res.data;
}

/** Demande la permission, récupère le jeton Expo et l'enregistre côté API. */
export async function registerForPush(authToken: string): Promise<void> {
  try {
    if (!Notifications || !Device.isDevice) return;
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Général',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const expoToken = await getExpoToken();
    if (!expoToken) return;
    await api.registerPush(authToken, expoToken, Platform.OS === 'ios' ? 'ios' : 'android');
  } catch (e) {
    console.warn('[push] enregistrement échoué', e);
  }
}

/** Désenregistre le jeton (à la déconnexion). */
export async function unregisterPush(authToken: string): Promise<void> {
  try {
    const expoToken = await getExpoToken();
    if (expoToken) await api.unregisterPush(authToken, expoToken);
  } catch {
    // best-effort
  }
}

/**
 * S'abonne au tap sur une notification (navigation contextuelle). No-op en
 * Expo Go. Renvoie une fonction de désabonnement.
 */
export function subscribeToNotificationTaps(
  onTap: (data: { type?: string; conversationId?: string } | undefined) => void,
): () => void {
  if (!Notifications) return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    onTap(
      response.notification.request.content.data as
        | { type?: string; conversationId?: string }
        | undefined,
    );
  });
  return () => sub.remove();
}
