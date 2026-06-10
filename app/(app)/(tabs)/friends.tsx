/**
 * Friends tab — matches PWA Friends page layout.
 *
 * Structure:
 *  1. Header: "Friends" (Fraunces) + labeled "Invite" button (native Share)
 *  2. Search bar (mobile-only; PWA omits but we keep for usability)
 *  3. Pending section (if any) — amber numeric badge
 *  4. Connected (N) — Users icon + count
 *  5. Invited section (if any) — muted numeric badge
 *  6. Empty state card with Invite CTA
 *
 * Friend row: avatar (vibe ring + green dot if free today) + name +
 *             subtitle (vibe label or "Tap to connect") + ChevronRight
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useCallback, useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { Search, UserPlus, Users, ChevronRight, Check, X, Flame } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';
import { useFriendDashboardData } from '@/hooks/useFriendDashboardData';
import {
  useLastHungOut,
  streakStage,
  STREAK_COLORS,
  shortAgo,
} from '@/hooks/useLastHungOut';
import { usePods } from '@/hooks/usePods';
import { Avatar } from '@/components/primitives/Avatar';
import { Skeleton } from '@/components/primitives/Skeleton';
import { TINT } from '@/lib/colors';

// ─── Vibe emoji map (matches dashboard) ──────────────────────────────────────

const VIBE_EMOJI: Record<string, string> = {
  social: '🎉',
  chill: '🛋️',
  athletic: '🏃',
  productive: '💼',
  custom: '✨',
};

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Numeric badge bubble (matches PWA section header bubbles) */
function NumericBubble({
  count,
  tone,
}: {
  count: number;
  tone: 'green' | 'amber' | 'muted';
}) {
  const colors = {
    green: { bg: TINT.primarySubtle,  fg: '#23744D' },
    amber: { bg: TINT.amberSubtle,   fg: '#92400E' },
    muted: { bg: TINT.grayBorder, fg: '#929298' },
  }[tone];

  return (
    <View
      style={{
        backgroundColor: colors.bg,
        width: 20, height: 20, borderRadius: 999,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, color: colors.fg }}>
        {count}
      </Text>
    </View>
  );
}

/** Friend row — avatar with vibe ring + name + subtitle + chevron OR
 *  Accept/Decline buttons for incoming pending requests. */
