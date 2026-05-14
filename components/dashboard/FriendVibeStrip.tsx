/**
 * FriendVibeStrip — horizontal scroll of friend cards showing avatar,
 * name, current vibe, and which days this week they're free.
 * Read-only for Phase 1; tap → friend profile.
 */
import { ScrollView, View, Text, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { format, startOfWeek, addDays } from 'date-fns';
import { usePlannerStore } from '@/stores/plannerStore';
import { useFriendDashboardData } from '@/hooks/useFriendDashboardData';
import { Avatar } from '@/components/primitives/Avatar';
import { formatDisplayName } from '@/lib/utils';

const VIBE_EMOJI: Record<string, string> = {
  social: '🎉',
  chill: '🛋️',
  athletic: '🏃',
  productive: '💼',
  custom: '✨',
};

// Days of the current week as {label, dateStr}
function getWeekDays() {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    return { label: format(d, 'EEE')[0], dateStr: format(d, 'yyyy-MM-dd') };
  });
}

export function FriendVibeStrip() {
  const friends = usePlannerStore((s) => s.friends);
  const { data: friendData, isLoading } = useFriendDashboardData();

  const connected = friends.filter((f) => f.status === 'connected' && f.friendUserId);
  const weekDays = getWeekDays();
  // Only show Fri–Sun in the dot strip (the social days)
  const socialDays = weekDays.filter((_, i) => i >= 4); // Fri, Sat, Sun

  if (connected.length === 0) return null;

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between px-0.5">
        <Text className="font-sans text-xs text-foreground/40 uppercase tracking-widest">
          Friends
        </Text>
        {isLoading && <ActivityIndicator size="small" color="#9CB094" />}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-3 px-0.5 pb-1"
      >
        {connected.map((friend) => {
          const vibeData = friendData?.find((d) => d.userId === friend.friendUserId);
          const name = formatDisplayName({
            firstName: vibeData?.firstName,
            lastName: vibeData?.lastName,
            displayName: vibeData?.displayName ?? friend.name,
          });
          const firstName = name.split(' ')[0];
          const vibe = vibeData?.currentVibe;
          const freeDates = new Set(vibeData?.freeDates ?? []);

          return (
            <Pressable
              key={friend.id}
              onPress={() => router.push(`/(app)/friend/${friend.friendUserId}`)}
              className="bg-white border border-border/30 rounded-2xl p-3 gap-2 w-28 items-center"
            >
              <Avatar
                url={vibeData?.avatarUrl ?? friend.avatar}
                displayName={friend.name}
                size="md"
              />
              <Text
                className="font-sans font-medium text-evergreen text-xs text-center"
                numberOfLines={1}
              >
                {firstName}
              </Text>

              {/* Vibe tag */}
              {vibe ? (
                <View className="bg-butter/50 rounded-full px-2 py-0.5">
                  <Text className="font-sans text-evergreen text-xs">
                    {VIBE_EMOJI[vibe] ?? '✨'} {vibe}
                  </Text>
                </View>
              ) : null}

              {/* Free-day dots: Fri Sat Sun */}
              <View className="flex-row gap-1.5 items-center">
                {socialDays.map(({ label, dateStr }) => (
                  <View key={dateStr} className="items-center gap-0.5">
                    <View
                      className={`w-2 h-2 rounded-full ${
                        freeDates.has(dateStr) ? 'bg-sage' : 'bg-border'
                      }`}
                    />
                    <Text className="font-sans text-foreground/30" style={{ fontSize: 8 }}>
                      {label}
                    </Text>
                  </View>
                ))}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
