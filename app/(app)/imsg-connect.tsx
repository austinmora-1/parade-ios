/**
 * /imsg-connect — one-time "connect Parade to Messages" landing.
 *
 * The iMessage extension can't authenticate itself (no network, by design), so
 * when it has no bridged identity it shows a "Connect your account" step that
 * opens the app here. Auth is enforced by (app)/_layout — a signed-out user is
 * sent to login first and bounced back via lib/pendingDeepLink. Once signed in,
 * we (re)write the user's identity + availability into the shared App Group,
 * which creates the shared container and lets the extension show real data.
 */
import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';
import { syncSessionToAppGroup } from '@/lib/sessionBridge';

export default function ImsgConnectScreen() {
  const { session } = useAuth();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!session) return; // layout guarantees auth; guard for the brief pre-load
    let cancelled = false;
    (async () => {
      // Identity write creates the App Group container immediately.
      await syncSessionToAppGroup(session);
      // Loading availability flows it into the App Group via the store
      // subscription in stores/availabilityStore.
      try {
        await usePlannerStore.getState().loadProfileAndAvailability();
      } catch {
        // best-effort — identity alone already unblocks the extension
      }
      if (!cancelled) setDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <SafeAreaView className="flex-1 bg-chalk items-center justify-center px-8">
      <View className="w-16 h-16 rounded-full bg-primary/15 items-center justify-center mb-5">
        <Check size={32} color="#23744D" strokeWidth={2.5} />
      </View>
      <Text className="font-display text-xl text-foreground text-center mb-2">
        {done ? "You're connected" : 'Connecting…'}
      </Text>
      <Text className="font-sans text-sm text-muted-foreground text-center leading-relaxed">
        Your availability is synced to Messages. Head back to your conversation to
        share it or send a ping right from the Parade iMessage app.
      </Text>
    </SafeAreaView>
  );
}
