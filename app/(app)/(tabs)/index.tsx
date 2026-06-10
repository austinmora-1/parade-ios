import {
  ScrollView,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { Bell, Plus, MapPin } from 'lucide-react-native';
import { router } from 'expo-router';
import { useCallback, useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, addDays, startOfWeek, parseISO, differenceInCalendarDays } from 'date-fns';
import { formatCityForDisplay } from '@/lib/formatCity';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/primitives/Skeleton';
import { formatDisplayName } from '@/lib/utils';
import { usePlannerStore } from '@/stores/plannerStore';
import { useFriendDashboardData } from '@/hooks/useFriendDashboardData';
import { FriendVibeStrip } from '@/components/dashboard/FriendVibeStrip';
import { FreeWindowCard } from '@/components/dashboard/FreeWindowCard';
import { UpcomingPlansWidget } from '@/components/dashboard/UpcomingPlansWidget';
import { OpenInvitesWidget } from '@/components/dashboard/OpenInvitesWidget';
import { SmartPrimaryCTA } from '@/components/dashboard/SmartPrimaryCTA';
import { PolishProfileCard } from '@/components/dashboard/PolishProfileCard';
import { PushNotificationPrompt } from '@/components/dashboard/PushNotificationPrompt';
import { HangRequestsWidget } from '@/components/dashboard/HangRequestsWidget';
import { DiscoverableInvitesWidget } from '@/components/dashboard/DiscoverableInvitesWidget';
import { TripProposalInvitesWidget } from '@/components/dashboard/TripProposalInvitesWidget';

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useProfile(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'user_id, display_name, first_name, last_name, avatar_url, home_address',
        )
        .eq('user_id', userId!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });
}

/**
 * Returns walkthrough_completed flag for the current user. Used to gate the
 * first-launch EllyWalkthrough modal.
 */
function useWalkthroughStatus(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['walkthrough-status', userId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('walkthrough_completed')
        .eq('user_id', userId!)
        .maybeSingle();
      return (data?.walkthrough_completed as boolean | undefined) ?? false;
    },
  });
}

