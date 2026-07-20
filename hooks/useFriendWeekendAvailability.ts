/**
 * useFriendWeekendAvailability — month-scale sibling of useFriendDashboardData.
 *
 * Given the weekend dates (Sat/Sun) across a browse range, batch-fetches
 * connected friends' availability + profiles for ONLY those dates and returns,
 * per date, the friends who share a mutual free SOCIAL slot with me in the
 * same city. Powers the "Open weekends" view's friend-overlap signal beyond
 * the 7-day dashboard window (useFriendDashboardData is capped to 7 days).
 *
 * Weekend dates are sparse (≤ ~52 dates for 6 months) and friends are capped
 * at 30, and availability rows only exist for touched days — so the widened
 * `.in('date', …)` query stays small. Reuses the exact same-city + social-slot
 * overlap rules as the dashboard hook (effectiveCity + isSocialSlot).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePlannerStore } from '@/stores/plannerStore';
import { useAvailabilityStore } from '@/stores/availabilityStore';
import { computeMutualFreeFriends, type FriendLite } from '@/lib/friendAvailability';

export type { FriendLite };

/** Map of yyyy-MM-dd → friends free (mutual social slot, same city) that day. */
export type FriendsByDate = Record<string, FriendLite[]>;

export function useFriendWeekendAvailability(weekendDates: string[]) {
  const friends = usePlannerStore((s) => s.friends);
  const homeAddress = usePlannerStore((s) => s.homeAddress);
  const availabilityMap = useAvailabilityStore((s) => s.availabilityMap);

  const friendUserIds = friends
    .filter((f) => f.status === 'connected' && f.friendUserId)
    .map((f) => f.friendUserId!)
    .slice(0, 30); // cap to avoid huge queries (matches dashboard hook)

  const datesKey = weekendDates.join(',');

  return useQuery({
    enabled: friendUserIds.length > 0 && weekendDates.length > 0,
    queryKey: ['friend-weekend-availability', friendUserIds.join(','), homeAddress ?? '', datesKey],
    staleTime: 60_000,
    queryFn: async (): Promise<FriendsByDate> => {
      const [profilesRes, availRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, display_name, first_name, last_name, avatar_url, home_address')
          .in('user_id', friendUserIds),
        supabase
          .from('availability')
          .select('user_id, date, early_morning, late_morning, early_afternoon, late_afternoon, evening, late_night, location_status, trip_location')
          .in('user_id', friendUserIds)
          .in('date', weekendDates),
      ]);

      const profiles = profilesRes.data ?? [];
      const avail = availRes.data ?? [];
      const profById = new Map(profiles.map((p: any) => [p.user_id, p]));
      const availByUserDate = new Map<string, any>();
      for (const a of avail) availByUserDate.set(`${a.user_id}|${a.date}`, a);

      const result: FriendsByDate = {};

      for (const date of weekendDates) {
        const myDay = availabilityMap[date];
        // Shared predicate (lib/friendAvailability) — same rule quick-plan uses,
        // so the card's friend count and quick-plan can't diverge (XPE-309).
        const mutual = computeMutualFreeFriends({
          date,
          friendUserIds,
          availByUserDate,
          profById,
          myAvail: myDay
            ? { slots: myDay.slots, locationStatus: myDay.locationStatus, tripLocation: myDay.tripLocation ?? null }
            : null,
          homeAddress,
        });
        // This card shows friends free in ANY social slot that day.
        result[date] = mutual.map((m) => m.friend);
      }

      return result;
    },
  });
}
