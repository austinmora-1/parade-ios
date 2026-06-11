/**
 * JoinRequestSection — both sides of the join-request flow on plan detail:
 *   • non-participant, non-owner → "Join this plan" card with request status
 *   • owner → list of pending requests with approve / decline actions
 * Renders null when neither applies. Owns its own queries + mutations.
 */
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import {
  usePlanJoinRequests,
  useMyJoinRequest,
  useRequestToJoin,
  useApproveJoinRequest,
  useDeclineJoinRequest,
} from '@/hooks/usePlanJoinRequests';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { formatDisplayName } from '@/lib/utils';
import { TINT } from '@/lib/colors';

export function JoinRequestSection({
  planId,
  isOwner,
  isParticipant,
}: {
  planId: string;
  isOwner: boolean;
  isParticipant: boolean;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: pendingJoinRequests } = usePlanJoinRequests(planId);
  const { data: myJoinRequest }       = useMyJoinRequest(planId);
  const requestJoinMut  = useRequestToJoin();
  const approveJoinMut  = useApproveJoinRequest();
  const declineJoinMut  = useDeclineJoinRequest();

  // Display name for the current user (to populate friend_name on join-request)
  const { data: myProfile } = useQuery({
    enabled: !!user?.id && !isParticipant && !isOwner,
    queryKey: ['my-display-name', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, first_name, last_name')
        .eq('user_id', user!.id)
        .maybeSingle();
      return formatDisplayName({
        firstName:   (data as any)?.first_name,
        lastName:    (data as any)?.last_name,
        displayName: (data as any)?.display_name,
      }) || 'A friend';
    },
  });

  // Non-participant, non-owner → Request to join
  if (!isOwner && !isParticipant) {
    return (
      <View
        className="bg-card rounded-2xl border overflow-hidden shadow-sm"
        style={{ borderColor: TINT.primaryStrong }}
      >
        <View className="px-4 py-3 gap-1">
          <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-primary">
            Join this plan
          </Text>
          {myJoinRequest?.status === 'pending' ? (
            <Text className="font-sans text-sm text-foreground mt-1">
              Request sent — waiting on the host.
            </Text>
          ) : myJoinRequest?.status === 'approved' ? (
            <Text className="font-sans text-sm text-primary mt-1">
              Approved! Reload to see yourself on the plan.
            </Text>
          ) : myJoinRequest?.status === 'declined' ? (
            <Text className="font-sans text-sm text-secondary mt-1">
              The host declined your request.
            </Text>
          ) : (
            <>
              <Text className="font-sans text-xs text-muted-foreground mt-0.5">
                Ask the host to add you.
              </Text>
              <Pressable
                onPress={async () => {
                  if (!myProfile) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  try {
                    await requestJoinMut.mutateAsync({
                      planId,
                      friendName: myProfile,
                    });
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  } catch (err: any) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                    Alert.alert('Could not send request', err?.message ?? 'Please try again.');
                  }
                }}
                disabled={requestJoinMut.isPending}
                className="bg-primary rounded-xl py-2.5 items-center mt-2 active:opacity-80"
              >
                {requestJoinMut.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text className="font-sans text-sm font-semibold text-white">
                    Request to join
                  </Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  }

  // Owner sees pending join requests
  if (isOwner && (pendingJoinRequests?.length ?? 0) > 0) {
    return (
      <View
        className="bg-card rounded-2xl border overflow-hidden shadow-sm"
        style={{ borderColor: TINT.primaryStrong }}
      >
        <View className="px-4 py-3 border-b border-border/20">
          <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-primary">
            {pendingJoinRequests!.length} request{pendingJoinRequests!.length === 1 ? '' : 's'} to join
          </Text>
        </View>
        {pendingJoinRequests!.map((req, i) => (
          <View key={req.id}>
            <View className="px-4 py-3 flex-row items-center gap-3">
              <Text className="flex-1 font-sans text-sm font-medium text-foreground" numberOfLines={1}>
                {req.friendName}
              </Text>
              <Pressable
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  try {
                    await declineJoinMut.mutateAsync({ requestId: req.id, planId });
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  } catch { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); }
                }}
                hitSlop={4}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: TINT.secondarySubtle }}
              >
                <X size={14} color="#D46549" strokeWidth={2.5} />
              </Pressable>
              <Pressable
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  try {
                    await approveJoinMut.mutateAsync({ requestId: req.id, planId });
                    await queryClient.invalidateQueries({ queryKey: ['plan', planId] });
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  } catch (err: any) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                    Alert.alert('Could not approve', err?.message ?? 'Please try again.');
                  }
                }}
                hitSlop={4}
                className="w-8 h-8 rounded-full items-center justify-center bg-primary"
              >
                <Check size={14} color="#FFFFFF" strokeWidth={2.5} />
              </Pressable>
            </View>
            {i < pendingJoinRequests!.length - 1 && (
              <View className="h-px bg-border/30 mx-4" />
            )}
          </View>
        ))}
      </View>
    );
  }

  return null;
}
