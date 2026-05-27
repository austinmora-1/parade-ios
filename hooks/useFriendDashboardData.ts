/**
 * useFriendDashboardData — batch-fetches friend profiles (current_vibe) and
 * availability for the current week. Called once on the Home tab and shared
 * between FriendVibeStrip and FreeWindowCard (friend overlap dots).
 */
import { useQuery } from '@tanstack/react-query';
import { format, startOfWeek, addDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { usePlannerStore } from '@/stores/plannerStore';

export interface FriendVibe {
  userId: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  currentVibe: string | null;
  /** Short city/neighborhood label, e.g. "Brooklyn" or "Austin, TX". */
  city: string | null;
  /** dates (yyyy-MM-dd) where this friend has at least one 'free' slot */
  freeDates: string[];
  /** Total free slots this week (sum across all days). */
  freeSlotCount: number;
}

export function useFriendDashboardData() {
  const friends = usePlannerStore((s) => s.friends);

  const friendUserIds = friends
    .filter((f) => f.status === 'connected' && f.friendUserId)
    .map((f) => f.friendUserId!)
    .slice(0, 30); // cap to avoid huge queries

  return useQuery({
    enabled: friendUserIds.length > 0,
    queryKey: ['friend-dashboard-data', friendUserIds.join(',')],
    staleTime: 60_000,
    queryFn: async (): Promise<FriendVibe[]> => {
      const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const weekEnd = format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 6), 'yyyy-MM-dd');

      const [profilesRes, availRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, display_name, first_name, last_name, avatar_url, current_vibe, neighborhood, home_address')
          .in('user_id', friendUserIds),
        supabase
          .from('availability')
          .select('user_id, date, early_morning, late_morning, early_afternoon, late_afternoon, evening, late_night')
          .in('user_id', friendUserIds)
          .gte('date', weekStart)
          .lte('date', weekEnd),
      ]);

      const profiles = profilesRes.data ?? [];
      const avail = availRes.data ?? [];

      // Build a map of userId → dates where they have any free slot
      const freeMap: Record<string, Set<string>> = {};
      // Also count total free slots per user this week
      const slotCount: Record<string, number> = {};
      for (const row of avail) {
        const slots = [
          row.early_morning, row.late_morning, row.early_afternoon,
          row.late_afternoon, row.evening, row.late_night,
        ];
        const freeSlotsToday = slots.filter(
          (s) => s === true || (s as any) === 'free',
        ).length;
        if (freeSlotsToday > 0) {
          if (!freeMap[row.user_id]) freeMap[row.user_id] = new Set();
          freeMap[row.user_id].add(row.date);
          slotCount[row.user_id] = (slotCount[row.user_id] ?? 0) + freeSlotsToday;
        }
      }

      return profiles.map((p) => {
        // Derive a compact city label: prefer neighborhood, else take the
        // first comma-separated chunk of home_address.
        let city: string | null = null;
        const nb = (p as any).neighborhood as string | null | undefined;
        const home = (p as any).home_address as string | null | undefined;
        if (nb && nb.trim()) city = nb.trim();
        else if (home && home.trim()) {
          const first = home.split(',')[0]?.trim();
          city = first || null;
        }
        return {
          userId: p.user_id,
          displayName: p.display_name,
          firstName: p.first_name,
          lastName: p.last_name,
          avatarUrl: p.avatar_url,
          currentVibe: p.current_vibe,
          city,
          freeDates: Array.from(freeMap[p.user_id] ?? []).sort(),
          freeSlotCount: slotCount[p.user_id] ?? 0,
        };
      });
    },
  });
}
