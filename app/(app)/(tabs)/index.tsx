import {
  ScrollView,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, Plus } from 'lucide-react-native';
import { router } from 'expo-router';
import { useCallback, useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, addDays, startOfWeek } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Avatar } from '@/components/primitives/Avatar';
import { Skeleton } from '@/components/primitives/Skeleton';
import { formatDisplayName } from '@/lib/utils';
import { usePlannerStore } from '@/stores/plannerStore';
import { useFriendDashboardData } from '@/hooks/useFriendDashboardData';
import { FriendVibeStrip } from '@/components/dashboard/FriendVibeStrip';
import { FreeWindowCard } from '@/components/dashboard/FreeWindowCard';
import { UpcomingPlansWidget } from '@/components/dashboard/UpcomingPlansWidget';

// ─── Hooks ────────────────────────────────────────────────────────────────────

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

/** Returns count of unread notifications for the current user. */
function useUnreadCount(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['unread-notifications', userId],
    staleTime: 30_000,
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId!)
        .eq('read', false);
      return (count ?? 0) as number;
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function greeting(name: string) {
  const hour = new Date().getHours();
  if (hour < 12) return `Good morning, ${name} ☀️`;
  if (hour < 17) return `Hey, ${name} 👋`;
  return `Good evening, ${name} 🌙`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomeTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const setUserId = usePlannerStore((s) => s.setUserId);
  const loadAllData = usePlannerStore((s) => s.loadAllData);
  const plans = usePlannerStore((s) => s.plans);
  const storeLoading = usePlannerStore((s) => s.isLoading);

  const { data: profile, isLoading: profileLoading, refetch } = useProfile(user?.id);
  const { data: unreadCount } = useUnreadCount(user?.id);
  const { data: friendData } = useFriendDashboardData();

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
    await Promise.all([
      refetch(),
      loadAllData(true),
      queryClient.invalidateQueries({ queryKey: ['friend-dashboard-data'] }),
      queryClient.invalidateQueries({ queryKey: ['unread-notifications'] }),
    ]);
    setRefreshing(false);
  }, [refetch, loadAllData, queryClient]);

  // ── Week-at-a-glance stats ──────────────────────────────────────────────────

  const stats = useMemo(() => {
    const now = new Date();
    const cutoff = addDays(now, 7);

    const upcomingCount = plans.filter((p) => {
      const d = p.date instanceof Date ? p.date : new Date(p.date);
      return d >= now && d <= cutoff;
    }).length;

    // Count friends free on Fri / Sat / Sun of this week
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekendDateStrs = [4, 5, 6].map((i) =>
      format(addDays(weekStart, i), 'yyyy-MM-dd'),
    );
    const friendsFreeWeekend = (friendData ?? []).filter((f) =>
      weekendDateStrs.some((d) => f.freeDates.includes(d)),
    ).length;

    return { upcomingCount, friendsFreeWeekend };
  }, [plans, friendData]);

  const firstName = profile
    ? formatDisplayName({
        firstName: profile.first_name,
        displayName: profile.display_name,
      }).split(' ')[0]
    : '';

  const hasUnread = (unreadCount ?? 0) > 0;

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-24"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#23744D" />
        }
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
          <View className="flex-row items-center gap-3">
            <Avatar
              url={profile?.avatar_url}
              firstName={profile?.first_name}
              displayName={profile?.display_name}
              size="sm"
            />
            <Text
              style={{ fontFamily: 'BungeeShade_400Regular' }}
              className="text-2xl text-parade-green"
            >
              parade
            </Text>
          </View>

          {/* Bell with unread dot */}
          <Pressable
            onPress={() => router.push('/(app)/notifications')}
            className="w-10 h-10 rounded-full bg-evergreen/8 items-center justify-center"
            hitSlop={8}
          >
            <Bell size={20} color="#2F4A3E" strokeWidth={1.75} />
            {hasUnread && (
              <View className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-ember" />
            )}
          </Pressable>
        </View>

        {/* ── Greeting ────────────────────────────────────────────────────── */}
        {profileLoading ? (
          <View className="px-5 pt-2 pb-4 gap-2">
            <Skeleton width="55%" height={24} rounded="rounded-lg" />
            <Skeleton width="35%" height={13} />
          </View>
        ) : (
          <View className="px-5 pt-2 pb-4 gap-1">
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

        {/* ── Week-at-a-glance stat pills ─────────────────────────────────── */}
        {!storeLoading && (stats.upcomingCount > 0 || stats.friendsFreeWeekend > 0) && (
          <View className="flex-row gap-2 px-5 pb-5">
            {stats.upcomingCount > 0 && (
              <View className="flex-row items-center gap-1.5 bg-evergreen/8 rounded-full px-3 py-1.5">
                <Text style={{ fontSize: 12 }}>📅</Text>
                <Text className="font-sans text-xs text-evergreen font-medium">
                  {stats.upcomingCount} {stats.upcomingCount === 1 ? 'plan' : 'plans'} this week
                </Text>
              </View>
            )}
            {stats.friendsFreeWeekend > 0 && (
              <View className="flex-row items-center gap-1.5 bg-marigold/10 rounded-full px-3 py-1.5">
                <Text style={{ fontSize: 12 }}>👥</Text>
                <Text className="font-sans text-xs text-marigold font-medium">
                  {stats.friendsFreeWeekend} free this weekend
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── Dashboard widgets ────────────────────────────────────────────── */}
        <View className="px-5 gap-6">
          <FriendVibeStrip />
          <FreeWindowCard />
          <UpcomingPlansWidget />
        </View>
      </ScrollView>

      {/* ── Floating Action Button: new plan ────────────────────────────── */}
      <Pressable
        onPress={() => router.push('/(app)/new-plan')}
        className="absolute right-5 bottom-6 active:opacity-80"
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: '#23744D',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#040A2A',
          shadowOpacity: 0.25,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        <Plus size={26} color="#FFFFFF" strokeWidth={2.5} />
      </Pressable>
    </SafeAreaView>
  );
}
