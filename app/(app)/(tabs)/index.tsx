import {
  ScrollView,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell } from 'lucide-react-native';
import { router } from 'expo-router';
import { useCallback, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Avatar } from '@/components/primitives/Avatar';
import { formatDisplayName } from '@/lib/utils';
import { usePlannerStore } from '@/stores/plannerStore';

function useProfile(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, display_name, first_name, last_name, avatar_url')
        .eq('user_id', userId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

function greeting(name: string) {
  const hour = new Date().getHours();
  if (hour < 12) return `Good morning, ${name} ☀️`;
  if (hour < 17) return `Hey, ${name} 👋`;
  return `Good evening, ${name} 🌙`;
}

export default function HomeTab() {
  const { user } = useAuth();
  const setUserId = usePlannerStore((s) => s.setUserId);
  const loadAllData = usePlannerStore((s) => s.loadAllData);
  const { data: profile, isLoading, refetch } = useProfile(user?.id);
  const [refreshing, setRefreshing] = useState(false);

  // Bootstrap the planner store on first mount
  useEffect(() => {
    if (user?.id) {
      setUserId(user.id);
      loadAllData();
    }
  }, [user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), loadAllData(true)]);
    setRefreshing(false);
  }, [refetch, loadAllData]);

  const firstName = profile
    ? formatDisplayName({
        firstName: profile.first_name,
        displayName: profile.display_name,
      })
    : '';

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-8"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#DDA73A" />
        }
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
          <View className="flex-row items-center gap-3">
            <Avatar
              url={profile?.avatar_url}
              firstName={profile?.first_name}
              displayName={profile?.display_name}
              size="sm"
            />
            <Text style={{ fontFamily: 'CormorantGaramond_500Medium' }} className="text-3xl text-evergreen">
              Parade<Text className="text-marigold">.</Text>
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/(app)/notifications')}
            className="w-10 h-10 rounded-full bg-evergreen/8 items-center justify-center"
            hitSlop={8}
          >
            <Bell size={20} color="#2F4A3E" strokeWidth={1.75} />
          </Pressable>
        </View>

        {/* Greeting */}
        {isLoading ? (
          <ActivityIndicator className="mt-6" color="#DDA73A" />
        ) : (
          <View className="px-5 pt-2 pb-5 gap-1">
            <Text className="font-sans font-semibold text-evergreen text-2xl">
              {greeting(firstName || 'there')}
            </Text>
            <Text className="font-sans text-sm text-foreground/60">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
          </View>
        )}

        {/* Placeholder widgets — fleshed out in Block 3 */}
        <View className="px-5 gap-4">
          <PlaceholderCard title="Friend vibes" subtitle="Who's free this weekend" />
          <PlaceholderCard title="Your free windows" subtitle="Open time this week" />
          <PlaceholderCard title="Upcoming plans" subtitle="What's on the calendar" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PlaceholderCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View className="bg-white rounded-3xl p-5 gap-1 border border-border/40">
      <Text className="font-sans font-medium text-evergreen text-base">{title}</Text>
      <Text className="font-sans text-sm text-foreground/50">{subtitle}</Text>
      <View className="mt-3 h-20 bg-chalk rounded-2xl items-center justify-center">
        <Text className="font-sans text-xs text-foreground/30">Loading…</Text>
      </View>
    </View>
  );
}
