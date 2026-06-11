import { View, Text, Pressable } from 'react-native';
import { Avatar } from '@/components/primitives/Avatar';
import { CheckCircle } from '@/components/primitives/CheckCircle';
import type { Friend } from '@/types/planner';

export function FriendSelector({
  connectedFriends,
  invitedIds,
  onToggle,
}: {
  connectedFriends: Friend[];
  invitedIds: Set<string>;
  onToggle: (friendUserId: string) => void;
}) {
  return (
    <View>
      <View className="flex-row items-center justify-between mb-2 px-0.5">
        <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Invite friends
        </Text>
        {invitedIds.size > 0 && (
          <Text className="font-sans text-[11px] font-semibold text-primary">
            {invitedIds.size} selected
          </Text>
        )}
      </View>
      <View className="bg-card rounded-2xl border border-border/30 shadow-sm overflow-hidden">
        {connectedFriends.map((f, i) => {
          const checked = invitedIds.has(f.friendUserId!);
          return (
            <View key={f.id}>
              <Pressable
                onPress={() => onToggle(f.friendUserId!)}
                className="flex-row items-center px-4 py-3 gap-3 active:bg-muted/30"
              >
                <Avatar
                  url={f.avatar}
                  displayName={f.name}
                  size="sm"
                />
                <Text
                  className="flex-1 font-sans text-sm font-medium text-foreground"
                  numberOfLines={1}
                >
                  {f.name}
                </Text>
                <CheckCircle checked={checked} size={22} radius={6} checkSize={14} />
              </Pressable>
              {i < connectedFriends.length - 1 && (
                <View className="h-px bg-border/30 mx-4" />
              )}
            </View>
          );
        })}
      </View>
      {invitedIds.size > 0 && (
        <Text className="font-sans text-[11px] text-muted-foreground mt-1.5 px-0.5">
          Plan will be sent as a proposal — they'll see it in their feed
          and can RSVP.
        </Text>
      )}
    </View>
  );
}
