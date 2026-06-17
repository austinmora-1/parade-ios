/**
 * /imessage-plan — landing for the find-time / find-people / go-somewhere
 * bubbles sent from the iMessage extension.
 *
 * The extension collects no plan details, so its bubble only carries the
 * sender's identity (`inviter` = their user id) and which `flow` was chosen.
 * Here we route the recipient into the matching in-app flow with the sender
 * pre-selected as a participant, where the real shared object (plan / open
 * invite / trip) gets created with proper details and ownership — reusing the
 * existing creation logic in those screens rather than duplicating it.
 *
 * Reached as a universal link (helloparade.app/imessage-plan?...). Auth is
 * enforced by (app)/_layout; the intended URL survives login via
 * lib/pendingDeepLink. Keeps the ?src=imessage attribution.
 */
import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

const FLOW_PATHS: Record<string, string> = {
  'find-time': '/(app)/find-time',
  'find-people': '/(app)/find-people',
  'go-somewhere': '/(app)/go-somewhere',
};

export default function ImessagePlanScreen() {
  const { flow, inviter, src } = useLocalSearchParams<{
    flow?: string;
    inviter?: string;
    src?: string;
  }>();

  useEffect(() => {
    const target = (flow && FLOW_PATHS[flow]) || '/(app)/(tabs)';
    const query = [
      inviter && `preFriend=${encodeURIComponent(inviter)}`,
      src && `src=${encodeURIComponent(src)}`,
    ]
      .filter(Boolean)
      .join('&');
    router.replace(query ? `${target}?${query}` : target);
  }, [flow, inviter, src]);

  return (
    <View className="flex-1 items-center justify-center bg-chalk">
      <ActivityIndicator size="large" color="#23744D" />
    </View>
  );
}
