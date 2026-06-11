/**
 * PushNotificationPrompt — contextual push permission nudge.
 *
 * Shows only after:
 *   - User owns ≥1 confirmed plan (so the prompt actually feels earned)
 *   - System push permission is not yet 'granted'
 *   - Not previously dismissed
 *
 * Tap "Turn on push" → requests permission. Tap X → dismisses for this user.
 */
import { View, Text, Pressable, ActivityIndicator, Linking, Alert } from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { useMemo } from 'react';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { Bell, X } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';
import { useDismissed } from './dismissCache';

import { TINT } from '@/lib/colors';
const DISMISS_KEY = 'pushPrompt';

type PermStatus = 'unknown' | 'granted' | 'denied' | 'undetermined';

export function PushNotificationPrompt() {
  const { user } = useAuth();
  const plans = usePlannerStore((s) => s.plans);
  const [dismissed, doDismiss] = useDismissed(DISMISS_KEY, user?.id);
  const [permStatus, setPermStatus] = useState<PermStatus>('unknown');
  const [requesting, setRequesting] = useState(false);

  // Probe current permission status (cheap, doesn't prompt)
  useEffect(() => {
    Notifications.getPermissionsAsync()
      .then(({ status }) => {
        setPermStatus(
          status === 'granted' ? 'granted'
          : status === 'denied' ? 'denied'
          : 'undetermined',
        );
      })
      .catch(() => setPermStatus('unknown'));
  }, []);

  // Only show after user has ≥1 confirmed plan they own
  const hasConfirmedPlan = useMemo(() => {
    return plans.some((p) => {
      const status = (p as any).status;
      const myRsvp = (p as any).myRsvpStatus;
      // Owned plan: myRsvpStatus undefined; otherwise we accepted
      return (status === 'confirmed' || !status) && (myRsvp === undefined);
    });
  }, [plans]);

  const handleRequest = useCallback(async () => {
    if (permStatus === 'denied') {
      // OS won't re-prompt — direct them to Settings
      Alert.alert(
        'Push permission denied',
        'To enable, open Settings → Parade → Notifications and turn them on.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    setRequesting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      const next: PermStatus = status === 'granted' ? 'granted' : 'denied';
      setPermStatus(next);
      if (next === 'granted') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } finally {
      setRequesting(false);
    }
  }, [permStatus]);

  if (dismissed) return null;
  if (permStatus === 'granted' || permStatus === 'unknown') return null;
  if (!hasConfirmedPlan) return null;

  return (
    <View className="flex-row items-center bg-card rounded-2xl border border-primary/30 px-4 py-3.5 gap-3 shadow-sm">
      <View
        className="w-10 h-10 rounded-xl items-center justify-center"
        style={{ backgroundColor: TINT.primarySubtle }}
      >
        <Bell size={18} color="#23744D" strokeWidth={2} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="font-sans text-xs font-semibold uppercase tracking-wider text-primary">
          Don't miss a plan
        </Text>
        <Text className="font-display text-xl text-foreground">
          Turn on push reminders
        </Text>
        <Text className="font-sans text-sm text-muted-foreground leading-relaxed">
          Get a heads-up before plans + when friends invite you.
        </Text>
      </View>
      <View className="items-center gap-2">
        <Pressable
          onPress={() => { Haptics.selectionAsync(); doDismiss(); }}
          hitSlop={6}
          className="w-6 h-6 items-center justify-center active:opacity-60"
        >
          <X size={14} color="#929298" strokeWidth={2} />
        </Pressable>
        <Pressable
          onPress={handleRequest}
          disabled={requesting}
          hitSlop={4}
          className="bg-primary rounded-xl px-3 py-1.5 active:opacity-80"
        >
          {requesting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text className="font-sans text-sm font-semibold text-white">
              Turn on
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
