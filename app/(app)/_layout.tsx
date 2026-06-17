import { Redirect, Stack, router, usePathname, useGlobalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { usePushToken } from '@/hooks/usePushToken';
import { useCalendarAutoSync } from '@/hooks/useCalendarAutoSync';
import { setPendingDeepLink, consumePendingDeepLink } from '@/lib/pendingDeepLink';
import { FirstPlanCelebration } from '@/components/onboarding/FirstPlanCelebration';

// Protected deep-link landings that should survive the login bounce.
const PRESERVED_PREFIXES = ['/imessage-plan', '/invite', '/share'];

/**
 * Authenticated app shell — stack that contains the tab navigator + all
 * detail screens (plan, trip, friend, notifications, day).
 * Redirects to login if the session is missing.
 */
function AppLayoutInner() {
  usePushToken();         // registers push token after sign-in
  useCalendarAutoSync();  // auto-syncs calendar busy times on foreground

  // Replay a deep link that was stashed during a login bounce (no-op on a
  // normal launch, where nothing was pended).
  useEffect(() => {
    const href = consumePendingDeepLink();
    if (href) router.replace(href);
  }, []);

  return (
    <View style={{ flex: 1 }}>
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="plan/[planId]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="trip/[tripId]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="friend/[userId]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="pending-requests" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="pods" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="day/[date]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="trips" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen
        name="new-plan"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="add-friend"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="edit-profile"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="new-trip"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="onboarding"
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen
        name="set-location"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="what-planning"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="welcome"
        options={{
          presentation: 'fullScreenModal',
          animation: 'fade',
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="tour"
        options={{
          presentation: 'fullScreenModal',
          animation: 'fade',
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="new-pod"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="new-hang-request"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="suggest-hang"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="quick-plan"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="share-availability"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="plan-with-friends"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="find-time"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="find-people"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="go-somewhere"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="propose-change"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="trip-proposal/[id]"
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="new-trip-proposal"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="edit-intention"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      {/* Deep-link landings for iMessage-extension bubbles (src=imessage). */}
      <Stack.Screen name="imessage-plan" options={{ animation: 'none' }} />
      <Stack.Screen name="invite/[code]" options={{ animation: 'none' }} />
      <Stack.Screen name="share/[code]" options={{ animation: 'none' }} />
    </Stack>
    <FirstPlanCelebration />
    </View>
  );
}

export default function AppLayout() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const params = useGlobalSearchParams();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-chalk">
        <ActivityIndicator size="large" color="#23744D" />
      </View>
    );
  }

  if (!user) {
    // If a protected deep link bounced us here, remember it for after login.
    if (pathname && PRESERVED_PREFIXES.some((p) => pathname.startsWith(p))) {
      // The dynamic `code` segment is already in pathname; carry the rest
      // (flow / inviter / src / view) as the query string.
      const query = Object.entries(params)
        .filter(([key, value]) => key !== 'code' && typeof value === 'string' && value)
        .map(([key, value]) => `${key}=${encodeURIComponent(value as string)}`)
        .join('&');
      setPendingDeepLink(query ? `${pathname}?${query}` : pathname);
    }
    return <Redirect href="/(auth)/login" />;
  }

  return <AppLayoutInner />;
}
