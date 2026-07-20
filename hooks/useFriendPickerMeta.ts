/**
 * useFriendPickerMeta — per-friend metadata for the find-time step-1 picker
 * (WhoStep). For every connected friend it returns:
 *   • city — their current city-level location (today), shown as a subtitle.
 *   • availableThisMonth — whether they're in my city with at least one open
 *     social slot within the next 30 days, so the picker can surface who's
 *     actually reachable instead of one flat list.
 *
 * Reuses the same city/co-location/social-slot helpers as
 * useFriendDashboardData (isFriendInMyCity / isSocialSlot / formatCityForDisplay)
 * so "available" here stays consistent with the rest of the app — but over a
 * 30-day window and WITHOUT dropping friends who have no overlap (they're kept
 * with availableThisMonth = false).
 */
import { useQuery } from '@tanstack/react-query';
import { format, addDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { usePlannerStore } from '@/stores/plannerStore';
import { isFriendInMyCity } from '@/lib/effectiveCity';
import { isSocialSlot } from '@/lib/socialSlots';
import { formatCityForDisplay } from '@/lib/formatCity';
import type { TimeSlot } from '@/types/planner';

const SLOT_COLS: { col: string; slot: TimeSlot }[] = [
  { col: 'early_morning',   slot: 'early-morning'   },
  { col: 'late_morning',    slot: 'late-morning'    },
  { col: 'early_afternoon', slot: 'early-afternoon' },
  { col: 'late_afternoon',  slot: 'late-afternoon'  },
  { col: 'evening',         slot: 'evening'         },
  { col: 'late_night',      slot: 'late-night'      },
];

const WINDOW_DAYS = 30;

export interface FriendPickerMeta {
  /** Display-formatted current city-level location (today), or null. */
  city: string | null;
  /** In my city with ≥1 open social slot in the next 30 days. */
  availableThisMonth: boolean;
}

/** Turn a raw "Brooklyn, NY"-style string into the app's display city. */
function displayCity(raw: string | null): string | null {
  if (!raw) return null;
  return formatCityForDisplay(raw) || raw.split(',')[0].trim() || null;
}

export function useFriendPickerMeta(): {
  data: Record<string, FriendPickerMeta>;
  isLoading: boolean;
} {
  const friends      = usePlannerStore((s) => s.friends);
  const availability = usePlannerStore((s) => s.availability);
  const homeAddress  = usePlannerStore((s) => s.homeAddress);

  const friendUserIds = friends
    .filter((f) => f.status === 'connected' && f.friendUserId)
    .map((f) => f.friendUserId!)
    .slice(0, 60);

  const myAvailKey = availability
    .map((a) => `${format(a.date, 'yyyy-MM-dd')}:${a.locationStatus}:${a.tripLocation ?? ''}`)
    .join('|');

  const q = useQuery({
    enabled: friendUserIds.length > 0,
    queryKey: ['friend-picker-meta', friendUserIds.join(','), homeAddress ?? '', myAvailKey],
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, FriendPickerMeta>> => {
      const dates = Array.from({ length: WINDOW_DAYS }, (_, i) =>
        format(addDays(new Date(), i), 'yyyy-MM-dd'),
      );
      const today = dates[0];

      const [profilesRes, availRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, home_address')
          .in('user_id', friendUserIds),
        supabase
          .from('availability')
          .select('user_id, date, early_morning, late_morning, early_afternoon, late_afternoon, evening, late_night, location_status, trip_location')
          .in('user_id', friendUserIds)
          .in('date', dates),
      ]);

      const profiles = profilesRes.data ?? [];
      const avail = availRes.data ?? [];

      // My location per in-window date (for co-location checks).
      const myAvailByDate: Record<string, { locationStatus: string; tripLocation: string | null }> = {};
      for (const a of availability) {
        const key = format(a.date, 'yyyy-MM-dd');
        if (!dates.includes(key)) continue;
        myAvailByDate[key] = {
          locationStatus: a.locationStatus,
          tripLocation:   a.tripLocation ?? null,
        };
      }

      const availByUserDate = new Map<string, any>();
      for (const a of avail) availByUserDate.set(`${a.user_id}|${a.date}`, a);

      const out: Record<string, FriendPickerMeta> = {};
      for (const p of profiles) {
        const friendHome = (p as any).home_address ?? null;

        // Current city (today): away today → trip_location, else home city.
        const todayRow = availByUserDate.get(`${p.user_id}|${today}`);
        const currentRaw =
          todayRow && (todayRow as any).location_status === 'away' && (todayRow as any).trip_location
            ? (todayRow as any).trip_location
            : friendHome;

        // Available this month = in my city + an open social slot on some day.
        let available = false;
        for (const date of dates) {
          const avRow = availByUserDate.get(`${p.user_id}|${date}`);
          if (!avRow) continue; // never assume free without a confirmed row
          const sameCity = isFriendInMyCity({
            date,
            myAvailability: {
              date,
              location_status: myAvailByDate[date]?.locationStatus ?? 'home',
              trip_location:   myAvailByDate[date]?.tripLocation ?? null,
            },
            myHomeAddress: homeAddress,
            friendAvailability: {
              date,
              location_status: (avRow as any).location_status,
              trip_location:   (avRow as any).trip_location,
            },
            friendHomeAddress: friendHome,
          });
          if (!sameCity) continue;
          const dObj = new Date(`${date}T12:00:00`);
          for (const { col, slot } of SLOT_COLS) {
            if (!(avRow as any)[col]) continue;
            if (!isSocialSlot(dObj, slot)) continue;
            available = true;
            break;
          }
          if (available) break;
        }

        out[p.user_id] = { city: displayCity(currentRaw), availableThisMonth: available };
      }
      return out;
    },
  });

  return { data: q.data ?? {}, isLoading: q.isLoading };
}
