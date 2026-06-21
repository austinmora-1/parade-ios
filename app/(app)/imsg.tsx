/**
 * /imsg — landing for actions taken on an interactive Parade iMessage bubble.
 *
 * The iMessage extension (targets/imessage/MessagesViewController.swift) can't
 * write to Supabase itself, so when the recipient Accepts a ping or picks a
 * slot from a shared-availability bubble, the extension opens the app here via
 * `extensionContext.open(...)` with a `do` action so the write happens in-app
 * with the user's real session + RLS.
 *
 * Both actions resolve to the same outcome: route the acting user into the
 * "Send a ping" composer prefilled with the original sender, day, and slot, so
 * they confirm and the existing hang_requests → plan pipeline takes over.
 *   - do=accept-ping : recipient accepted a ping → confirm it back to the sender
 *   - do=pick-avail  : recipient picked one of the sender's free slots
 *
 * The bubble payload itself (t=ping / t=avail …) is consumed inside the
 * extension on tap and never reaches this route; only the `do=` open actions
 * land here. Auth is enforced by (app)/_layout; the URL survives login via
 * lib/pendingDeepLink. Keeps ?src=imessage attribution.
 */
import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

export default function ImsgActionScreen() {
  const { do: action, from, day, slot, msg, src } = useLocalSearchParams<{
    do?: string;
    from?: string;
    day?: string;
    slot?: string;
    msg?: string;
    src?: string;
  }>();

  useEffect(() => {
    // Both accept-ping and pick-avail funnel into the ping composer prefilled
    // with the original iMessage sender + chosen time. Falls back to the home
    // tab if the action is unrecognized.
    if (action !== 'accept-ping' && action !== 'pick-avail') {
      router.replace('/(app)/(tabs)');
      return;
    }
    const query = [
      from && `friendId=${encodeURIComponent(from)}`,
      day && `day=${encodeURIComponent(day)}`,
      slot && `slot=${encodeURIComponent(slot)}`,
      msg && `message=${encodeURIComponent(msg)}`,
      src && `src=${encodeURIComponent(src)}`,
    ]
      .filter(Boolean)
      .join('&');
    router.replace(`/(app)/new-hang-request${query ? `?${query}` : ''}`);
  }, [action, from, day, slot, msg, src]);

  return (
    <View className="flex-1 items-center justify-center bg-chalk">
      <ActivityIndicator size="large" color="#23744D" />
    </View>
  );
}
