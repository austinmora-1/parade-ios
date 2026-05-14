/**
 * usePushToken — requests notification permission and acquires the Expo push
 * token. Caches it in MMKV. The DB upsert is deferred until the push_tokens
 * table migration runs in Phase 2 (current push_subscriptions is web-push only).
 *
 * Call this hook once inside the authenticated shell (app/(app)/_layout.tsx).
 */
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { createMMKV } from 'react-native-mmkv';

const tokenStore = createMMKV({ id: 'parade-push-token' });

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('[Push] Skipping — not a physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Push] Permission not granted');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;
    tokenStore.set('expo_push_token', token);
    console.log('[Push] Token acquired:', token);
    return token;
  } catch (err) {
    console.error('[Push] Failed to get token:', err);
    return null;
  }
}

export function usePushToken() {
  useEffect(() => {
    // Don't block rendering — fire and forget
    registerForPushNotifications();

    // Handle notification taps while app is in background/killed
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      console.log('[Push] Notification tapped:', data);
      // TODO Phase 2: route to the right screen based on data.type
    });

    return () => sub.remove();
  }, []);
}
