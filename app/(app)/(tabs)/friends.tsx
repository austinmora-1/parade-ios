/**
 * Friends tab.
 *
 * Structure:
 *  1. Header: "Friends" (Fraunces) + labeled "Invite" button
 *  2. Search bar
 *  3. Pending — collapsed single line: overlapping avatars + count, taps
 *     through to the full pending-requests page
 *  4. Pods — collapsed single line: overlapping member avatars + count, taps
 *     through to the pods management page
 *  5. Connected — expanded 3-per-row avatar grid
 *  6. Invited section (if any)
 *  7. Empty state card with Invite CTA
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  RefreshControl,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useCallback, useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { Search, UserPlus, Users, ChevronRight, Flame } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { useFloatingTabBarHeight } from '@/components/navigation/FloatingTabBar';
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
import { AvatarStack } from '@/components/primitives/AvatarStack';
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

/** Subtitle precedence: vibe label > Free today > last-hung-out > Tap to connect */
function friendSubtitle(
  vibe: string | null | undefined,
  freeToday: boolean | undefined,
  lastHungOut: Date | undefined,
): string {
  const stage = streakStage(lastHungOut);
  if (vibe) return `${VIBE_EMOJI[vibe] ?? '✨'} ${vibe}`;
  if (freeToday) return 'Free today';
  if (lastHungOut && stage !== 'none') return shortAgo(lastHungOut);
  return 'Tap to connect';
}

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
    green: { bg: TINT.primarySubtle, fg: '#23744D' },
    amber: { bg: TINT.amberSubtle, fg: '#92400E' },
    muted: { bg: TINT.grayBorder, fg: '#929298' },
  }[tone];

  return (
    <View
      style={{
        backgroundColor: colors.bg,
        width: 20,
        height: 20,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 10, color: colors.fg }}>
        {count}
      </Text>
    </View>
  );
}

/** Collapsed summary row — title + count bubble + overlapping avatars + chevron. */
function CollapsedRow({
  title,
  count,
  tone,
  subtitle,
  people,
  onPress,
}: {
  title: string;
  count: number;
  tone: 'green' | 'amber' | 'muted';
  subtitle: string;
  people: { avatar?: string | null; name?: string | null }[];
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center bg-card rounded-xl px-4 py-3 border border-border/20 gap-3 active:opacity-80 shadow-sm"
    >
      <View style={{ minWidth: 0 }}>
        <View className="flex-row items-center gap-1.5">
          <Text className="font-sans text-sm font-semibold text-foreground">{title}</Text>
          <NumericBubble count={count} tone={tone} />
        </View>
        <Text className="font-sans text-xs text-muted-foreground" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <View className="flex-1 flex-row justify-end">
        {people.length > 0 && <AvatarStack people={people} size="sm" max={4} />}
      </View>
      <ChevronRight size={18} color={TINT.grayStrong} strokeWidth={2} />
    </Pressable>
  );
}

