/**
 * UpcomingTripsWidget — "Upcoming Trips"
 * Vertical list of the user's confirmed trips/visits in the next two months
 * (mirrors PWA UpcomingTripsAndVisits). Left accent + icon follow the
 * visit-vs-trip rule: destination in your home city = visit (green/Home),
 * anywhere else = trip (ember/Plane). Tap → trip detail.
 */
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { format, addMonths, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { Plane, Home, Clock } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { usePlannerStore } from '@/stores/plannerStore';
import { Avatar } from '@/components/primitives/Avatar';
import { Skeleton } from '@/components/primitives/Skeleton';
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

function useUpcomingTrips(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['upcoming-trips', userId],
    staleTime: 60_000,
    queryFn: async (): Promise<TripRow[]> => {
      const now = new Date();
      const { data: trips } = await (supabase as any)
        .from('trips')
        .select('id, name, location, start_date, end_date, priority_friend_ids')
        .eq('user_id', userId!)
        .gte('end_date', format(now, 'yyyy-MM-dd'))
        .lte('start_date', format(addMonths(now, 2), 'yyyy-MM-dd'))
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

export function UpcomingTripsWidget() {
  const { user } = useAuth();
  const homeAddress = usePlannerStore((s) => s.homeAddress);
  const { data: trips, isLoading } = useUpcomingTrips(user?.id);

  // No empty state — the section simply doesn't render without trips
  if (!isLoading && (trips?.length ?? 0) === 0) return null;

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  return (
    <View className="gap-3">
      {/* Section eyebrow */}
      <View className="flex-row items-center gap-1.5 px-0.5">
        <Plane size={12} color={ELEPHANT} strokeWidth={2} />
        <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Upcoming Trips
        </Text>
        {!isLoading && (trips?.length ?? 0) > 0 && (
          <View className="ml-auto bg-muted rounded-full px-2 py-0.5">
            <Text className="font-sans text-xs text-muted-foreground font-medium">
              {trips!.length}
            </Text>
          </View>
        )}
      </View>

      {isLoading ? (
        <View className="gap-2">
          {[0, 1].map((i) => (
            <View
              key={i}
              className="bg-card rounded-2xl border border-border/30 overflow-hidden flex-row shadow-sm"
            >
              <View style={{ width: 4, backgroundColor: '#DDD8CE' }} />
              <View className="flex-1 px-4 py-3.5 gap-1.5">
                <Skeleton width="55%" height={13} />
                <Skeleton width="35%" height={10} />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View className="gap-2">
          {trips!.map((trip) => {
            const isVisit = getTravelKind(trip.location, [homeAddress]) === 'visit';
            const accent = isVisit ? PARADE_GREEN : EMBER;
            const Icon = isVisit ? Home : Plane;
            const city = trip.location
              ? formatCityForDisplay(trip.location) || trip.location.split(',')[0]
              : null;
            const title = trip.name
              || (city ? `${isVisit ? 'Visit' : 'Trip'} to ${city}` : isVisit ? 'Visit' : 'Trip');
            const inProgress =
              trip.start_date <= todayStr && trip.end_date >= todayStr;

            return (
              <Pressable
                key={trip.id}
                onPress={() => router.push(`/(app)/trip/${trip.id}`)}
                className="bg-card rounded-2xl border border-border/30 overflow-hidden flex-row shadow-sm active:opacity-80"
              >
                <View style={{ width: 4, backgroundColor: accent }} />

                <View className="flex-1 px-4 py-3 gap-1">
                  <View className="flex-row items-center gap-2">
                    <Icon size={15} color={accent} strokeWidth={2} />
                    <Text
                      className="font-display text-[17px] text-evergreen flex-1"
                      numberOfLines={1}
                    >
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
                        {format(parseISO(trip.start_date), 'MMM d')} – {format(parseISO(trip.end_date), 'MMM d')}
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
          })}
        </View>
      )}
    </View>
  );
}
