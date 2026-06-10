/**
 * Friend profile — read-only Phase 1.
 * Matches PWA profile hero layout: cover banner + overlapping left-aligned
 * avatar + Fraunces name + bio + vibe pill, followed by "Free windows" list
 * styled to match the Plans tab WeekdayRow pattern.
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useCallback, useMemo } from 'react';
import { CalendarDays, MapPin, Flame, Clock } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { format, isToday, parseISO, isTomorrow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';
import {
  useLastHungOut,
  streakStage,
  STREAK_COLORS,
  shortAgo,
} from '@/hooks/useLastHungOut';
import { Avatar } from '@/components/primitives/Avatar';
import { formatDisplayName } from '@/lib/utils';
import { TIME_SLOT_LABELS } from '@/types/planner';
import type { TimeSlot } from '@/types/planner';
import { TC } from '@/lib/theme';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { TINT } from '@/lib/colors';

// ─── Constants ────────────────────────────────────────────────────────────────

const VIBE_EMOJI: Record<string, string> = {
  social: '🎉', chill: '🛋️', athletic: '🏃', productive: '💼', custom: '✨',
};

const SLOTS = [
  'early_morning', 'late_morning', 'early_afternoon',
  'late_afternoon', 'evening', 'late_night',
] as const;
const SLOT_SHORT: Record<string, string> = {
  early_morning:    'AM',
  late_morning:     'Mid',
  early_afternoon:  '12pm',
  late_afternoon:   '3pm',
  evening:          '6pm',
  late_night:       'Late',
};

// ─── Data ─────────────────────────────────────────────────────────────────────

function useFriendProfile(userId: string) {
  return useQuery({
    queryKey: ['friend-profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'user_id, display_name, first_name, last_name, avatar_url, cover_photo_url, bio, ' +
          'current_vibe, location_status, neighborhood, show_availability',
        )
        .eq('user_id', userId)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Upcoming plans where BOTH the current user and the friend are participants.
 * Uses two queries because we need to intersect user-id sets via plan_id.
 */
function useSharedPlans(friendUserId: string, currentUserId: string | undefined) {
  return useQuery({
    enabled: !!currentUserId,
    queryKey: ['shared-plans', friendUserId, currentUserId],
    staleTime: 60_000,
    queryFn: async () => {
      // Get plan_ids where the friend is a participant
      const { data: friendRows } = await supabase
        .from('plan_participants')
        .select('plan_id')
        .eq('friend_id', friendUserId);
      const friendPlanIds = new Set((friendRows ?? []).map((r: any) => r.plan_id));
      if (friendPlanIds.size === 0) return [] as any[];

      // Get plans where the current user is owner OR participant in those plan_ids
      const planIdArr = [...friendPlanIds];
      const [{ data: ownerPlans }, { data: userRows }] = await Promise.all([
        supabase
          .from('plans')
          .select('id, title, activity, date, time_slot, location, status, user_id')
          .in('id', planIdArr)
          .eq('user_id', currentUserId!),
        supabase
          .from('plan_participants')
          .select('plan_id')
          .in('plan_id', planIdArr)
          .eq('friend_id', currentUserId!),
      ]);

      const userParticipantIds = new Set((userRows ?? []).map((r: any) => r.plan_id));
      const ownerIds = new Set((ownerPlans ?? []).map((p: any) => p.id));
      const sharedIds = [...friendPlanIds].filter(
        (id) => ownerIds.has(id) || userParticipantIds.has(id),
      );
      if (sharedIds.length === 0) return [] as any[];

      const todayStr = new Date().toISOString().slice(0, 10);
      const { data: full } = await supabase
        .from('plans')
        .select('id, title, activity, date, time_slot, location, status')
        .in('id', sharedIds)
        .gte('date', todayStr)
        .order('date', { ascending: true });
      return (full ?? []) as any[];
    },
  });
}

