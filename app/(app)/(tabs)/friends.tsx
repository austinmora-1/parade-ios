import {
  ScrollView,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useCallback, useState, useEffect, useMemo } from 'react';
import { Search, UserPlus } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';
import { Avatar } from '@/components/primitives/Avatar';

export default function FriendsTab() {
  const { user } = useAuth();
  const setUserId = usePlannerStore((s) => s.setUserId);
  const loadAllData = usePlannerStore((s) => s.loadAllData);
  const friends = usePlannerStore((s) => s.friends);
  const loading = usePlannerStore((s) => s.isLoading);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

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

  const filtered = useMemo(() => {
    if (!search.trim()) return friends;
    const q = search.toLowerCase();
    return friends.filter((f) => f.name.toLowerCase().includes(q));
  }, [friends, search]);

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-8"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#DDA73A" />
        }
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
          <Text className="font-sans font-semibold text-evergreen text-2xl">Friends</Text>
          <Pressable
            className="w-10 h-10 rounded-full bg-evergreen/8 items-center justify-center"
            hitSlop={8}
          >
            <UserPlus size={20} color="#2F4A3E" strokeWidth={1.75} />
          </Pressable>
        </View>

        {/* Search */}
        <View className="px-5 pb-3">
          <View className="flex-row items-center bg-white rounded-2xl border border-border/40 px-4 gap-3">
            <Search size={16} color="#9CB094" strokeWidth={1.75} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search friends"
              placeholderTextColor="#9CB094"
              className="flex-1 font-sans text-base text-foreground py-3"
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
        </View>

        {loading && !refreshing ? (
          <ActivityIndicator className="mt-12" color="#DDA73A" />
        ) : filtered.length === 0 ? (
          <View className="items-center justify-center py-20 px-8">
            <Text className="font-sans text-foreground/40 text-center text-base">
              {search.trim() ? 'No friends match that search.' : "You haven't added any friends yet."}
            </Text>
          </View>
        ) : (
          <View className="px-5 gap-2">
            {filtered.map((friend) => (
              <Pressable
                key={friend.id}
                onPress={() =>
                  router.push(`/(app)/friend/${friend.friendUserId ?? friend.id}`)
                }
                className="flex-row items-center bg-white rounded-2xl px-4 py-3 border border-border/30 gap-4"
              >
                <Avatar
                  url={friend.avatar}
                  displayName={friend.name}
                  size="md"
                />
                <View className="flex-1 gap-0.5">
                  <Text className="font-sans font-medium text-evergreen text-base">
                    {friend.name}
                  </Text>
                  {friend.status === 'pending' && (
                    <Text className="font-sans text-xs text-marigold">Pending</Text>
                  )}
                </View>
                {/* Vibe dot — filled in Block 3 */}
                <View className="w-2.5 h-2.5 rounded-full bg-sage/40" />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
