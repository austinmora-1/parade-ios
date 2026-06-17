/**
 * Trips — full list of the user's trips & visits, split into Upcoming and
 * Past. Reached from the "Trips" button in the Plans & Trips tab header.
 *
 * Visit-vs-trip visual rule mirrors UpcomingTripsWidget: destination in the
 * user's home city = visit (green / Home icon); anywhere else = trip
 * (ember / Plane icon). Tap → trip detail.
 */
import { ScrollView, View, Text, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { Plane, Home, Clock, Plus, MapPinned } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { usePlannerStore } from '@/stores/plannerStore';
import { Avatar } from '@/components/primitives/Avatar';
import { Skeleton } from '@/components/primitives/Skeleton';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { formatCityForDisplay } from '@/lib/formatCity';
import { formatDisplayName } from '@/lib/utils';
import { getTravelKind } from '@/lib/visitVsTrip';
import { PARADE_GREEN, EMBER, ELEPHANT } from '@/lib/colors';

interface TripRow {
  id: string;
  name: string | null;
  location: string | null;
  start_date: string;
  end_date: string;
  friendProfiles: { name: string; avatar: string | null }[];
}

/** All of the user's trips, newest-relevant first, with friend profiles. */
function useAllTrips(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['all-trips', userId],
    staleTime: 60_000,
    queryFn: async (): Promise<TripRow[]> => {
      const { data: trips } = await (supabase as any)
        .from('trips')
        .select('id, name, location, start_date, end_date, priority_friend_ids')
        .eq('user_id', userId!)
        .order('start_date', { ascending: true });

      if (!trips?.length) return [];

      const friendIds = [
        ...new Set(trips.flatMap((t: any) => t.priority_friend_ids ?? [])),
      ] as string[];

      const profileMap = new Map<string, { name: string; avatar: string | null }>();
      if (friendIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name, first_name, last_name, avatar_url')
          .in('user_id', friendIds);
        for (const p of (profiles ?? []) as any[]) {
          profileMap.set(p.user_id, {
            name: formatDisplayName({
              firstName: p.first_name,
              lastName: p.last_name,
              displayName: p.display_name,
            }),
            avatar: p.avatar_url,
          });
        }
      }

      return trips.map((t: any): TripRow => ({
        id: t.id,
        name: t.name,
        location: t.location,
        start_date: t.start_date,
        end_date: t.end_date,
        friendProfiles: (t.priority_friend_ids ?? [])
          .map((id: string) => profileMap.get(id))
          .filter(Boolean),
      }));
    },
  });
}

