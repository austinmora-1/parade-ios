/**
 * Pods — secondary management page off the Friends tab.
 *
 * Lists every pod the user owns with a summary of its members (overlapping
 * avatars + names). Tap a pod to edit it; "+ New pod" to create one.
 */
import { ScrollView, View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Plus, ChevronRight } from 'lucide-react-native';
import { usePlannerStore } from '@/stores/plannerStore';
import { usePods } from '@/hooks/usePods';
import { AvatarStack } from '@/components/primitives/AvatarStack';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';

export default function PodsScreen() {
  const friends = usePlannerStore((s) => s.friends);
  const { data: pods } = usePods();

  /** friend_user_id → { name, avatar } for member lookups */
  const friendsById = useMemo(() => {
    const m = new Map<string, { name: string; avatar?: string | null }>();
    for (const f of friends) {
      if (f.friendUserId) m.set(f.friendUserId, { name: f.name, avatar: f.avatar });
    }
    return m;
  }, [friends]);

  const onNewPod = () => router.push('/(app)/new-pod');

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      <ScreenHeader
        title="Pods"
        rightAction={
          <Pressable
            onPress={onNewPod}
            hitSlop={6}
            className="flex-row items-center gap-1 bg-primary rounded-full px-3 py-1.5 active:opacity-80"
          >
            <Plus size={14} color="#FFFFFF" strokeWidth={2.4} />
            <Text className="font-sans text-[12px] font-semibold text-white">New</Text>
          </Pressable>
        }
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {(pods?.length ?? 0) === 0 ? (
          <View className="items-center py-16 px-8 gap-3">
            <Text style={{ fontSize: 32 }}>💜</Text>
            <Text className="font-sans text-sm font-semibold text-foreground text-center">
              No pods yet
            </Text>
            <Text className="font-sans text-xs text-muted-foreground text-center">
              Group friends into pods — like "close friends" or "brunch crew" — to
              make planning faster.
            </Text>
            <Pressable
              onPress={onNewPod}
              className="flex-row items-center gap-1.5 bg-primary rounded-xl px-4 py-2.5 mt-2 active:opacity-80"
            >
              <Plus size={14} color="#FFFFFF" strokeWidth={2.2} />
              <Text className="font-sans text-sm font-semibold text-white">
                Create a pod
              </Text>
            </Pressable>
          </View>
        ) : (
          <View className="px-5 pt-2 gap-3">
            {pods!.map((pod) => {
              const members = pod.memberIds
                .map((id) => friendsById.get(id))
                .filter(Boolean) as { name: string; avatar?: string | null }[];
              const names = members.map((m) => m.name);
              const summary =
                names.length === 0
                  ? 'No members yet'
                  : names.length <= 2
                  ? names.join(' & ')
                  : `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;

              return (
                <Pressable
                  key={pod.id}
                  onPress={() => router.push(`/(app)/new-pod?podId=${pod.id}`)}
                  className="bg-card rounded-2xl border border-border/20 px-4 py-3.5 gap-3 active:opacity-80 shadow-sm"
                >
                  <View className="flex-row items-center gap-3">
                    <Text style={{ fontSize: 22 }}>{pod.emoji ?? '💜'}</Text>
                    <View className="flex-1 min-w-0">
                      <Text
                        className="font-sans text-base font-semibold text-foreground"
                        numberOfLines={1}
                      >
                        {pod.name}
                      </Text>
                      <Text className="font-sans text-xs text-muted-foreground">
                        {pod.memberIds.length} member
                        {pod.memberIds.length === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <ChevronRight size={18} color="#929298" strokeWidth={2} />
                  </View>

                  <View className="flex-row items-center gap-3">
                    {members.length > 0 && (
                      <AvatarStack people={members} size="sm" max={6} />
                    )}
                    <Text
                      className="font-sans text-xs text-muted-foreground flex-1"
                      numberOfLines={1}
                    >
                      {summary}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
