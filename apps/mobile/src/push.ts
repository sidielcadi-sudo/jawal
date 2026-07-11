import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { api } from './api';

/**
 * Notifications push (Expo). Enregistre le jeton de l'appareil auprès de l'API
 * après connexion, et affiche les notifications reçues au premier plan.
 *
 * ⚠️ Le push distant nécessite un **appareil physique** + un **projectId EAS**
 * (`eas init`). En prod : development build / EAS Build (Expo Go a des limites
 * de push selon les versions). Tout est best-effort : jamais bloquant.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function getProjectId(): string | undefined {
  return (
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId
  );
}

async function getExpoToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  const projectId = getProjectId();
  const res = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return res.data;
}

/** Demande la permission, récupère le jeton Expo et l'enregistre côté API. */
export async function registerForPush(authToken: string): Promise<void> {
  try {
    if (!Device.isDevice) return;
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
