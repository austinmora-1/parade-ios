/**
 * useFriendDayAvailability — mutual-free friends for ONE specific date, per slot.
 *
 * Fetches my + connected friends' availability rows for a single date and runs
 * the shared computeMutualFreeFriends predicate, returning a {slot: friends[]}
 * map. Unlike useFriendDashboardData (hard 7-day window), this works for any
 * date — quick-plan can arrive with a ?date= well past this week (e.g. a
 * weekend tapped from the Open Weekends card) and still see who's free (XPE-309).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';
import { useAvailabilityStore } from '@/stores/availabilityStore';
import {
  computeMutualFreeFriends,
  slotsFromRow,
  SLOT_KEYS,
  type FriendLite,
  type MyDayAvail,
} from '@/lib/friendAvailability';
import type { TimeSlot } from '@/types/planner';

export type FriendsBySlot = Record<TimeSlot, FriendLite[]>;

const AVAIL_COLS =
  'user_id, date, early_morning, late_morning, early_afternoon, late_afternoon, evening, late_night, location_status, trip_location';

export function useFriendDayAvailability(date: string | undefined) {
  const { user } = useAuth();
  const friends = usePlannerStore((s) => s.friends);
  const homeAddress = usePlannerStore((s) => s.homeAddress);
  const availabilityMap = useAvailabilityStore((s) => s.availabilityMap);

  const friendUserIds = friends
    .filter((f) => f.status === 'connected' && f.friendUserId)
    .map((f) => f.friendUserId!)
    .slice(0, 30); // cap to keep the query small (matches sibling hooks)

  // Prefer my availability from the store — the Open Weekends card reads the
  // same source (incl. synthesized work-day defaults), so quick-plan resolves
  // the identical set of free friends the card advertised (XPE-309). A DB row
  // is the fallback for cold deep-links where the store lacks this date.
  const storeDay = date ? availabilityMap[date] : undefined;
  const myFromStore: MyDayAvail | null = storeDay
    ? { slots: storeDay.slots, locationStatus: storeDay.locationStatus, tripLocation: storeDay.tripLocation ?? null }
    : null;

  return useQuery({
    enabled: !!date && !!user?.id && friendUserIds.length > 0,
    queryKey: ['friend-day-availability', date, user?.id, friendUserIds.join(','), homeAddress ?? '', !!myFromStore],
    staleTime: 60_000,
    queryFn: async (): Promise<FriendsBySlot> => {
      const ids = [user!.id, ...friendUserIds];
      const [profilesRes, availRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, display_name, first_name, last_name, avatar_url, home_address')
          .in('user_id', friendUserIds),
        supabase
          .from('availability')
          .select(AVAIL_COLS)
          .in('user_id', ids)
          .eq('date', date!),
      ]);

      const profById = new Map((profilesRes.data ?? []).map((p: any) => [p.user_id, p]));
      const availByUserDate = new Map<string, any>();
      let myRow: any = null;
      for (const a of availRes.data ?? []) {
        availByUserDate.set(`${a.user_id}|${a.date}`, a);
        if (a.user_id === user!.id) myRow = a;
      }

      const myAvail: MyDayAvail | null =
        myFromStore ??
        (myRow
          ? { slots: slotsFromRow(myRow), locationStatus: myRow.location_status, tripLocation: myRow.trip_location }
          : null);

      const mutual = computeMutualFreeFriends({
        date: date!,
        friendUserIds,
        availByUserDate,
        profById,
        myAvail,
        homeAddress,
      });

      const bySlot = {} as FriendsBySlot;
      for (const { slot } of SLOT_KEYS) bySlot[slot] = [];
      for (const m of mutual) {
        for (const s of m.slots) bySlot[s].push(m.friend);
      }
      return bySlot;
    },
  });
}
