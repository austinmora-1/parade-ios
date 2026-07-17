/**
 * /trip-invite/{token} — universal-link landing for trip invite links minted
 * in-app (https://helloparade.app/invite.html?tt={token}, rewritten here by
 * app/+native-intent.tsx). Resolves the token via get_trip_invite_details,
 * auto-accepts with accept_trip_invite (idempotent server-side), and drops
 * the user on the trip — or the proposal when no trip is finalized yet.
 * The inviter and existing proposal participants skip the accept.
 *
 * Auth is enforced by (app)/_layout; a signed-out recipient bounces through
 * login and returns here (PRESERVED_PREFIXES + lib/pendingDeepLink).
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { PARADE_GREEN } from '@/lib/colors';

type TripInviteDetails = {
  error?: string;
  proposal_id?: string;
  trip_id?: string | null;
};

/** Finalized proposals land on the trip; pending ones on the proposal. */
function goToDestination(tripId: string | null | undefined, proposalId: string) {
  if (tripId) router.replace(`/(app)/trip/${tripId}`);
  else router.replace(`/(app)/trip-proposal/${proposalId}`);
}

export default function TripInviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { user } = useAuth();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id || !token) return;
      try {
        const { data, error } = await supabase.rpc('get_trip_invite_details', {
          p_token: token,
        });
        if (error) throw error;
        const details = (data ?? null) as TripInviteDetails | null;
        if (!details || details.error || !details.proposal_id) {
          throw new Error('Invite not found');
        }

        // Inviter opening their own link — RLS only returns
        // trip_proposal_invites rows to the inviter, so a hit means skip.
        const { data: ownInvite } = await supabase
          .from('trip_proposal_invites')
          .select('id')
          .eq('invite_token', token)
          .limit(1);
        let hasAccess = (ownInvite?.length ?? 0) > 0;

        // Already on the proposal — no need to re-accept.
        if (!hasAccess) {
          const { data: isParticipant } = await supabase.rpc('is_trip_proposal_participant', {
            p_proposal_id: details.proposal_id,
          });
          hasAccess = isParticipant === true;
        }

        if (hasAccess) {
          if (!cancelled) goToDestination(details.trip_id, details.proposal_id);
          return;
        }

        const { data: accepted, error: acceptError } = await supabase.rpc('accept_trip_invite', {
          p_token: token,
        });
        if (acceptError) throw acceptError;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        const result = (accepted ?? null) as TripInviteDetails | null;
        if (!cancelled) {
          goToDestination(result?.trip_id ?? details.trip_id, details.proposal_id);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, token]);

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      <ScreenHeader
        title="Trip invite"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(app)/(tabs)'))}
      />
      {failed ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Text className="text-center font-display text-xl text-foreground">
            Invite not found
          </Text>
          <Text className="text-center font-sans text-base text-muted-foreground">
            This invite link is invalid or has expired.
          </Text>
          <Pressable
            onPress={() => router.replace('/(app)/(tabs)')}
            className="mt-2 rounded-full bg-evergreen px-6 py-3 active:opacity-80"
          >
            <Text className="font-sans font-semibold text-white">Go home</Text>
          </Pressable>
        </View>
      ) : (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={PARADE_GREEN} />
        </View>
      )}
    </SafeAreaView>
  );
}
