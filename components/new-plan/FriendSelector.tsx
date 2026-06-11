import { View, Text, Pressable } from 'react-native';
import { Check } from 'lucide-react-native';
import { Avatar } from '@/components/primitives/Avatar';
import { TINT } from '@/lib/colors';
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
                <View
                  style={{
                    width: 22, height: 22, borderRadius: 6,
                    borderWidth: 1.5,
                    borderColor: checked ? '#23744D' : TINT.grayStrong,
                    backgroundColor: checked ? '#23744D' : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {checked && <Check size={14} color="#FFFFFF" strokeWidth={2.5} />}
                </View>
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
