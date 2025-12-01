import { Alert, Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { saveUserFcmToken } from '../services/notificationsService';

// Cómo se comportan las notificaciones cuando la app está abierta
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Configuración básica del canal en Android
 * IMPORTANTE: Debe llamarse al inicio de la app
 */
export async function setupNotifications() {
  if (Platform.OS === 'android') {
    try {
      // Canal principal para notificaciones generales
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Notificaciones Generales',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2196F3',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });

      // Canal para citas y recordatorios
      await Notifications.setNotificationChannelAsync('appointments', {
        name: 'Citas y Recordatorios',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF9800',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });

      // Canal para verificaciones y alertas importantes
      await Notifications.setNotificationChannelAsync('important', {
        name: 'Alertas Importantes',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 250, 500],
        lightColor: '#4CAF50',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    } catch {
      // Error configurando canales de notificación
    }
  }
}

/**
 * Registrar permisos y token de notificaciones.
 *
 * En Expo Go NO vamos a registrar nada, para evitar
 * el error:
 * "Android Push notifications (...) were removed from Expo Go"
 */
export async function registerForPushNotificationsAsync(uid) {
  if (!uid) return;

  // Si estamos en Expo Go -> no hacer NADA de push
  if (Constants.appOwnership === 'expo') return;

  // No intentamos en web
  if (Platform.OS === 'web') return;

  if (!Device.isDevice) return;

  try {
    // 1) Configurar canales primero (Android)
    await setupNotifications();

    // 2) Permisos
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      Alert.alert(
        'Permisos requeridos',
        'Sin permisos de notificación no podrás recibir alertas push.'
      );
      return;
    }

    // 3) Intentar leer projectId (solo sirve en builds nativos / EAS)
    let projectId = null;
    try {
      projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.easConfig?.projectId ??
        Constants?.expoConfig?.projectId ??
        null;
    } catch {
      // No se pudo leer projectId
    }

    // 4) Obtener token Expo/FCM (solo en builds nativos)
    let tokenData;
    try {
      if (projectId) {
        tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      } else {
        tokenData = await Notifications.getExpoPushTokenAsync();
      }
    } catch {
      return;
    }

    const token = tokenData.data;

    // 5) Guardarlo en Firestore para que la Cloud Function pueda usarlo
    try {
      await saveUserFcmToken({ uid, token, platform: Platform.OS });
    } catch {
      // Error guardando token
    }

    return token;
  } catch {
    return;
  }
}
