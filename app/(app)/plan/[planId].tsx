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
import { ChevronLeft, Calendar, Clock, MapPin, Users, Check, X, MoreHorizontal } from 'lucide-react-native';
import { useActionSheet } from '@expo/react-native-action-sheet';
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
    const options = ['Edit plan', 'Delete plan', 'Cancel'];
    const destructiveButtonIndex = 1;
    const cancelButtonIndex = 2;

    showActionSheetWithOptions(
      { options, destructiveButtonIndex, cancelButtonIndex },
      (selectedIndex) => {
        if (selectedIndex === 0) {
          router.push(`/(app)/new-plan?planId=${planId}`);
        } else if (selectedIndex === 1) {
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
        {isOwner && (
          <Pressable
            onPress={openOwnerMenu}
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

          {/* Owner sees a small "You proposed this plan" hint instead */}
          {isOwner && participants.length > 0 && (
            <View className="bg-primary/5 rounded-2xl px-4 py-3 border border-primary/15">
              <Text className="font-sans text-xs text-primary text-center">
                You proposed this plan · {participants.filter(p => p.status === 'accepted').length} of {participants.length} accepted
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
