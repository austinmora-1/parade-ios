/**
 * useLastHungOut — batch query of `last_hung_out_cache` for the current
 * user's friend list. Returns a Map<friendUserId, lastPlanDate> so consumers
 * can render the streak Flame indicator (PWA convention).
 *
 * The cache is populated server-side by a trigger / cron that runs after
 * a confirmed plan completes (`plan_completed_*` triggers in PWA schema).
 * We just read it.
 */
import { useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';
import { supabase } from '@/integrations/supabase/client';

export interface LastHungOutEntry {
  friendUserId: string;
  lastPlanDate: Date;
}

export function useLastHungOut() {
  const { user } = useAuth();
  const friends = usePlannerStore((s) => s.friends);

  const friendUserIds = friends
    .filter((f) => f.status === 'connected' && f.friendUserId)
    .map((f) => f.friendUserId!)
    .slice(0, 50);

  return useQuery({
    enabled: !!user?.id && friendUserIds.length > 0,
    queryKey: ['last-hung-out', user?.id, friendUserIds.join(',')],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('last_hung_out_cache')
        .select('friend_user_id, last_plan_date')
        .eq('user_id', user!.id)
        .in('friend_user_id', friendUserIds);
      if (error) throw error;

      const map = new Map<string, Date>();
      for (const row of (data ?? []) as any[]) {
        if (row.last_plan_date) {
          map.set(row.friend_user_id, new Date(row.last_plan_date));
        }
      }
      return map;
    },
  });
}

// ─── Streak rendering helpers ────────────────────────────────────────────────

/** Color-graded Flame stage based on recency (PWA convention) */
export type StreakStage = 'hot' | 'warm' | 'cooling' | 'cold' | 'none';

export function streakStage(lastDate: Date | undefined | null): StreakStage {
  if (!lastDate) return 'none';
  const days = differenceInCalendarDays(new Date(), lastDate);
  if (days < 0) return 'none';     // future date (data error)
  if (days <= 7)  return 'hot';
  if (days <= 14) return 'warm';
  if (days <= 30) return 'cooling';
  return 'cold';
}

export const STREAK_COLORS: Record<StreakStage, string> = {
  hot:     '#F97316', // orange-500
  warm:    '#F59E0B', // amber-500
  cooling: '#FBBF24', // amber-400
  cold:    '#929298', // muted
  none:    'transparent',
};

/** Short relative label like "3d", "2w", "4mo" */
export function shortAgo(lastDate: Date): string {
  const days = differenceInCalendarDays(new Date(), lastDate);
  if (days <= 0)   return 'today';
  if (days === 1)  return 'yesterday';
  if (days < 7)    return `${days}d ago`;
  if (days < 30)   return `${Math.floor(days / 7)}w ago`;
  if (days < 365)  return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
