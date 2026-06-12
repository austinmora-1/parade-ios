/**
 * FriendVibeStrip — "Who's around this week"
 * Horizontal scroll of wider friend pills. Each pill shows avatar + name +
 * the count of top prioritized mutual slots (≤5, preferred social times
 * first). Matches PWA FriendVibeStrip; tap → suggest-hang slot picker.
 */
import { ScrollView, View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { MapPin } from 'lucide-react-native';
import { usePlannerStore } from '@/stores/plannerStore';
import { useFriendDashboardData } from '@/hooks/useFriendDashboardData';
import { Avatar } from '@/components/primitives/Avatar';
import { Skeleton } from '@/components/primitives/Skeleton';
import { formatDisplayName } from '@/lib/utils';

export function FriendVibeStrip() {
  const friends = usePlannerStore((s) => s.friends);
  const { data: friendData, isLoading } = useFriendDashboardData();

  const connected = friends.filter((f) => f.status === 'connected' && f.friendUserId);

  if (connected.length === 0) return null;
  // If filtering eliminated everyone (different cities / no mutual slots),
  // hide the section so the dashboard doesn't show an empty header.
  if (!isLoading && (friendData?.length ?? 0) === 0) return null;

  return (
    <View className="gap-3">
      {/* Section eyebrow — matches PWA "text-[10px] font-semibold uppercase tracking-wider" */}
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
              className="bg-card border border-border/30 rounded-[28px] px-3.5 py-3 flex-row items-center gap-3 shadow-sm"
              style={{ width: 220 }}
            >
              <Skeleton width={44} height={44} rounded="rounded-full" />
              <View className="flex-1 gap-1.5">
                <Skeleton width={64} height={10} />
                <Skeleton width={88} height={12} />
                <Skeleton width={50} height={10} />
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
          {(friendData ?? []).map((vibeData) => {
            const friend = connected.find((f) => f.friendUserId === vibeData.userId);
            if (!friend) return null;
            const displayName = formatDisplayName({
              firstName: vibeData.firstName,
              lastName: vibeData.lastName,
              displayName: vibeData.displayName ?? friend.name,
            });
            const firstName = displayName.split(' ')[0];
            const slotCount = vibeData.freeSlotCount;

            return (
              <Pressable
                key={friend.id}
                onPress={() => router.push(`/(app)/suggest-hang?friendId=${friend.friendUserId}`)}
                className="bg-card border border-border/30 rounded-[28px] px-3.5 py-3 flex-row items-center gap-3 shadow-sm active:opacity-80"
                style={{ width: 220 }}
              >
                <Avatar
                  url={vibeData.avatarUrl ?? friend.avatar}
                  displayName={friend.name}
                  size="md"
                />

                {/* City + Name + overlap slot count */}
                <View className="flex-1 gap-0.5">
                  {vibeData.city ? (
                    <View className="flex-row items-center gap-1">
                      <MapPin size={10} color="#929298" strokeWidth={2} />
                      <Text
                        className="font-sans text-[10px] text-muted-foreground uppercase tracking-wider"
                        numberOfLines={1}
                      >
                        {vibeData.city}
                      </Text>
                    </View>
                  ) : null}
                  <Text
                    className="text-evergreen"
                    style={{
                      fontFamily: 'Fraunces_700Bold',
                      fontSize: 17,
                      lineHeight: 20,
                    }}
                    numberOfLines={1}
                  >
                    {firstName}
                  </Text>
                  <Text className="font-sans text-[11px] font-semibold text-primary">
                    {slotCount} slot{slotCount === 1 ? '' : 's'} w/ you
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
