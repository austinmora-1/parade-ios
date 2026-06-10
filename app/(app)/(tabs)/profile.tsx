/**
 * Profile tab — matches PWA Profile page layout.
 *
 * Structure:
 *  1. Top-right action icons: Bell (notifications) + Settings (gear)
 *  2. Hero card: cover banner + overlapping left-aligned avatar
 *  3. Name (Fraunces) + bio
 *  4. Stats row: Friends · Hangouts · Upcoming (Fraunces numbers)
 *  5. (Future: Vibe/intentions, plan history cards — Phase 2+)
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Bell, Settings } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { usePlannerStore } from '@/stores/plannerStore';
import { Avatar } from '@/components/primitives/Avatar';
import { Skeleton } from '@/components/primitives/Skeleton';
import { formatDisplayName } from '@/lib/utils';
import { WeeklyIntentionCard } from '@/components/profile/WeeklyIntentionCard';
import { QuickStatsCard } from '@/components/profile/QuickStatsCard';
import { PlanHistorySection } from '@/components/profile/PlanHistorySection';
import { TC } from '@/lib/theme';

// ─── Profile query ────────────────────────────────────────────────────────────

function useProfile(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'user_id, display_name, first_name, last_name, avatar_url, bio, created_at, current_vibe, neighborhood, home_address',
        )
        .eq('user_id', userId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatItem({ value, label }: { value: number; label: string }) {
  return (
    <View className="items-center">
      <Text className="font-display text-lg text-foreground">{value}</Text>
      <Text className="font-sans text-xs text-muted-foreground mt-0.5">{label}</Text>
    </View>
  );
}

// ─── Main tab ────────────────────────────────────────────────────────────────

export default function ProfileTab() {
  const { user } = useAuth();
  const friends = usePlannerStore((s) => s.friends);
  const plans   = usePlannerStore((s) => s.plans);
  const { data: profile, isLoading, refetch } = useProfile(user?.id);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const now = new Date();
  const friendCount   = friends.filter((f) => f.status === 'connected').length;
  const hangoutCount  = plans.filter((p) => {
    const d = p.date instanceof Date ? p.date : new Date(p.date);
    return d < now;
  }).length;
  const upcomingCount = plans.filter((p) => {
    const d = p.date instanceof Date ? p.date : new Date(p.date);
    return d >= now;
  }).length;

  const displayName = profile
    ? formatDisplayName({
        firstName:   profile.first_name,
        lastName:    profile.last_name,
        displayName: profile.display_name,
      })
    : '';

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-10"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#23744D"
          />
        }
      >
        {/* ── Top-right action icons ───────────────────────────────────── */}
        <View className="flex-row items-center justify-end gap-1 px-3 pt-2 pb-1">
          <Pressable
            onPress={() => router.push('/(app)/notifications')}
            hitSlop={6}
            className="w-9 h-9 items-center justify-center rounded-full active:opacity-70"
          >
            <Bell size={20} color={TC.icon} strokeWidth={1.75} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/(app)/settings')}
            hitSlop={6}
            className="w-9 h-9 items-center justify-center rounded-full active:opacity-70"
          >
            <Settings size={20} color={TC.icon} strokeWidth={1.75} />
          </Pressable>
        </View>

        {/* ── Hero card ────────────────────────────────────────────────── */}
        <View className="mx-5 bg-card rounded-2xl border border-border/30 overflow-hidden shadow-sm">
          {/* Cover banner — gradient-style muted primary */}
          <View
            style={{
              height: 96,
              backgroundColor: 'rgba(35,116,77,0.12)',
            }}
          />

          {/* Content */}
          <View className="px-4 pb-4">
            {/* Avatar (overlaps banner, left-aligned, white ring) */}
            <View style={{ marginTop: -36, marginBottom: 12, alignSelf: 'flex-start' }}>
              <View
                style={{
                  borderWidth: 4,
                  borderColor: '#FFFFFF',
                  borderRadius: 999,
                  shadowColor: '#040A2A',
                  shadowOpacity: 0.08,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 2 },
                }}
              >
                <Avatar
                  url={profile?.avatar_url}
                  firstName={profile?.first_name}
                  lastName={profile?.last_name}
                  displayName={profile?.display_name}
                  size="xl"
                />
              </View>
            </View>

            {/* Name */}
            {isLoading ? (
              <Skeleton width="60%" height={22} rounded="rounded-md" />
            ) : (
              <Text className="font-display text-xl text-foreground" numberOfLines={1}>
                {displayName || 'Your Name'}
              </Text>
            )}

            {/* @handle */}
            {profile?.display_name ? (
              <Text className="font-sans text-sm text-muted-foreground mt-0.5">
                @{profile.display_name}
              </Text>
            ) : null}

            {/* Bio */}
            {profile?.bio ? (
              <Text className="font-sans text-sm text-foreground/70 mt-2 leading-relaxed">
                {profile.bio}
              </Text>
            ) : null}

            {/* Stats row */}
            <View className="flex-row gap-5 pt-3 mt-2">
              <StatItem value={friendCount}   label="Friends"  />
              <StatItem value={hangoutCount}  label="Hangouts" />
              <StatItem value={upcomingCount} label="Upcoming" />
            </View>
          </View>
        </View>

        {/* ── Weekly intention + vibe ───────────────────────────────────── */}
        <View className="px-5 pt-4">
          <WeeklyIntentionCard currentVibe={(profile as any)?.current_vibe ?? null} />
        </View>

        {/* ── Quick stats (this week) ───────────────────────────────────── */}
        <View className="px-5 pt-3">
          <QuickStatsCard currentVibe={(profile as any)?.current_vibe ?? null} />
        </View>

        {/* ── Plan history (collapsible) ───────────────────────────────── */}
        <View className="px-5 pt-3">
          <PlanHistorySection />
        </View>

        {/* ── Edit profile CTA ──────────────────────────────────────────── */}
        <View className="px-5 pt-4">
          <Pressable
            onPress={() => router.push('/(app)/edit-profile')}
            className="bg-card rounded-2xl border border-border/30 px-4 py-3.5 items-center shadow-sm active:opacity-70"
          >
            <Text className="font-sans text-sm font-semibold text-primary">
              Edit profile
            </Text>
          </Pressable>
        </View>

        {/* ── Member since (small footer) ──────────────────────────────── */}
        {profile?.created_at && (
          <View className="px-5 pt-4 items-center">
            <Text className="font-sans text-xs text-muted-foreground">
              Member since{' '}
              {new Date(profile.created_at).toLocaleDateString('en-US', {
                month: 'long',
                year:  'numeric',
              })}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
