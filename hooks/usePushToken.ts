/**
 * usePushToken — requests notification permission, acquires the Expo push
 * token, persists it to Supabase `push_tokens` (Phase 6 backend), and routes
 * notification taps to the right screen.
 *
 * Mount once inside the authenticated shell ((app)/_layout.tsx).
 * expo-device is intentionally NOT used — requires a new native build.
 * getExpoPushTokenAsync() throws gracefully on simulator so no guard needed.
 */
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { createMMKV } from 'react-native-mmkv';
import { supabase } from '@/integrations/supabase/client';

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

/**
 * Translate a notification's `data.url` (PWA convention used by server-side
 * push payloads) into an Expo Router route. Returns null if no mapping.
 */
function dataToRoute(data: any): string | null {
  if (!data) return null;
  const url: string | undefined = data.url ?? data.deep_link;
  if (!url || typeof url !== 'string') return null;

  let m = url.match(/^\/plans?\/([^/?#]+)/);
  if (m) return `/(app)/plan/${m[1]}`;
  m = url.match(/^\/friends?\/([^/?#]+)/);
  if (m) return `/(app)/friend/${m[1]}`;
  m = url.match(/^\/day\/([^/?#]+)/);
  if (m) return `/(app)/day/${m[1]}`;
  m = url.match(/^\/trips?\/([^/?#]+)/);
  if (m) return `/(app)/trip/${m[1]}`;
  if (url.startsWith('/notifications')) return '/(app)/notifications';
  return null;
}

/**
 * Persist the token to push_tokens for the signed-in user. Upserts on
 * (user_id, token) so re-registrations are idempotent.
 */
async function persistToken(token: string, userId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('push_tokens')
    .upsert(
      {
        user_id:  userId,
        token,
        platform: Platform.OS, // 'ios' | 'android' | 'web'
      },
      { onConflict: 'user_id,token' },
    );
  if (error) {
    // Silent — table may not exist yet in some environments. The MMKV cache
    // is the source of truth for the client; we'll retry on next mount.
    console.log('[Push] persist failed (table may be missing):', error.message);
  }
}

export async function registerForPushNotifications(
  userId: string | undefined,
): Promise<string | null> {
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

    if (userId) {
      await persistToken(token, userId);
    }

    return token;
  } catch (err) {
    // Silently fails on simulator — expected behaviour
    console.log('[Push] Token unavailable (simulator or no entitlement):', err);
    return null;
  }
}

export function usePushToken() {
  // Track the userId we last registered for so a sign-in re-persists the token
  const lastUserRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      // Get the current signed-in user id (cheap — local session storage)
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (cancelled) return;

      const cached = tokenStore.getString('expo_push_token');
      if (cached && userId && userId !== lastUserRef.current) {
        lastUserRef.current = userId;
        await persistToken(cached, userId);
      } else {
        lastUserRef.current = userId ?? null;
        await registerForPushNotifications(userId);
      }
    };

    init();

    // Re-persist on auth state changes (sign-in switches the row's user_id)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user?.id;
      if (!userId || userId === lastUserRef.current) return;
      lastUserRef.current = userId;
      const cached = tokenStore.getString('expo_push_token');
      if (cached) persistToken(cached, userId);
      else registerForPushNotifications(userId);
    });

    // Tap routing — deep links from notifications opened in foreground OR cold start
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      console.log('[Push] Notification tapped:', data);
      const route = dataToRoute(data);
      if (route) router.push(route as any);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      tapSub.remove();
    };
  }, []);
}
