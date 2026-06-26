/**
 * FriendMultiSelect — titled list of connected friends with multi-select
 * checkboxes. Used by the trip form for "Traveling with" (companions) and
 * "Friends to see" (people to visit). Mirrors FriendSelector's row styling.
 */
import { View, Text, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Avatar } from '@/components/primitives/Avatar';
import { CheckCircle } from '@/components/primitives/CheckCircle';
import type { Friend } from '@/types/planner';

export function FriendMultiSelect({
  title,
  hint,
  connectedFriends,
  selectedIds,
  onToggle,
}: {
  title: string;
  hint?: string;
  connectedFriends: Friend[];
  selectedIds: Set<string>;
  onToggle: (friendUserId: string) => void;
}) {
  if (connectedFriends.length === 0) return null;

  return (
    <View>
      <View className="flex-row items-center justify-between mb-2 px-0.5">
        <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </Text>
        {selectedIds.size > 0 && (
          <Text className="font-sans text-[11px] font-semibold text-primary">
            {selectedIds.size} selected
          </Text>
        )}
      </View>
      <View className="bg-card rounded-2xl border border-border/30 shadow-sm overflow-hidden">
        {connectedFriends.map((f, i) => {
          const checked = selectedIds.has(f.friendUserId!);
          return (
            <View key={f.id}>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); onToggle(f.friendUserId!); }}
                className="flex-row items-center px-4 py-3 gap-3 active:bg-muted/30"
              >
                <Avatar url={f.avatar} displayName={f.name} size="sm" />
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
      {hint && (
        <Text className="font-sans text-[11px] text-muted-foreground mt-1.5 px-0.5">
          {hint}
        </Text>
      )}
    </View>
  );
}