function TripCard({
  trip,
  homeAddress,
  todayStr,
  past,
}: {
  trip: TripRow;
  homeAddress: string | null;
  todayStr: string;
  past: boolean;
}) {
  const isVisit = getTravelKind(trip.location, [homeAddress]) === 'visit';
  const accent = past ? '#C9C2B4' : isVisit ? PARADE_GREEN : EMBER;
  const Icon = isVisit ? Home : Plane;
  const city = trip.location
    ? formatCityForDisplay(trip.location) || trip.location.split(',')[0]
    : null;
  const title =
    trip.name || (city ? `${isVisit ? 'Visit' : 'Trip'} to ${city}` : isVisit ? 'Visit' : 'Trip');
  const inProgress = trip.start_date <= todayStr && trip.end_date >= todayStr;
  const sameYear = trip.start_date.slice(0, 4) === trip.end_date.slice(0, 4);
  const startFmt = past && !sameYear ? 'MMM d, yyyy' : 'MMM d';

  return (
    <Pressable
      onPress={() => router.push(`/(app)/trip/${trip.id}`)}
      className={`bg-card rounded-2xl border border-border/30 overflow-hidden flex-row shadow-sm active:opacity-80 ${
        past ? 'opacity-80' : ''
      }`}
    >
      <View style={{ width: 4, backgroundColor: accent }} />
      <View className="flex-1 px-4 py-3 gap-1">
        <View className="flex-row items-center gap-2">
          <Icon size={15} color={accent} strokeWidth={2} />
          <Text className="font-display text-[17px] text-evergreen flex-1" numberOfLines={1}>
            {title}
          </Text>
          {inProgress && (
            <View className="bg-primary rounded-full px-2 py-0.5">
              <Text className="font-sans text-[9px] font-semibold text-white uppercase tracking-wide">
                In progress
              </Text>
            </View>
          )}
        </View>

        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-1">
            <Clock size={11} color={ELEPHANT} strokeWidth={1.75} />
            <Text className="font-sans text-xs text-muted-foreground">
              {format(parseISO(trip.start_date), startFmt)} – {format(parseISO(trip.end_date), 'MMM d')}
            </Text>
          </View>
          {trip.friendProfiles.length > 0 && (
            <View className="flex-row" style={{ gap: -6 }}>
              {trip.friendProfiles.slice(0, 4).map((p, i) => (
                <Avatar
                  key={i}
                  url={p.avatar}
                  displayName={p.name}
                  size="xs"
                  className="border border-white"
                />
              ))}
              {trip.friendProfiles.length > 4 && (
                <View className="w-5 h-5 rounded-full bg-muted border border-white items-center justify-center">
                  <Text className="font-sans text-[8px] font-medium text-muted-foreground">
                    +{trip.friendProfiles.length - 4}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function SectionLabel({ children, count }: { children: string; count?: number }) {
  return (
    <View className="flex-row items-center gap-1.5 px-1">
      <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {children}
      </Text>
      {count != null && count > 0 && (
        <View className="bg-muted rounded-full px-2 py-0.5">
          <Text className="font-sans text-xs text-muted-foreground font-medium">{count}</Text>
        </View>
      )}
    </View>
  );
}

export default function TripsScreen() {
  const { user } = useAuth();
  const homeAddress = usePlannerStore((s) => s.homeAddress);
  const { data: trips, isLoading, refetch } = useAllTrips(user?.id);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const upcoming = (trips ?? []).filter((t) => t.end_date >= todayStr);
  const past = (trips ?? [])
    .filter((t) => t.end_date < todayStr)
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1));

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      <ScreenHeader
        title="Trips"
        rightAction={
          <Pressable
            onPress={() => router.push('/(app)/new-trip')}
            hitSlop={8}
            className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
          >
            <Plus size={20} color={PARADE_GREEN} strokeWidth={2.2} />
          </Pressable>
        }
      />

      {isLoading && !refreshing ? (
        <View className="px-5 pt-3 gap-2">
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              className="bg-card rounded-2xl border border-border/30 overflow-hidden flex-row shadow-sm"
            >
              <View style={{ width: 4, backgroundColor: '#DDD8CE' }} />
              <View className="flex-1 px-4 py-3.5 gap-1.5">
                <Skeleton width="55%" height={14} />
                <Skeleton width="35%" height={10} />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="px-5 pt-3 pb-10 gap-5"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PARADE_GREEN} />
          }
        >
          {upcoming.length === 0 && past.length === 0 ? (
            <View className="bg-card rounded-2xl border border-dashed border-border/40 px-4 py-10 items-center gap-2 mt-4">
              <MapPinned size={36} color={ELEPHANT} strokeWidth={1.5} />
              <Text className="font-sans text-sm text-muted-foreground mt-1">No trips yet</Text>
              <Text className="font-sans text-xs text-muted-foreground/60 text-center">
                Plan a trip or visit so friends know when you're around.
              </Text>
              <Pressable
                onPress={() => router.push('/(app)/new-trip')}
                className="flex-row items-center gap-1.5 mt-2 bg-primary rounded-full px-4 py-2 active:opacity-90"
              >
                <Plus size={14} color="#FFFFFF" strokeWidth={2.5} />
                <Text className="font-sans text-sm font-semibold text-white">Plan a trip</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {upcoming.length > 0 && (
                <View className="gap-2">
                  <SectionLabel count={upcoming.length}>Upcoming</SectionLabel>
                  {upcoming.map((t) => (
                    <TripCard
                      key={t.id}
                      trip={t}
                      homeAddress={homeAddress}
                      todayStr={todayStr}
                      past={false}
                    />
                  ))}
                </View>
              )}

              {past.length > 0 && (
                <View className="gap-2">
                  <SectionLabel count={past.length}>Past</SectionLabel>
                  {past.map((t) => (
                    <TripCard
                      key={t.id}
                      trip={t}
                      homeAddress={homeAddress}
                      todayStr={todayStr}
                      past
                    />
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
