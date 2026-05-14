import { ScrollView, View, Text, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronLeft, Bell } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

function useNotifications(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['notifications', userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('notifications')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function NotificationsScreen() {
  const { user } = useAuth();
  const { data: notifs, isLoading, refetch } = useNotifications(user?.id);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 gap-2">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full items-center justify-center"
          hitSlop={8}
        >
          <ChevronLeft size={24} color="#2F4A3E" strokeWidth={1.75} />
        </Pressable>
        <Text className="font-sans font-semibold text-evergreen text-xl flex-1">Notifications</Text>
      </View>

      {isLoading && !refreshing ? (
        <ActivityIndicator className="mt-16" color="#DDA73A" />
      ) : (
        <ScrollView
          contentContainerClassName="pb-8"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#DDA73A" />
          }
        >
          {(!notifs || notifs.length === 0) ? (
            <View className="items-center justify-center py-24 px-8 gap-3">
              <Bell size={40} color="#9CB094" strokeWidth={1.5} />
              <Text className="font-sans text-foreground/40 text-center text-base">
                No notifications yet.
              </Text>
            </View>
          ) : (
            <View className="px-4 gap-2 pt-2">
              {notifs.map((n: any) => (
                <View
                  key={n.id}
                  className={`bg-white rounded-2xl px-4 py-4 border gap-1 ${
                    n.read ? 'border-border/20' : 'border-marigold/40'
                  }`}
                >
                  {!n.read && (
                    <View className="absolute top-4 right-4 w-2 h-2 rounded-full bg-marigold" />
                  )}
                  <Text className="font-sans font-medium text-evergreen text-sm pr-4">
                    {n.title ?? n.type ?? 'Notification'}
                  </Text>
                  {n.body ? (
                    <Text className="font-sans text-sm text-foreground/60 leading-relaxed">
                      {n.body}
                    </Text>
                  ) : null}
                  <Text className="font-sans text-xs text-foreground/30 mt-1">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