/** Connected grid cell — avatar (vibe ring / free dot) + name + subtitle. */
function GridCell({
  friend,
  vibe,
  freeToday,
  lastHungOut,
  onPress,
}: {
  friend: any;
  vibe?: string | null;
  freeToday?: boolean;
  lastHungOut?: Date | undefined;
  onPress: () => void;
}) {
  const stage = streakStage(lastHungOut);
  const subtitle = friendSubtitle(vibe, freeToday, lastHungOut);

  return (
    <View style={{ width: '33.333%', paddingHorizontal: 6, marginBottom: 18 }}>
      <Pressable onPress={onPress} className="items-center gap-1.5 active:opacity-80">
        <View style={{ position: 'relative' }}>
          <View
            style={
              vibe
                ? { borderWidth: 2, borderColor: '#23744D', borderRadius: 999, padding: 2 }
                : freeToday
                ? { borderWidth: 2, borderColor: 'rgba(61,140,100,0.5)', borderRadius: 999, padding: 2 }
                : { padding: 4 }
            }
          >
            <Avatar url={friend.avatar} displayName={friend.name} size="lg" />
          </View>

          {freeToday && (
            <View
              style={{
                position: 'absolute',
                bottom: 2,
                right: 2,
                width: 16,
                height: 16,
                borderRadius: 999,
                backgroundColor: '#3D8C64',
                borderWidth: 2,
                borderColor: '#FFFFFF',
              }}
            />
          )}
        </View>

        <View className="flex-row items-center gap-1" style={{ maxWidth: '100%' }}>
          <Text
            className="font-sans font-medium text-foreground text-[13px]"
            numberOfLines={1}
            style={{ flexShrink: 1 }}
          >
            {friend.name}
          </Text>
          {stage !== 'none' && stage !== 'cold' && (
            <Flame
              size={11}
              color={STREAK_COLORS[stage]}
              strokeWidth={2.2}
              fill={stage === 'hot' ? STREAK_COLORS[stage] : 'transparent'}
            />
          )}
        </View>
        <Text
          className="font-sans text-[11px] text-muted-foreground text-center"
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      </Pressable>
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
  const tabBarHeight = useFloatingTabBarHeight();
  const { user } = useAuth();
  const setUserId = usePlannerStore((s) => s.setUserId);
  const loadAllData = usePlannerStore((s) => s.loadAllData);
  const friends = usePlannerStore((s) => s.friends);
  const isLoading = usePlannerStore((s) => s.isLoading);
  const { data: friendData } = useFriendDashboardData();
  const { data: lastHungOutMap } = useLastHungOut();
  const { data: pods } = usePods();

  const [search, setSearch] = useState('');
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
  const pending = filtered.filter((f) => f.status === 'pending');
  const invited = filtered.filter((f) => f.status === 'invited');

  // Pending summary: split incoming vs outgoing for the subtitle
  const pendingIncoming = pending.filter((f) => (f as any).isIncoming === true).length;
  const pendingOutgoing = pending.length - pendingIncoming;
  const pendingSubtitle = (() => {
    const parts: string[] = [];
    if (pendingIncoming > 0) parts.push(`${pendingIncoming} received`);
    if (pendingOutgoing > 0) parts.push(`${pendingOutgoing} sent`);
    return parts.length ? parts.join(' · ') : 'Tap to review';
  })();

  // Pods summary: unique connected friends who belong to any pod
  const friendsById = useMemo(() => {
    const m = new Map<string, { name: string; avatar?: string | null }>();
    for (const f of friends) {
      if (f.friendUserId) m.set(f.friendUserId, { name: f.name, avatar: f.avatar });
    }
    return m;
  }, [friends]);

  const podMemberPeople = useMemo(() => {
    const seen = new Set<string>();
    const people: { name: string; avatar?: string | null }[] = [];
    for (const pod of pods ?? []) {
      for (const id of pod.memberIds) {
        if (seen.has(id)) continue;
        const f = friendsById.get(id);
        if (f) {
          seen.add(id);
          people.push(f);
        }
      }
    }
    return people;
  }, [pods, friendsById]);

  const podCount = pods?.length ?? 0;
  const podsSubtitle =
    podCount === 0
      ? 'Group friends to plan faster'
      : `${podMemberPeople.length} friend${podMemberPeople.length === 1 ? '' : 's'} grouped`;

  const showEmpty = !isLoading && friends.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: tabBarHeight }}
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
            {/* Pending — collapsed summary row */}
            {pending.length > 0 && (
              <CollapsedRow
                title="Pending"
                count={pending.length}
                tone="amber"
                subtitle={pendingSubtitle}
                people={pending.map((f) => ({ avatar: f.avatar, name: f.name }))}
                onPress={() => router.push('/(app)/pending-requests')}
              />
            )}

            {/* Pods — collapsed summary row (only when there are friends) */}
            {connected.length > 0 &&
              (podCount > 0 ? (
                <CollapsedRow
                  title="Pods"
                  count={podCount}
                  tone="green"
                  subtitle={podsSubtitle}
                  people={podMemberPeople}
                  onPress={() => router.push('/(app)/pods')}
                />
              ) : (
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
                  <Pressable
                    onPress={() => router.push('/(app)/new-pod')}
                    className="bg-card rounded-xl border border-dashed border-border/40 px-4 py-3 active:opacity-70"
                  >
                    <Text className="font-sans text-xs text-muted-foreground text-center">
                      Group friends into pods to make planning easier — like
                      "close friends" or "brunch crew".
                    </Text>
                  </Pressable>
                </View>
              ))}

            {/* Connected — 3-per-row avatar grid */}
            {connected.length > 0 && (
              <View className="gap-2">
                <View className="flex-row items-center justify-between mb-1 px-1">
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

                <View className="flex-row flex-wrap" style={{ marginHorizontal: -6 }}>
                  {connected.map((friend) => {
                    const { vibe, freeToday } = enrich(friend.friendUserId);
                    const lastHungOut = friend.friendUserId
                      ? lastHungOutMap?.get(friend.friendUserId)
                      : undefined;
                    return (
                      <GridCell
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
              </View>
            )}

            {/* Invited */}
            {invited.length > 0 && (
              <View className="gap-2">
                <View className="flex-row items-center gap-1.5 px-1 mb-1">
                  <NumericBubble count={invited.length} tone="muted" />
                  <Text className="font-sans text-sm font-semibold text-foreground">
                    Invited
                  </Text>
                </View>
                {invited.map((friend) => (
                  <Pressable
                    key={friend.id}
                    onPress={() => router.push(`/(app)/friend/${friend.id}`)}
                    className="flex-row items-center bg-card rounded-xl px-3 py-2.5 border border-border/20 gap-3 active:opacity-80 shadow-sm"
                  >
                    <Avatar url={friend.avatar} displayName={friend.name} size="md" />
                    <View className="flex-1 min-w-0">
                      <Text
                        className="font-sans font-medium text-foreground text-sm"
                        numberOfLines={1}
                      >
                        {friend.name}
                      </Text>
                      <Text className="font-sans text-xs text-muted-foreground">
                        Invited
                      </Text>
                    </View>
                    <ChevronRight size={16} color={TINT.grayStrong} strokeWidth={2} />
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