function FriendRow({
  friend,
  vibe,
  freeToday,
  lastHungOut,
  onPress,
  onAccept,
  onDecline,
}: {
  friend: any;
  vibe?: string | null;
  freeToday?: boolean;
  lastHungOut?: Date | undefined;
  onPress: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
}) {
  const isIncoming = friend.isIncoming === true && friend.status === 'pending';
  const stage = streakStage(lastHungOut);

  // Subtitle precedence: vibe label > Free today > last-hung-out > Tap to connect
  let subtitle: string;
  if (vibe) {
    subtitle = `${VIBE_EMOJI[vibe] ?? '✨'} ${vibe}`;
  } else if (freeToday) {
    subtitle = 'Free today';
  } else if (lastHungOut && stage !== 'none') {
    subtitle = shortAgo(lastHungOut);
  } else {
    subtitle = 'Tap to connect';
  }

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center bg-card rounded-xl px-3 py-2.5 border border-border/20 gap-3 active:opacity-80 shadow-sm"
    >
      {/* Avatar with vibe ring + free-today dot */}
      <View style={{ position: 'relative' }}>
        <View
          style={
            vibe
              ? {
                  borderWidth: 2,
                  borderColor: '#23744D',
                  borderRadius: 999,
                  padding: 1,
                }
              : freeToday
              ? {
                  borderWidth: 2,
                  borderColor: 'rgba(61,140,100,0.5)',
                  borderRadius: 999,
                  padding: 1,
                }
              : { padding: 3 }
          }
        >
          <Avatar
            url={friend.avatar}
            displayName={friend.name}
            size="md"
          />
        </View>

        {/* Green pulsing dot if free today */}
        {freeToday && (
          <View
            style={{
              position: 'absolute',
              bottom: -2, right: -2,
              width: 14, height: 14,
              borderRadius: 999,
              backgroundColor: '#3D8C64',
              borderWidth: 2,
              borderColor: '#FFFFFF',
            }}
          />
        )}
      </View>

      {/* Name + subtitle */}
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center gap-1">
          <Text
            className="font-sans font-medium text-foreground text-sm"
            numberOfLines={1}
            style={{ flexShrink: 1 }}
          >
            {friend.name}
          </Text>
          {/* Streak flame — color-graded by recency */}
          {stage !== 'none' && stage !== 'cold' && (
            <Flame
              size={12}
              color={STREAK_COLORS[stage]}
              strokeWidth={2.2}
              fill={stage === 'hot' ? STREAK_COLORS[stage] : 'transparent'}
            />
          )}
        </View>
        <Text className="font-sans text-xs text-muted-foreground" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      {isIncoming && onAccept && onDecline ? (
        <View className="flex-row items-center gap-1.5">
          <Pressable
            onPress={onDecline}
            hitSlop={6}
            className="w-8 h-8 rounded-full items-center justify-center active:opacity-70"
            style={{ backgroundColor: TINT.secondarySubtle }}
          >
            <X size={16} color="#D46549" strokeWidth={2.5} />
          </Pressable>
          <Pressable
            onPress={onAccept}
            hitSlop={6}
            className="w-8 h-8 rounded-full items-center justify-center active:opacity-80 bg-primary"
          >
            <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
        </View>
      ) : friend.status === 'pending' ? (
        <View className="px-2.5 py-1 rounded-full bg-muted">
          <Text className="font-sans text-[11px] font-semibold text-muted-foreground">
            Sent
          </Text>
        </View>
      ) : (
        <ChevronRight size={16} color={TINT.grayStrong} strokeWidth={2} />
      )}
    </Pressable>
  );
}

/** Section header — icon/bubble + label */
function SectionHeader({
  label,
  bubble,
  icon,
}: {
  label: string;
  bubble?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-1.5 px-1 mb-2">
      {bubble ?? icon}
      <Text className="font-sans text-sm font-semibold text-foreground">{label}</Text>
    </View>
  );
}

/** Empty state card — matches PWA */
function EmptyState({ onInvite }: { onInvite: () => void }) {
  return (
    <View className="mx-5 bg-card rounded-2xl border border-border/30 px-6 py-8 items-center gap-3 shadow-sm">
      <Text style={{ fontSize: 32 }}>👥</Text>
      <Text className="font-sans text-sm font-semibold text-foreground text-center">
        Your friends will appear here
      </Text>
      <Text className="font-sans text-xs text-muted-foreground text-center">
        When you connect with friends, you'll see their availability, vibes, and be
        able to plan together.
      </Text>
      <Pressable
        onPress={onInvite}
        className="flex-row items-center gap-1.5 bg-primary rounded-xl px-4 py-2.5 mt-2 active:opacity-80"
      >
        <UserPlus size={14} color="#FFFFFF" strokeWidth={2} />
        <Text className="font-sans text-sm font-semibold text-white">
          Find or Invite Friends
        </Text>
      </Pressable>
    </View>
  );
}

// ─── Main tab ────────────────────────────────────────────────────────────────

