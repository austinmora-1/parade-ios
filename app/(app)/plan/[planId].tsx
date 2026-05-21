/**
 * Plan detail — read-only Phase 1.
 * Matches PWA plan-card style: left-border activity accent, Fraunces title,
 * detail rows (Date / Time / Location / People), notes section.
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Calendar, Clock, MapPin, Users, Check, X, MoreHorizontal, AlertCircle } from 'lucide-react-native';
import { useActionSheet } from '@expo/react-native-action-sheet';
import {
  usePlanChangeRequest,
  useRespondToChange,
} from '@/hooks/usePlanChangeRequests';
import { parseISO } from 'date-fns';
import { PlanCommentsSection } from '@/components/plan/PlanCommentsSection';
import { PlanPhotosSection } from '@/components/plan/PlanPhotosSection';
import {
  usePlanJoinRequests,
  useMyJoinRequest,
  useRequestToJoin,
  useApproveJoinRequest,
  useDeclineJoinRequest,
} from '@/hooks/usePlanJoinRequests';
import {
  usePlanProposal,
  useVoteForOption,
  useFinalizeProposal,
} from '@/hooks/usePlanProposal';
import { formatDisplayName } from '@/lib/utils';
import type { TimeSlot } from '@/types/planner';
import { TIME_SLOT_LABELS } from '@/types/planner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useState, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SLOT_LABELS: Record<string, string> = {
  early_morning:    'Early morning',
  late_morning:     'Late morning',
  early_afternoon:  'Afternoon',
  late_afternoon:   'Late afternoon',
  evening:          'Evening',
  late_night:       'Late night',
};

const ACTIVITY_COLOR: Record<string, string> = {
  drinks: '#D46549', food: '#D46549', coffee: '#C47030', brunch: '#D46549',
  'happy-hour': '#D46549', hike: '#9CB094', run: '#9CB094', gym: '#9CB094',
  sports: '#9CB094', movie: '#7744BB', concert: '#6E9BC2', game: '#7744BB',
  travel: '#23744D', beach: '#23744D', park: '#23744D', meetup: '#23744D',
};
function activityAccent(activity?: string): string {
  return ACTIVITY_COLOR[activity ?? ''] ?? '#23744D';
}

// ─── Data ─────────────────────────────────────────────────────────────────────

function usePlan(planId: string) {
  return useQuery({
    queryKey: ['plan', planId],
    queryFn: async () => {
      const [{ data: plan, error }, { data: participants }] = await Promise.all([
        supabase.from('plans').select('*').eq('id', planId).single(),
        supabase
          .from('plan_participants')
          .select('id, friend_id, status, role, responded_at')
          .eq('plan_id', planId),
      ]);
      if (error) throw error;
      return { plan, participants: participants ?? [] };
    },
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center px-4 py-3.5 gap-3">
      {icon}
      <Text className="font-sans text-xs text-muted-foreground w-16 uppercase tracking-wide">
        {label}
      </Text>
      <Text className="font-sans text-sm text-foreground font-medium flex-1">
        {children as string}
      </Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function PlanDetailScreen() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const respondToProposal = usePlannerStore((s) => s.respondToProposal);
  const deletePlan        = usePlannerStore((s) => s.deletePlan);
  const { showActionSheetWithOptions } = useActionSheet();

  const { data, isLoading, error, refetch } = usePlan(planId);
  const plan = data?.plan as any;
  const participants = (data?.participants ?? []) as any[];
  const { data: pendingChange } = usePlanChangeRequest(planId);
  const respondChangeMut = useRespondToChange();

  // Join-request hooks (owner sees pending requests; non-participants can request)
  const { data: pendingJoinRequests } = usePlanJoinRequests(planId);
  const { data: myJoinRequest }       = useMyJoinRequest(planId);
  const requestJoinMut  = useRequestToJoin();
  const approveJoinMut  = useApproveJoinRequest();
  const declineJoinMut  = useDeclineJoinRequest();

  // Proposal voting
  const { data: proposalOptions } = usePlanProposal(planId);
  const voteForOptionMut = useVoteForOption();
  const finalizeMut      = useFinalizeProposal();

  const [rsvpLoading, setRsvpLoading] = useState<'accepted' | 'declined' | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const accentColor = activityAccent(plan?.activity);
  const isOwner = plan?.user_id === user?.id;
  const myParticipant = participants.find((p) => p.friend_id === user?.id);
  const myRsvp = myParticipant?.status as
    | 'invited'
    | 'accepted'
    | 'declined'
    | undefined;

  // Display name for the current user (to populate friend_name on join-request)
  const { data: myProfile } = useQuery({
    enabled: !!user?.id && !myParticipant && !isOwner,
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

  // ── Delete + Edit menu (owner only) ───────────────────────────────────────
  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete plan?',
      'This will remove the plan for everyone invited. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            try {
              await deletePlan(planId);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } catch (err) {
              console.error('Delete failed', err);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Could not delete plan', 'Please try again.');
            }
          },
        },
      ],
    );
  }, [deletePlan, planId]);

  const openOwnerMenu = useCallback(() => {
    Haptics.selectionAsync();
    const options = ['Edit plan', 'Propose change', 'Delete plan', 'Cancel'];
    const destructiveButtonIndex = 2;
    const cancelButtonIndex = 3;

    showActionSheetWithOptions(
      { options, destructiveButtonIndex, cancelButtonIndex },
      (selectedIndex) => {
        if (selectedIndex === 0) {
          router.push(`/(app)/new-plan?planId=${planId}`);
        } else if (selectedIndex === 1) {
          router.push(`/(app)/propose-change?planId=${planId}`);
        } else if (selectedIndex === 2) {
          handleDelete();
        }
      },
    );
  }, [showActionSheetWithOptions, planId, handleDelete]);

  const handleRsvp = useCallback(
    async (response: 'accepted' | 'declined') => {
      if (!myParticipant?.id) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setRsvpLoading(response);
      try {
        await respondToProposal(planId, myParticipant.id, response);
        await queryClient.invalidateQueries({ queryKey: ['plan', planId] });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err) {
        console.error('RSVP failed', err);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Could not save RSVP', 'Please try again.');
      } finally {
        setRsvpLoading(null);
      }
    },
    [myParticipant?.id, planId, respondToProposal, queryClient],
  );

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-3 py-2 gap-1">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
        >
          <ChevronLeft size={22} color="#2F4F3F" strokeWidth={2} />
        </Pressable>
        <Text
          className="font-display text-base text-foreground flex-1"
          numberOfLines={1}
        >
          {plan?.title ?? 'Plan'}
        </Text>
        {(isOwner || myParticipant) && (
          <Pressable
            onPress={() => {
              if (isOwner) {
                openOwnerMenu();
              } else {
                // Participant menu: just propose change
                Haptics.selectionAsync();
                showActionSheetWithOptions(
                  { options: ['Propose change', 'Cancel'], cancelButtonIndex: 1 },
                  (i) => {
                    if (i === 0) router.push(`/(app)/propose-change?planId=${planId}`);
                  },
                );
              }
            }}
            hitSlop={8}
            className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
          >
            <MoreHorizontal size={20} color="#2F4F3F" strokeWidth={2} />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator className="mt-16" color="#23744D" />
      ) : error || !plan ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-sans text-sm text-muted-foreground text-center">
            {error ? 'Could not load this plan.' : 'Plan not found.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="px-5 pb-10 gap-4 pt-2"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#23744D" />
          }
        >
          {/* Hero card — white with activity left-border accent + Fraunces title */}
          <View className="bg-white rounded-2xl border border-border/30 overflow-hidden flex-row shadow-sm">
            <View style={{ width: 4, backgroundColor: accentColor }} />
            <View className="flex-1 px-5 py-4 gap-1.5">
              <Text className="font-display text-2xl text-foreground leading-tight">
                {plan.title || 'Untitled plan'}
              </Text>
              {plan.description ? (
                <Text className="font-sans text-sm text-foreground/70 leading-relaxed mt-1">
                  {plan.description}
                </Text>
              ) : null}
            </View>
          </View>

          {/* ── Pending change request banner ─────────────────────────── */}
          {pendingChange && (
            <View
              className="bg-white rounded-2xl border overflow-hidden shadow-sm"
              style={{ borderColor: 'rgba(180,83,9,0.30)' }}
            >
              <View className="px-4 py-3 gap-1">
                <View className="flex-row items-center gap-1.5">
                  <AlertCircle size={14} color="#92400E" strokeWidth={2} />
                  <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#92400E' }}>
                    Change proposed
                  </Text>
                </View>
                <Text className="font-display text-sm text-foreground mt-1">
                  Move to{' '}
                  {pendingChange.proposedDate
                    ? format(parseISO(pendingChange.proposedDate), 'EEE, MMM d')
                    : 'a new date'}
                  {pendingChange.proposedTimeSlot ? ` · ${pendingChange.proposedTimeSlot.replace('-', ' ')}` : ''}
                </Text>
                <Text className="font-sans text-xs text-muted-foreground mt-0.5">
                  Waiting for {pendingChange.responses.filter((r) => r.response === 'pending').length} response
                  {pendingChange.responses.filter((r) => r.response === 'pending').length === 1 ? '' : 's'} · {
                    pendingChange.responses.filter((r) => r.response === 'accepted').length
                  } accepted
                </Text>
              </View>

              {/* Show Accept/Decline if user is a non-proposer participant with pending response */}
              {pendingChange.proposedBy !== user?.id &&
               pendingChange.responses.some((r) => r.participantId === user?.id && r.response === 'pending') && (
                <View className="flex-row border-t border-border/20">
                  <Pressable
                    onPress={async () => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      try {
                        await respondChangeMut.mutateAsync({
                          changeRequestId: pendingChange.id,
                          response:        'declined',
                          planId,
                        });
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      } catch { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); }
                    }}
                    className="flex-1 flex-row items-center justify-center gap-1.5 py-3 active:bg-muted/20"
                  >
                    <X size={14} color="#D46549" strokeWidth={2.2} />
                    <Text className="font-sans text-sm font-semibold text-secondary">
                      Keep original
                    </Text>
                  </Pressable>
                  <View className="w-px bg-border/30" />
                  <Pressable
                    onPress={async () => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      try {
                        await respondChangeMut.mutateAsync({
                          changeRequestId: pendingChange.id,
                          response:        'accepted',
                          planId,
                        });
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      } catch { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); }
                    }}
                    className="flex-1 flex-row items-center justify-center gap-1.5 py-3 active:bg-primary/5"
                  >
                    <Check size={14} color="#23744D" strokeWidth={2.5} />
                    <Text className="font-sans text-sm font-semibold text-primary">
                      Accept change
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {/* Details card */}
          <View className="bg-white rounded-2xl border border-border/30 shadow-sm overflow-hidden">
            <DetailRow icon={<Calendar size={15} color="#929298" strokeWidth={1.75} />} label="Date">
              {format(new Date(plan.date), 'EEE, MMM d, yyyy')}
            </DetailRow>
            <View className="h-px bg-border/30 mx-4" />

            {plan.time_slot && (
              <>
                <DetailRow icon={<Clock size={15} color="#929298" strokeWidth={1.75} />} label="Time">
                  {SLOT_LABELS[plan.time_slot] ?? plan.time_slot}
                </DetailRow>
                <View className="h-px bg-border/30 mx-4" />
              </>
            )}

            {plan.location && (
              <>
                <DetailRow icon={<MapPin size={15} color="#929298" strokeWidth={1.75} />} label="Where">
                  {plan.location}
                </DetailRow>
                <View className="h-px bg-border/30 mx-4" />
              </>
            )}

            <DetailRow icon={<Users size={15} color="#929298" strokeWidth={1.75} />} label="People">
              {participants.length + 1} going
            </DetailRow>
          </View>

          {/* Notes */}
          {plan.notes ? (
            <View className="bg-white rounded-2xl border border-border/30 p-5 gap-2 shadow-sm">
              <Text className="font-sans text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                Notes
              </Text>
              <Text className="font-sans text-sm text-foreground leading-relaxed">
                {plan.notes}
              </Text>
            </View>
          ) : null}

          {/* ── Proposal voting ───────────────────────────────────────── */}
          {(proposalOptions?.length ?? 0) > 0 && plan.status === 'proposed' && (
            <View className="gap-2">
              <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-1">
                Vote on a time
              </Text>
              <View className="bg-white rounded-2xl border border-border/30 shadow-sm overflow-hidden">
                {proposalOptions!.map((opt, i) => {
                  const dateObj = parseISO(opt.date);
                  const slotLabel = TIME_SLOT_LABELS[opt.timeSlot]?.time ?? '';
                  const isMyPick = opt.myRank === 1;
                  const otherIds = proposalOptions!.filter((o) => o.id !== opt.id).map((o) => o.id);
                  return (
                    <View key={opt.id}>
                      <Pressable
                        onPress={async () => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          try {
                            await voteForOptionMut.mutateAsync({
                              planId,
                              optionId: opt.id,
                              otherOptionIds: otherIds,
                            });
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          } catch (err) {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                          }
                        }}
                        disabled={voteForOptionMut.isPending}
                        className={`px-4 py-3 flex-row items-center gap-3 ${
                          isMyPick ? 'bg-primary/8' : 'active:bg-muted/30'
                        }`}
                      >
                        <View
                          style={{
                            width: 22, height: 22, borderRadius: 999,
                            borderWidth: 2,
                            borderColor: isMyPick ? '#23744D' : 'rgba(146,146,152,0.4)',
                            backgroundColor: isMyPick ? '#23744D' : 'transparent',
                            alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          {isMyPick && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                        </View>
                        <View className="flex-1">
                          <Text className="font-display text-sm text-foreground">
                            {format(dateObj, 'EEE, MMM d')}
                          </Text>
                          {slotLabel && (
                            <Text className="font-sans text-xs text-muted-foreground mt-0.5">
                              {slotLabel}
                            </Text>
                          )}
                        </View>
                        <View className="items-end">
                          <Text className="font-display text-sm text-foreground">
                            {opt.voteCount}
                          </Text>
                          <Text className="font-sans text-[10px] text-muted-foreground">
                            vote{opt.voteCount === 1 ? '' : 's'}
                          </Text>
                        </View>
                        {/* Owner finalize */}
                        {isOwner && (
                          <Pressable
                            onPress={async (e) => {
                              e.stopPropagation?.();
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              try {
                                await finalizeMut.mutateAsync({
                                  planId,
                                  date: opt.date,
                                  timeSlot: opt.timeSlot,
                                });
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                              } catch (err: any) {
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                                Alert.alert('Could not finalize', err?.message ?? 'Please try again.');
                              }
                            }}
                            hitSlop={4}
                            className="bg-primary/10 rounded-xl px-2 py-1 ml-1 active:opacity-70"
                          >
                            <Text className="font-sans text-[11px] font-semibold text-primary">
                              Pick this
                            </Text>
                          </Pressable>
                        )}
                      </Pressable>
                      {i < proposalOptions!.length - 1 && (
                        <View className="h-px bg-border/30 mx-4" />
                      )}
                    </View>
                  );
                })}
              </View>
              <Text className="font-sans text-[11px] text-muted-foreground px-1">
                {isOwner
                  ? 'Tap "Pick this" once everyone has voted to confirm the time.'
                  : 'Tap to vote for your top choice.'}
              </Text>
            </View>
          )}

          {/* ── RSVP block (non-owner participants only) ─────────────────── */}
          {!isOwner && myParticipant && (
            <View className="gap-2">
              <Text className="font-sans text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-1">
                Your RSVP
              </Text>

              {myRsvp === 'accepted' && (
                <View
                  className="flex-row items-center gap-2 rounded-2xl px-4 py-3.5 shadow-sm"
                  style={{ backgroundColor: 'rgba(35,116,77,0.10)', borderWidth: 1, borderColor: 'rgba(35,116,77,0.25)' }}
                >
                  <Check size={18} color="#23744D" strokeWidth={2.5} />
                  <Text className="flex-1 font-sans text-sm font-semibold text-primary">
                    You're going
                  </Text>
                  <Pressable
                    onPress={() => handleRsvp('declined')}
                    disabled={rsvpLoading !== null}
                    hitSlop={4}
                  >
                    <Text className="font-sans text-xs font-semibold text-muted-foreground underline">
                      Change to no
                    </Text>
                  </Pressable>
                </View>
              )}

              {myRsvp === 'declined' && (
                <View
                  className="flex-row items-center gap-2 rounded-2xl px-4 py-3.5 shadow-sm"
                  style={{ backgroundColor: 'rgba(212,101,73,0.08)', borderWidth: 1, borderColor: 'rgba(212,101,73,0.20)' }}
                >
                  <X size={18} color="#D46549" strokeWidth={2.5} />
                  <Text className="flex-1 font-sans text-sm font-semibold text-secondary">
                    You declined
                  </Text>
                  <Pressable
                    onPress={() => handleRsvp('accepted')}
                    disabled={rsvpLoading !== null}
                    hitSlop={4}
                  >
                    <Text className="font-sans text-xs font-semibold text-muted-foreground underline">
                      Change to yes
                    </Text>
                  </Pressable>
                </View>
              )}

              {(!myRsvp || myRsvp === 'invited') && (
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() => handleRsvp('declined')}
                    disabled={rsvpLoading !== null}
                    className="flex-1 flex-row items-center justify-center gap-1.5 bg-white border border-border/40 rounded-2xl py-3.5 active:opacity-70 shadow-sm"
                  >
                    {rsvpLoading === 'declined' ? (
                      <ActivityIndicator size="small" color="#D46549" />
                    ) : (
                      <>
                        <X size={16} color="#D46549" strokeWidth={2.2} />
                        <Text className="font-sans text-sm font-semibold text-secondary">
                          Can't make it
                        </Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => handleRsvp('accepted')}
                    disabled={rsvpLoading !== null}
                    className="flex-1 flex-row items-center justify-center gap-1.5 bg-primary rounded-2xl py-3.5 active:opacity-80 shadow-sm"
                  >
                    {rsvpLoading === 'accepted' ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
                        <Text className="font-sans text-sm font-semibold text-white">
                          I'm in
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              )}
            </View>
          )}

          {/* ── Join-request UI ───────────────────────────────────────── */}
          {/* Non-participant, non-owner → Request to join */}
          {!isOwner && !myParticipant && (
            <View
              className="bg-white rounded-2xl border overflow-hidden shadow-sm"
              style={{ borderColor: 'rgba(35,116,77,0.30)' }}
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
          )}

          {/* Owner sees pending join requests */}
          {isOwner && (pendingJoinRequests?.length ?? 0) > 0 && (
            <View
              className="bg-white rounded-2xl border overflow-hidden shadow-sm"
              style={{ borderColor: 'rgba(35,116,77,0.30)' }}
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
                      style={{ backgroundColor: 'rgba(212,101,73,0.12)' }}
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
          )}

          {/* Owner sees a small "You proposed this plan" hint instead */}
          {isOwner && participants.length > 0 && (
            <View className="bg-primary/5 rounded-2xl px-4 py-3 border border-primary/15">
              <Text className="font-sans text-xs text-primary text-center">
                You proposed this plan · {participants.filter(p => p.status === 'accepted').length} of {participants.length} accepted
              </Text>
            </View>
          )}

          {/* ── Photos ────────────────────────────────────────────────── */}
          <PlanPhotosSection planId={planId} />

          {/* ── Comments ──────────────────────────────────────────────── */}
          <PlanCommentsSection planId={planId} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
