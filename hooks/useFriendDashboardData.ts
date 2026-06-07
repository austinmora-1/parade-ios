/**
 * useFriendDashboardData — batch-fetches friend profiles (current_vibe,
 * home_address) and availability for the 7-day window starting today,
 * then computes mutual same-city free slots between me and each friend.
 *
 * Mirrors the PWA's FriendVibeStrip logic via resolveEffectiveCity +
 * isFriendInMyCity so the "Who's around this week" surface stays in
 * lockstep across platforms.
 */
import { useQuery } from '@tanstack/react-query';
import { format, addDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { usePlannerStore } from '@/stores/plannerStore';
import { resolveEffectiveCity, isFriendInMyCity } from '@/lib/effectiveCity';
import { isSocialSlot } from '@/lib/socialSlots';
import type { TimeSlot } from '@/types/planner';

const SLOT_KEYS: { col: string; slot: TimeSlot }[] = [
  { col: 'early_morning',   slot: 'early-morning'   },
  { col: 'late_morning',    slot: 'late-morning'    },
  { col: 'early_afternoon', slot: 'early-afternoon' },
  { col: 'late_afternoon',  slot: 'late-afternoon'  },
  { col: 'evening',         slot: 'evening'         },
  { col: 'late_night',      slot: 'late-night'      },
];

export interface OverlapSlot {
  date: string;     // yyyy-MM-dd
  slot: TimeSlot;
}

export interface FriendVibe {
  userId: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  currentVibe: string | null;
  /** Display-formatted city the friend will be in on overlap days. */
  city: string | null;
  /** Distinct yyyy-MM-dd dates where there's at least one mutual slot. */
  freeDates: string[];
  /** Mutual same-city overlap slots between me and this friend. */
  overlapSlots: OverlapSlot[];
  /** Convenience: overlapSlots.length. */
  freeSlotCount: number;
}

export function useFriendDashboardData() {
  const friends      = usePlannerStore((s) => s.friends);
  const availability = usePlannerStore((s) => s.availability);
  const homeAddress  = usePlannerStore((s) => s.homeAddress);

  const friendUserIds = friends
    .filter((f) => f.status === 'connected' && f.friendUserId)
    .map((f) => f.friendUserId!)
    .slice(0, 30); // cap to avoid huge queries

  // Memoize-friendly cache key: ids + my own availability/home (string)
  const myAvailKey = availability
    .map((a) => `${format(a.date, 'yyyy-MM-dd')}:${a.locationStatus}:${a.tripLocation ?? ''}`)
    .join('|');

  return useQuery({
    enabled: friendUserIds.length > 0,
    queryKey: ['friend-dashboard-data', friendUserIds.join(','), homeAddress ?? '', myAvailKey],
    staleTime: 60_000,
    queryFn: async (): Promise<FriendVibe[]> => {
      // 7-day window starting today (matches PWA)
      const weekDates = Array.from({ length: 7 }, (_, i) =>
        format(addDays(new Date(), i), 'yyyy-MM-dd'),
      );

      const [profilesRes, availRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, display_name, first_name, last_name, avatar_url, current_vibe, home_address')
          .in('user_id', friendUserIds),
        supabase
          .from('availability')
          .select('user_id, date, early_morning, late_morning, early_afternoon, late_afternoon, evening, late_night, location_status, trip_location')
          .in('user_id', friendUserIds)
          .in('date', weekDates),
      ]);

      const profiles = profilesRes.data ?? [];
      const avail = availRes.data ?? [];

      // Map: userId+date → availability row
      const availByUserDate = new Map<string, any>();
      for (const a of avail) {
        availByUserDate.set(`${a.user_id}|${a.date}`, a);
      }

      // My slots per date (for mutual overlap math)
      const mySlotsByDate: Record<string, Partial<Record<TimeSlot, boolean>>> = {};
      const myAvailByDate: Record<string, { locationStatus: string; tripLocation: string | null }> = {};
      for (const a of availability) {
        const key = format(a.date, 'yyyy-MM-dd');
        if (!weekDates.includes(key)) continue;
        mySlotsByDate[key] = a.slots;
        myAvailByDate[key] = {
          locationStatus: a.locationStatus,
          tripLocation:   a.tripLocation ?? null,
        };
      }

      // My effective city per date (resolveEffectiveCity returns
      // normalized lowercase; we keep the raw for display formatting)
      const myCityByDate: Record<string, string> = {};
      for (const d of weekDates) {
        myCityByDate[d] = resolveEffectiveCity({
          date:         d,
          availability: myAvailByDate[d]
            ? { date: d, location_status: myAvailByDate[d].locationStatus, trip_location: myAvailByDate[d].tripLocation }
            : null,
          homeAddress,
        });
      }

      return profiles
        .map((p): FriendVibe | null => {
          const overlap: OverlapSlot[] = [];
          const dayDates = new Set<string>();
          let friendCityRaw: string | null = null; // remember a raw city string for display

          for (const date of weekDates) {
            const myCity = myCityByDate[date];
            if (!myCity) continue;

            const avRow = availByUserDate.get(`${p.user_id}|${date}`);
            // If there's no row at all, treat friend as at home_address.
            const friendAvailLite = avRow
              ? {
                  date,
                  location_status: (avRow as any).location_status,
                  trip_location:   (avRow as any).trip_location,
                }
              : null;

            const sameCity = isFriendInMyCity({
              date,
              myAvailability: { date, location_status: myAvailByDate[date]?.locationStatus ?? 'home', trip_location: myAvailByDate[date]?.tripLocation ?? null },
              myHomeAddress: homeAddress,
              friendAvailability: friendAvailLite,
              friendHomeAddress: (p as any).home_address ?? null,
            });
            if (!sameCity) continue;
            // To count slots the friend MUST have an availability row with at
            // least one free slot — never assume free without confirmation.
            if (!avRow) continue;

            const mySlots = mySlotsByDate[date];
            const dObj = new Date(`${date}T12:00:00`);
            let dayContributed = false;
            for (const { col, slot } of SLOT_KEYS) {
              const friendFree = !!(avRow as any)[col];
              if (!friendFree) continue;
              const meFree = mySlots ? !!mySlots[slot] : false;
              if (!meFree) continue;
              // Only count overlap that falls in a realistic social window
              // (evenings any day, or anything on weekends).
              if (!isSocialSlot(dObj, slot)) continue;
              overlap.push({ date, slot });
              dayContributed = true;
            }
            if (dayContributed) {
              dayDates.add(date);
              if (!friendCityRaw) {
                const friendIsAway =
                  (avRow as any).location_status === 'away' &&
                  (avRow as any).trip_location;
                friendCityRaw = friendIsAway
                  ? (avRow as any).trip_location
                  : ((p as any).home_address ?? null);
              }
            }
          }

          if (overlap.length === 0) return null;

          // Format city for display (e.g. "Brooklyn, NY" → "New York")
          let cityDisplay: string | null = null;
          if (friendCityRaw) {
            // Lazy import to avoid a circular hit if anything else
            // adds an effectiveCity dependency on the dashboard hook.
            const { formatCityForDisplay } = require('@/lib/formatCity');
            const formatted = formatCityForDisplay(friendCityRaw);
            cityDisplay = formatted || friendCityRaw.split(',')[0].trim();
          }

          return {
            userId:        p.user_id,
            displayName:   p.display_name,
            firstName:     p.first_name,
            lastName:      p.last_name,
            avatarUrl:     p.avatar_url,
            currentVibe:   (p as any).current_vibe ?? null,
            city:          cityDisplay,
            freeDates:     Array.from(dayDates).sort(),
            overlapSlots:  overlap,
            freeSlotCount: overlap.length,
          };
        })
        .filter((v): v is FriendVibe => v !== null)
        .sort((a, b) =>
          b.freeSlotCount - a.freeSlotCount ||
          (a.firstName ?? '').localeCompare(b.firstName ?? ''),
        );
    },
  });
}