export default function FriendsTab() {
  const { user } = useAuth();
  const setUserId   = usePlannerStore((s) => s.setUserId);
  const loadAllData = usePlannerStore((s) => s.loadAllData);
  const friends     = usePlannerStore((s) => s.friends);
  const isLoading   = usePlannerStore((s) => s.isLoading);
  const { data: friendData } = useFriendDashboardData();
  const { data: lastHungOutMap } = useLastHungOut();
  const { data: pods } = usePods();

  const [search, setSearch]         = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user?.id) {
      setUserId(user.id);
      loadAllData();
    }
  }, [user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAllData(true);
    setRefreshing(false);
  }, [loadAllData]);

  const onInvite = useCallback(() => {
    router.push('/(app)/add-friend');
  }, []);

  const acceptFriendRequest = usePlannerStore((s) => s.acceptFriendRequest);
  const removeFriend         = usePlannerStore((s) => s.removeFriend);

  const handleAccept = useCallback(
    async (friend: any) => {
      if (!friend.friendUserId) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        await acceptFriendRequest(friend.id, friend.friendUserId);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err) {
        console.error('Accept failed', err);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    [acceptFriendRequest],
  );

  const handleDecline = useCallback(
    (friend: any) => {
      Alert.alert(
        'Decline request?',
        `${friend.name} won't be notified.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Decline',
            style: 'destructive',
            onPress: async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              try {
                await removeFriend(friend.id);
              } catch (err) {
                console.error('Decline failed', err);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              }
            },
          },
        ],
      );
    },
    [removeFriend],
  );

  // ── Filter + group ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return friends;
    const q = search.toLowerCase();
    return friends.filter((f) => f.name.toLowerCase().includes(q));
  }, [friends, search]);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  /** Lookup vibe + free-today by friend.friendUserId */
  function enrich(friendUserId: string | undefined) {
    if (!friendUserId) return { vibe: null, freeToday: false };
    const v = friendData?.find((d) => d.userId === friendUserId);
    return {
      vibe: v?.currentVibe ?? null,
      freeToday: v?.freeDates.includes(todayStr) ?? false,
    };
  }

  const connected = filtered.filter((f) => f.status === 'connected');
  const pending   = filtered.filter((f) => f.status === 'pending');
  const invited   = filtered.filter((f) => f.status === 'invited');

  const showEmpty = !isLoading && friends.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-10"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#23744D"
          />
        }
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
          <Text className="font-display text-2xl text-foreground">Friends</Text>

          <Pressable
            onPress={onInvite}
            className="flex-row items-center gap-1.5 bg-primary rounded-xl px-3 py-2 active:opacity-80"
            hitSlop={4}
          >
            <UserPlus size={14} color="#FFFFFF" strokeWidth={2.2} />
            <Text className="font-sans text-sm font-semibold text-white">Invite</Text>
          </Pressable>
        </View>

        {/* ── Search ──────────────────────────────────────────────────── */}
        {friends.length > 0 && (
          <View className="px-5 pb-3">
            <View className="flex-row items-center bg-card rounded-xl border border-border/30 px-3 gap-2 shadow-sm">
              <Search size={15} color="#929298" strokeWidth={1.75} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search friends"
                placeholderTextColor="#929298"
                className="flex-1 font-sans text-sm text-foreground py-2.5"
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            </View>
          </View>
        )}

        {/* ── Loading skeleton ─────────────────────────────────────────── */}
        {isLoading && friends.length === 0 && (
          <View className="px-5 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                className="flex-row items-center bg-card rounded-xl px-3 py-2.5 border border-border/20 gap-3 shadow-sm"
              >
                <Skeleton width={40} height={40} rounded="rounded-full" />
                <View className="flex-1 gap-1.5">
                  <Skeleton width="50%" height={12} />
                  <Skeleton width="30%" height={10} />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Empty state ─────────────────────────────────────────────── */}
        {showEmpty && <EmptyState onInvite={onInvite} />}

        {/* ── Search returned nothing ─────────────────────────────────── */}
        {!isLoading && friends.length > 0 && filtered.length === 0 && (
          <View className="items-center py-12 px-8">
            <Text className="font-sans text-sm text-muted-foreground text-center">
              No friends match "{search}"
            </Text>
          </View>
        )}

        {/* ── Sections ────────────────────────────────────────────────── */}
        {!showEmpty && filtered.length > 0 && (
          <View className="px-5 gap-5">
            {/* Pending */}
            {pending.length > 0 && (
              <View className="gap-2">
                <SectionHeader
                  label="Pending"
                  bubble={<NumericBubble count={pending.length} tone="amber" />}
                />
                {pending.map((friend) => {
                  const { vibe, freeToday } = enrich(friend.friendUserId);
                  const isIncoming = (friend as any).isIncoming === true;
                  const lastHungOut = friend.friendUserId
                    ? lastHungOutMap?.get(friend.friendUserId)
                    : undefined;
                  return (
                    <FriendRow
                      key={friend.id}
                      friend={friend}
                      vibe={vibe}
                      freeToday={freeToday}
                      lastHungOut={lastHungOut}
                      onPress={() =>
                        router.push(
                          `/(app)/friend/${friend.friendUserId ?? friend.id}`,
                        )
                      }
                      onAccept={isIncoming ? () => handleAccept(friend) : undefined}
                      onDecline={isIncoming ? () => handleDecline(friend) : undefined}
                    />
                  );
                })}
              </View>
            )}

            {/* Pods — horizontal scroll of pod chips + create button */}
            {connected.length > 0 && (
              <View className="gap-2">
                <View className="flex-row items-center justify-between px-1">
                  <Text className="font-sans text-sm font-semibold text-foreground">
                    Pods
                  </Text>
                  <Pressable
                    onPress={() => router.push('/(app)/new-pod')}
                    hitSlop={6}
                    className="active:opacity-60"
                  >
                    <Text className="font-sans text-xs font-semibold text-primary">
                      + New pod
                    </Text>
                  </Pressable>
                </View>

                {(pods?.length ?? 0) > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerClassName="gap-2 px-0.5 pb-1"
                  >
                    {pods!.map((pod) => (
                      <Pressable
                        key={pod.id}
                        onPress={() => router.push(`/(app)/new-pod?podId=${pod.id}`)}
                        className="flex-row items-center bg-card border border-border/30 rounded-xl px-3 py-2 gap-2 shadow-sm active:opacity-80"
                      >
                        <Text style={{ fontSize: 16 }}>{pod.emoji ?? '💜'}</Text>
                        <View>
                          <Text
                            className="font-sans text-sm font-semibold text-foreground"
                            numberOfLines={1}
                          >
                            {pod.name}
                          </Text>
                          <Text className="font-sans text-[11px] text-muted-foreground">
                            {pod.memberIds.length} member{pod.memberIds.length === 1 ? '' : 's'}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : (
                  <Pressable
                    onPress={() => router.push('/(app)/new-pod')}
                    className="bg-card rounded-xl border border-dashed border-border/40 px-4 py-3 active:opacity-70"
                  >
                    <Text className="font-sans text-xs text-muted-foreground text-center">
                      Group friends into pods to make planning easier — like
                      "close friends" or "brunch crew".
                    </Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* Connected */}
            {connected.length > 0 && (
              <View className="gap-2">
                <View className="flex-row items-center justify-between mb-2 px-1">
                  <View className="flex-row items-center gap-1.5">
                    <Users size={14} color="#23744D" strokeWidth={2.2} />
                    <Text className="font-sans text-sm font-semibold text-foreground">
                      Connected ({connected.length})
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => router.push('/(app)/plan-with-friends')}
                    hitSlop={6}
                    className="active:opacity-60"
                  >
                    <Text className="font-sans text-xs font-semibold text-primary">
                      Plan with friends →
                    </Text>
                  </Pressable>
                </View>
                {connected.map((friend) => {
                  const { vibe, freeToday } = enrich(friend.friendUserId);
                  const lastHungOut = friend.friendUserId
                    ? lastHungOutMap?.get(friend.friendUserId)
                    : undefined;
                  return (
                    <FriendRow
                      key={friend.id}
                      friend={friend}
                      vibe={vibe}
                      freeToday={freeToday}
                      lastHungOut={lastHungOut}
                      onPress={() =>
                        router.push(`/(app)/friend/${friend.friendUserId}`)
                      }
                    />
                  );
                })}
              </View>
            )}

            {/* Invited */}
            {invited.length > 0 && (
              <View className="gap-2">
                <SectionHeader
                  label={`Invited (${invited.length})`}
                  bubble={<NumericBubble count={invited.length} tone="muted" />}
                />
                {invited.map((friend) => (
                  <FriendRow
                    key={friend.id}
                    friend={friend}
                    onPress={() =>
                      router.push(`/(app)/friend/${friend.id}`)
                    }
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
