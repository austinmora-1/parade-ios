/**
 * FriendVibeStrip — "Who's around this week"
 * Horizontal scroll of wider friend pills. Each pill shows avatar + name +
 * free-days-this-week status. Matches PWA FriendVibeStrip layout.
 * Read-only for Phase 1; tap → friend profile.
 */
import { ScrollView, View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { format, startOfWeek, addDays } from 'date-fns';
import { usePlannerStore } from '@/stores/plannerStore';
import { useFriendDashboardData } from '@/hooks/useFriendDashboardData';
import { Avatar } from '@/components/primitives/Avatar';
import { Skeleton } from '@/components/primitives/Skeleton';
import { formatDisplayName } from '@/lib/utils';

/** Dates (yyyy-MM-dd) for Mon–Sun of the current week */
function currentWeekDateStrs(): string[] {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) =>
    format(addDays(weekStart, i), 'yyyy-MM-dd'),
  );
}

export function FriendVibeStrip() {
  const friends = usePlannerStore((s) => s.friends);
  const { data: friendData, isLoading } = useFriendDashboardData();

  const connected = friends.filter((f) => f.status === 'connected' && f.friendUserId);
  const weekDates = currentWeekDateStrs();

  if (connected.length === 0) return null;

  return (
    <View className="gap-3">
      {/* Section eyebrow — matches PWA "text-[11px] font-semibold uppercase tracking-wider" */}
      <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5">
        Who's around this week
      </Text>

      {isLoading ? (
        /* Skeleton — horizontal pill shape */
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2.5 px-0.5 pb-1"
          scrollEnabled={false}
        >
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              className="bg-white border border-border/30 rounded-2xl px-3 py-3 flex-row items-center gap-3 shadow-sm"
              style={{ width: 200 }}
            >
              <Skeleton width={40} height={40} rounded="rounded-full" />
              <View className="flex-1 gap-1.5">
                <Skeleton width={72} height={12} />
                <Skeleton width={88} height={10} />
              </View>
            </View>
          ))}
        </ScrollView>
      ) : (
        /* Horizontal scroll of pills */
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2.5 px-0.5 pb-1"
        >
          {connected.map((friend) => {
            const vibeData = friendData?.find((d) => d.userId === friend.friendUserId);
            const displayName = formatDisplayName({
              firstName: vibeData?.firstName,
              lastName: vibeData?.lastName,
              displayName: vibeData?.displayName ?? friend.name,
            });
            const firstName = displayName.split(' ')[0];

            // Count how many days this week the friend is free
            const freeDaysThisWeek = (vibeData?.freeDates ?? []).filter((d) =>
              weekDates.includes(d),
            ).length;

            return (
              <Pressable
                key={friend.id}
                onPress={() => router.push(`/(app)/friend/${friend.friendUserId}`)}
                className="bg-white border border-border/30 rounded-2xl px-3 py-3 flex-row items-center gap-3 shadow-sm"
                style={{ width: 200 }}
              >
                <Avatar
                  url={vibeData?.avatarUrl ?? friend.avatar}
                  displayName={friend.name}
                  size="md"
                />

                {/* Name + status */}
                <View className="flex-1 gap-0.5">
                  <Text
                    className="font-sans font-semibold text-evergreen text-sm"
                    numberOfLines={1}
                  >
                    {firstName}
                  </Text>
                  <Text className="font-sans text-xs text-muted-foreground">
                    {freeDaysThisWeek > 0
                      ? `free ${freeDaysThisWeek} day${freeDaysThisWeek > 1 ? 's' : ''} this week`
                      : 'busy this week'}
                  </Text>
                </View>

                {/* Free days badge */}
                {freeDaysThisWeek > 0 && (
                  <View className="bg-primary/10 rounded-full px-2 py-0.5">
                    <Text className="font-sans text-xs text-primary font-semibold">
                      {freeDaysThisWeek}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
