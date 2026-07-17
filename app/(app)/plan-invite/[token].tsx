/**
 * /plan-invite/{token} — universal-link landing for plan invite links minted
 * in-app (https://helloparade.app/invite.html?t={token}, rewritten here by
 * app/+native-intent.tsx). Resolves the token via get_plan_invite_details,
 * auto-accepts with accept_plan_invite, and drops the user on the plan.
 * The inviter (or plan owner) and existing participants skip the accept and
 * go straight to the plan detail.
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

export default function PlanInviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { user } = useAuth();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id || !token) return;
      try {
        const { data, error } = await supabase.rpc('get_plan_invite_details', {
          p_token: token,
        });
        if (error) throw error;
        const invite = data?.[0];
        if (!invite?.plan_id) throw new Error('Invite not found');

        // Inviter / plan owner opening their own link — RLS only returns
        // plan_invites rows to those two, so a hit means skip the accept.
        const { data: ownInvite } = await supabase
          .from('plan_invites')
          .select('id')
          .eq('invite_token', token)
          .limit(1);
        let hasAccess = (ownInvite?.length ?? 0) > 0;

        // Already a participant — RLS shows the user their own row.
        if (!hasAccess) {
          const { data: participation } = await supabase
            .from('plan_participants')
            .select('id')
            .eq('plan_id', invite.plan_id)
            .eq('friend_id', user.id)
            .limit(1);
          hasAccess = (participation?.length ?? 0) > 0;
        }

        if (!hasAccess) {
          const { error: acceptError } = await supabase.rpc('accept_plan_invite', {
            p_token: token,
          });
          if (acceptError) throw acceptError;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        if (!cancelled) router.replace(`/(app)/plan/${invite.plan_id}`);
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
        title="Plan invite"
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