function useFriendAvailability(userId: string) {
  return useQuery({
    queryKey: ['friend-availability', userId],
    queryFn: async () => {
      const today = new Date();
      const start = format(today, 'yyyy-MM-dd');
      const end = format(
        new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14),
        'yyyy-MM-dd',
      );
      const { data } = await supabase
        .from('availability')
        .select(
          'date, early_morning, late_morning, early_afternoon, late_afternoon, evening, late_night',
        )
        .eq('user_id', userId)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: true });
      return data ?? [];
    },
  });
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function FriendProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user } = useAuth();
  const { data: profile, isLoading, refetch: refetchProfile } = useFriendProfile(userId);
  const { data: availability, refetch: refetchAvail } = useFriendAvailability(userId);
  const { data: sharedPlans } = useSharedPlans(userId, user?.id);
  const { data: lastHungOutMap } = useLastHungOut();
  const myAvailability = usePlannerStore((s) => s.availability);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchProfile(), refetchAvail()]);
    setRefreshing(false);
  }, [refetchProfile, refetchAvail]);
  const p: any = profile;

  const lastHungOut = lastHungOutMap?.get(userId);
  const stage = streakStage(lastHungOut);

  /** Set of yyyy-MM-dd where the current user has ≥1 free slot */
  const myFreeDateSet = useMemo(() => {
    const set = new Set<string>();
    for (const day of myAvailability) {
      const hasFree = Object.values(day.slots).some((v) => v === true);
      if (hasFree) set.add(format(day.date, 'yyyy-MM-dd'));
    }
    return set;
  }, [myAvailability]);

  const name = p
    ? formatDisplayName({
        firstName:   p.first_name,
        lastName:    p.last_name,
        displayName: p.display_name,
      })
    : '';

  const freeDays = (availability ?? []).filter((row: any) =>
    SLOTS.some((s) => row[s] === 'free'),
  );

  const vibe = p?.current_vibe as string | null;
  const showAvail = p?.show_availability !== false;

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      <ScreenHeader title={name || 'Friend'} />

      {isLoading ? (
        <ActivityIndicator className="mt-16" color="#23744D" />
      ) : (
        <ScrollView
          contentContainerClassName="pb-10 gap-5"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#23744D" />
          }
        >
          {/* ── Profile hero (banner + overlapping avatar, matches Profile tab) ── */}
          <View className="mx-5 bg-card rounded-2xl border border-border/30 overflow-hidden shadow-sm">
            {/* Cover banner — uses photo if set, else gradient-tinted color */}
            {p?.cover_photo_url ? (
              <View style={{ height: 96, backgroundColor: '#DED4C3' }}>
                {/* eslint-disable-next-line react-native/no-inline-styles */}
                <Image
                  source={{ uri: p.cover_photo_url }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                />
              </View>
            ) : (
              <View
                style={{ height: 96, backgroundColor: TINT.primarySubtle }}
              />
            )}

            <View className="px-4 pb-4">
              {/* Avatar overlapping banner — white ring */}
              <View className="-mt-9 mb-3 self-start">
                <View
                  style={{
                    borderWidth: 4, borderColor: '#FFFFFF', borderRadius: 999,
                    shadowColor: '#040A2A',
                    shadowOpacity: 0.08, shadowRadius: 6,
                    shadowOffset: { width: 0, height: 2 },
                  }}
                >
                  <Avatar
                    url={p?.avatar_url}
                    firstName={p?.first_name}
                    lastName={p?.last_name}
                    displayName={p?.display_name}
                    size="xl"
                  />
                </View>
              </View>

              {/* Name + Streak Flame */}
              <View className="flex-row items-center gap-1.5">
                <Text
                  className="font-display text-xl text-foreground"
                  numberOfLines={1}
                  style={{ flexShrink: 1 }}
                >
                  {name}
                </Text>
                {stage !== 'none' && stage !== 'cold' && (
                  <Flame
                    size={16}
                    color={STREAK_COLORS[stage]}
                    strokeWidth={2.2}
                    fill={stage === 'hot' ? STREAK_COLORS[stage] : 'transparent'}
                  />
                )}
              </View>

              {/* Handle + last hung out */}
              {p?.display_name && (
                <Text className="font-sans text-sm text-muted-foreground mt-0.5">
                  @{p.display_name}
                  {lastHungOut && stage !== 'none' && (
                    <Text className="text-muted-foreground/70">
                      {' · '}
                      {`hung out ${shortAgo(lastHungOut)}`}
                    </Text>
                  )}
                </Text>
              )}

              {/* Neighborhood */}
              {p?.neighborhood && (
                <View className="flex-row items-center gap-1 mt-1.5">
                  <MapPin size={12} color="#929298" strokeWidth={1.75} />
                  <Text className="font-sans text-xs text-muted-foreground">
                    {p.neighborhood}
                  </Text>
                </View>
              )}

              {/* Bio */}
              {p?.bio && (
                <Text className="font-sans text-sm text-foreground/70 mt-2 leading-relaxed">
                  {p.bio}
                </Text>
              )}

              {/* Vibe pill */}
              {vibe && (
                <View className="flex-row mt-3">
                  <View className="flex-row items-center gap-1.5 bg-primary/10 rounded-full px-3 py-1.5">
                    <Text style={{ fontSize: 13 }}>{VIBE_EMOJI[vibe] ?? '✨'}</Text>
                    <Text className="font-sans text-xs font-semibold text-primary">
                      {vibe}
                    </Text>
                  </View>
                </View>
              )}

              {/* Action row: Send a ping + Plan with X */}
              <View className="flex-row gap-2 mt-4">
                <Pressable
                  onPress={() => router.push(`/(app)/new-plan?preInvite=${userId}`)}
                  className="flex-1 flex-row items-center justify-center gap-1.5 bg-primary rounded-xl px-4 py-2.5 active:opacity-80"
                >
                  <Text style={{ fontSize: 14 }}>📅</Text>
                  <Text className="font-sans text-sm font-semibold text-white">
                    Plan with {name.split(' ')[0]}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push(`/(app)/new-hang-request?friendId=${userId}`)}
                  className="flex-row items-center gap-1.5 bg-primary/10 rounded-xl px-3 py-2.5 active:opacity-70"
                >
                  <Text style={{ fontSize: 14 }}>👋</Text>
                  <Text className="font-sans text-sm font-semibold text-primary">
                    Ping
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* ── Availability preview ──────────────────────────────────── */}
          {showAvail && freeDays.length > 0 && (
            <View className="px-5 gap-2.5">
              <View className="flex-row items-center gap-1.5 px-0.5">
                <CalendarDays size={12} color="#929298" strokeWidth={2} />
                <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Free Windows
                </Text>
              </View>

              {freeDays.slice(0, 7).map((row: any) => {
                const day = new Date(row.date + 'T00:00:00');
                const freeSlots = SLOTS.filter((s) => row[s] === 'free');
                const today = isToday(day);
                const mutual = myFreeDateSet.has(row.date);
                return (
                  <View
                    key={row.date}
                    className="bg-card rounded-2xl px-3 py-3 flex-row items-center gap-3 shadow-sm"
                    style={
                      today
                        ? { borderWidth: 2, borderColor: '#23744D' }
                        : mutual
                          ? { borderWidth: 1, borderColor: TINT.primaryRing }
                          : { borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }
                    }
                  >
                    {/* Mutual badge — top-right "both free" indicator */}
                    {mutual && !today && (
                      <View
                        className="absolute top-2 right-3 bg-primary/10 rounded-full px-2 py-0.5"
                      >
                        <Text className="font-sans text-[10px] font-semibold text-primary">
                          both free
                        </Text>
                      </View>
                    )}
                    {/* DateDial */}
                    <View className="w-11 items-center">
                      <Text
                        style={{
                          fontFamily: 'Fraunces_900Black', fontSize: 9,
                          letterSpacing: 0.8, textTransform: 'uppercase',
                          color: today ? '#23744D' : '#929298',
                        }}
                      >
                        {format(day, 'EEE')}
                      </Text>
                      <Text
                        style={{
                          fontFamily: 'Fraunces_900Black', fontSize: 22,
                          lineHeight: 26,
                          color: today ? '#23744D' : TC.icon,
                        }}
                      >
                        {format(day, 'd')}
                      </Text>
                    </View>

                    {/* Free slot chips */}
                    <View className="flex-1 flex-row flex-wrap gap-1.5">
                      {freeSlots.map((s) => (
                        <View
                          key={s}
                          className="bg-primary/10 rounded-lg px-2 py-1"
                        >
                          <Text className="font-sans text-xs font-medium text-primary">
                            {SLOT_SHORT[s]}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Empty state for availability */}
          {showAvail && freeDays.length === 0 && !isLoading && (
            <View className="mx-5 bg-card rounded-2xl border border-dashed border-border/40 px-4 py-6 items-center gap-1">
              <Text className="font-sans text-sm text-muted-foreground">
                No free windows shared
              </Text>
              <Text className="font-sans text-xs text-muted-foreground/60">
                {name.split(' ')[0]} hasn't marked availability for the next 2 weeks
              </Text>
            </View>
          )}

          {/* ── Shared upcoming plans ─────────────────────────────────── */}
          {(sharedPlans?.length ?? 0) > 0 && (
            <View className="px-5 gap-2">
              <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-1">
                Plans together
              </Text>
              {sharedPlans!.map((plan: any) => {
                const planDate = parseISO(plan.date);
                const slotLabel = TIME_SLOT_LABELS[plan.time_slot as TimeSlot]?.time ?? '';
                const dateLabel = isToday(planDate)
                  ? 'Today'
                  : isTomorrow(planDate)
                    ? 'Tomorrow'
                    : format(planDate, 'EEE, MMM d');
                return (
                  <Pressable
                    key={plan.id}
                    onPress={() => router.push(`/(app)/plan/${plan.id}`)}
                    className="bg-card rounded-2xl border border-border/30 overflow-hidden flex-row shadow-sm active:opacity-80"
                  >
                    <View style={{ width: 4, backgroundColor: '#23744D' }} />
                    <View className="flex-1 px-4 py-3 gap-1">
                      <View className="flex-row items-start justify-between gap-2">
                        <Text
                          className="font-display text-sm text-foreground flex-1"
                          numberOfLines={1}
                        >
                          {plan.title || 'Untitled plan'}
                        </Text>
                        <Text className="font-sans text-xs text-muted-foreground">
                          {dateLabel}
                        </Text>
                      </View>
                      {(slotLabel || plan.location) && (
                        <View className="flex-row items-center gap-3">
                          {slotLabel && (
                            <View className="flex-row items-center gap-1">
                              <Clock size={11} color="#929298" strokeWidth={1.75} />
                              <Text className="font-sans text-xs text-muted-foreground">
                                {slotLabel}
                              </Text>
                            </View>
                          )}
                          {plan.location && (
                            <View className="flex-row items-center gap-1 flex-1">
                              <MapPin size={11} color="#929298" strokeWidth={1.75} />
                              <Text
                                className="font-sans text-xs text-muted-foreground"
                                numberOfLines={1}
                              >
                                {typeof plan.location === 'string' ? plan.location : ''}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
