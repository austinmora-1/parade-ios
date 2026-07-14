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
import { resolveEffectiveCity, isFriendInMyCity } from '@/lib/effectiveCity';
import { isSocialSlot } from '@/lib/socialSlots';
import { formatDisplayName } from '@/lib/utils';
import type { TimeSlot } from '@/types/planner';

const SLOT_KEYS: { col: string; slot: TimeSlot }[] = [
  { col: 'early_morning',   slot: 'early-morning'   },
  { col: 'late_morning',    slot: 'late-morning'    },
  { col: 'early_afternoon', slot: 'early-afternoon' },
  { col: 'late_afternoon',  slot: 'late-afternoon'  },
  { col: 'evening',         slot: 'evening'         },
  { col: 'late_night',      slot: 'late-night'      },
];

export interface FriendLite {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

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
        const mySlots = myDay?.slots ?? null;
        const myCity = resolveEffectiveCity({
          date,
          availability: myDay
            ? { date, location_status: myDay.locationStatus, trip_location: myDay.tripLocation ?? null }
            : null,
          homeAddress,
        });
        // Need my city + my slot data to compute any overlap.
        if (!myCity || !mySlots) {
          result[date] = [];
          continue;
        }

        const dObj = new Date(`${date}T12:00:00`);
        const friendsHere: FriendLite[] = [];

        for (const fid of friendUserIds) {
          const avRow = availByUserDate.get(`${fid}|${date}`);
          if (!avRow) continue; // no row → can't confirm the friend is free
          const p = profById.get(fid);

          const sameCity = isFriendInMyCity({
            date,
            myAvailability: { date, location_status: myDay?.locationStatus ?? 'home', trip_location: myDay?.tripLocation ?? null },
            myHomeAddress: homeAddress,
            friendAvailability: { date, location_status: avRow.location_status, trip_location: avRow.trip_location },
            friendHomeAddress: p?.home_address ?? null,
          });
          if (!sameCity) continue;

          let mutual = false;
          for (const { col, slot } of SLOT_KEYS) {
            if (!avRow[col]) continue;        // friend free in this slot
            if (!mySlots[slot]) continue;     // I'm free too
            if (!isSocialSlot(dObj, slot)) continue;
            mutual = true;
            break;
          }
          if (mutual && p) {
            friendsHere.push({
              userId: fid,
              name:
                formatDisplayName({
                  firstName: p.first_name,
                  lastName: p.last_name,
                  displayName: p.display_name ?? '',
                }) || 'Friend',
              avatarUrl: p.avatar_url ?? null,
            });
          }
        }

        result[date] = friendsHere;
      }

      return result;
    },
  });
}
