import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { usePushToken } from '@/hooks/usePushToken';

/**
 * Authenticated app shell — stack that contains the tab navigator + all
 * detail screens (plan, trip, friend, notifications, day).
 * Redirects to login if the session is missing.
 */
function AppLayoutInner() {
  usePushToken(); // registers push token after sign-in

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="plan/[planId]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="trip/[tripId]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="friend/[userId]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="day/[date]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen
        name="new-plan"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
    </Stack>
  );
}

export default function AppLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-chalk">
        <ActivityIndicator size="large" color="#23744D" />
      </View>
    );
  }

  if (!user) return <Redirect href="/(auth)/login" />;

  return <AppLayoutInner />;
}