/** Next upcoming or in-progress trip/visit for the current user. */
function useNextTrip(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['next-trip', userId],
    staleTime: 60_000,
    queryFn: async () => {
      const todayStr = new Date().toISOString().slice(0, 10);
      const { data } = await (supabase as any)
        .from('trips')
        .select('id, name, location, start_date, end_date')
        .eq('user_id', userId!)
        .gte('end_date', todayStr)
        .order('start_date', { ascending: true })
        .limit(1);
      return ((data ?? [])[0] as
        | { id: string; name: string; location: string | null; start_date: string; end_date: string }
        | undefined) ?? null;
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
  const plans   = usePlannerStore((s) => s.plans);
  const friends = usePlannerStore((s) => s.friends);
  const storeLoading = usePlannerStore((s) => s.isLoading);

  const { data: profile, isLoading: profileLoading, refetch } = useProfile(user?.id);
  const { data: unreadCount } = useUnreadCount(user?.id);
  const { data: nextTrip } = useNextTrip(user?.id);
  const { data: friendData }  = useFriendDashboardData();
  const { data: walkthroughDone, isLoading: walkthroughLoading } =
    useWalkthroughStatus(user?.id);

  const [refreshing, setRefreshing] = useState(false);
  const [walkthroughTriggered, setWalkthroughTriggered] = useState(false);
  // Measured hero size so the SVG gradient can fill it with explicit pixel
  // dimensions (percentage heights in react-native-svg resolve unreliably and
  // were leaving the bottom edge of the banner uncovered).
  const [heroSize, setHeroSize] = useState({ width: 0, height: 0 });

  // Bootstrap the planner store on first mount
  useEffect(() => {
    if (user?.id) {
      setUserId(user.id);
      loadAllData();
    }
  }, [user?.id]);

  // Trigger first-launch walkthrough — /welcome for empty users (brand
  // intro), /tour for non-empty users (feature tour). Both write
  // walkthrough_completed=true on dismiss.
  useEffect(() => {
    if (walkthroughTriggered) return;
    if (walkthroughLoading || storeLoading) return;
    if (walkthroughDone) return;
    if (!user?.id) return;
    setWalkthroughTriggered(true);
    const connectedCount = friends.filter((f) => f.status === 'connected').length;
    const isEmpty = connectedCount === 0 && plans.length === 0;
    router.push(isEmpty ? '/(app)/welcome' : '/(app)/tour');
  }, [
    walkthroughTriggered, walkthroughLoading, storeLoading,
    walkthroughDone, user?.id, friends, plans.length,
  ]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refetch(),
      loadAllData(true),
      queryClient.invalidateQueries({ queryKey: ['friend-dashboard-data'] }),
      queryClient.invalidateQueries({ queryKey: ['unread-notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['next-trip'] }),
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

  // Upcoming trip/visit reminder label
  const tripLabel = useMemo(() => {
    if (!nextTrip) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = parseISO(nextTrip.start_date);
    const end = parseISO(nextTrip.end_date);
    const city = formatCityForDisplay(nextTrip.location || '') || nextTrip.name;
    if (today >= start && today <= end) return `In ${city} now`;
    const days = differenceInCalendarDays(start, today);
    if (days <= 0) return `${city} soon`;
    if (days === 1) return `${city} tomorrow`;
    if (days <= 14) return `${city} in ${days} days`;
    return `${city} · ${format(start, 'MMM d')}`;
  }, [nextTrip]);

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
        {/* ── Greeting hero (gradient banner) ─────────────────────────────── */}
        <View className="px-4 pt-3 pb-4">
          <View
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              setHeroSize((prev) =>
                prev.width === width && prev.height === height
                  ? prev
                  : { width, height },
              );
            }}
            style={{
              borderRadius: 24,
              overflow: 'hidden',
              shadowColor: '#040A2A',
              shadowOpacity: 0.12,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
            }}
          >
            {/* SVG gradient background — explicit pixel dims from onLayout so
                it always covers the full banner (percentage heights were
                clipping the bottom edge). */}
            {heroSize.width > 0 && heroSize.height > 0 && (
              <Svg
                style={{ position: 'absolute', top: 0, left: 0 }}
                width={heroSize.width}
                height={heroSize.height}
                preserveAspectRatio="none"
              >
                <Defs>
                  <SvgLinearGradient id="heroGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <Stop offset="0%"   stopColor="#23744D" stopOpacity="1" />
                    <Stop offset="55%"  stopColor="#2F8A5C" stopOpacity="1" />
                    <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="1" />
                  </SvgLinearGradient>
                </Defs>
                <Rect
                  x="0"
                  y="0"
                  width={heroSize.width}
                  height={heroSize.height}
                  fill="url(#heroGrad)"
                />
              </Svg>
            )}
            <View className="flex-row items-center justify-between px-5 py-4">
              {/* Left: greeting + date/location */}
              <View className="flex-1 pr-3">
                {profileLoading ? (
                  <View className="gap-2">
                    <Skeleton width="70%" height={26} rounded="rounded-lg" />
                    <Skeleton width="50%" height={14} />
                  </View>
                ) : (
                  <>
                    <Text
                      className="text-white"
                      style={{
                        fontFamily: 'Fraunces_700Bold',
                        fontSize: 19,
                        lineHeight: 24,
                      }}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {greeting(firstName || 'there')}
                    </Text>
                    <View className="flex-row items-center gap-3 mt-1.5">
                      <Text
                        className="text-white/85"
                        style={{
                          fontFamily: 'Inter_400Regular',
                          fontSize: 12,
                        }}
                      >
                        {new Date().toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </Text>
                      <Pressable
                        onPress={() => router.push('/(app)/set-location')}
                        hitSlop={4}
                        className="flex-row items-center gap-1 active:opacity-70"
                      >
                        <MapPin size={11} color="#FFFFFF" strokeWidth={2} />
                        <Text
                          className="text-white"
                          style={{
                            fontFamily: 'Inter_600SemiBold',
                            fontSize: 12,
                          }}
                          numberOfLines={1}
                        >
                          {profile?.home_address || 'Set location'}
                        </Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>

              {/* Right: Bell + FAB */}
              <View className="flex-row items-center gap-2">
                <Pressable
                  onPress={() => router.push('/(app)/notifications')}
                  className="w-10 h-10 rounded-full bg-white/20 items-center justify-center active:opacity-70"
                  hitSlop={6}
                >
                  <Bell size={18} color="#FFFFFF" strokeWidth={2} />
                  {hasUnread && (
                    <View className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-ember" />
                  )}
                </Pressable>
                <Pressable
                  onPress={() => router.push('/(app)/what-planning')}
                  className="w-11 h-11 rounded-full items-center justify-center active:opacity-80"
                  hitSlop={6}
                  style={{
                    backgroundColor: '#FFFFFF',
                    shadowColor: '#040A2A',
                    shadowOpacity: 0.18,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 3 },
                    elevation: 6,
                  }}
                >
                  <Plus size={22} color="#23744D" strokeWidth={2.5} />
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        {/* ── Week-at-a-glance stat pills ─────────────────────────────────── */}
        {!storeLoading && (stats.upcomingCount > 0 || stats.friendsFreeWeekend > 0 || !!tripLabel) && (
          <View className="flex-row flex-wrap gap-2 px-5 pb-5">
            {tripLabel && nextTrip && (
              <Pressable
                onPress={() => router.push(`/(app)/trip/${nextTrip.id}`)}
                className="flex-row items-center gap-1.5 bg-primary/10 rounded-full px-3 py-1.5 active:opacity-70"
              >
                <Text style={{ fontSize: 12 }}>🧳</Text>
                <Text className="font-sans text-xs text-primary font-medium">
                  {tripLabel}
                </Text>
              </Pressable>
            )}
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

        {/* ── Contextual cards (conditionally rendered) ───────────────────── */}
        <View className="px-5 gap-3 mb-3">
          <SmartPrimaryCTA />
          <PushNotificationPrompt />
          <PolishProfileCard />
        </View>

        {/* ── Dashboard widgets ────────────────────────────────────────────── */}
        <View className="px-5 gap-6">
          {/* Action-required first */}
          <HangRequestsWidget />
          <OpenInvitesWidget />
          <TripProposalInvitesWidget />
          <DiscoverableInvitesWidget />
          <FriendVibeStrip />
          <FreeWindowCard />
          <UpcomingPlansWidget />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
