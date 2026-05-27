/**
 * useWeeklyIntention — read + upsert the current week's intention row in
 * weekly_intentions. One row per (user_id, week_start). week_start is the
 * Monday of the week.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { startOfWeek, format } from 'date-fns';

export type SocialEnergy = 'low' | 'medium' | 'high';

export interface WeeklyIntention {
  id?:             string;
  weekStart:       string;     // yyyy-MM-dd
  socialEnergy:    SocialEnergy | null;
  targetHangouts:  number | null;
  vibes:           string[];
  notes:           string | null;
}

function currentWeekStart(): string {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

export function useWeeklyIntention() {
  const { user } = useAuth();
  const weekStart = currentWeekStart();
  return useQuery({
    enabled: !!user?.id,
    queryKey: ['weekly-intention', user?.id, weekStart],
    staleTime: 60_000,
    queryFn: async (): Promise<WeeklyIntention> => {
      const { data, error } = await (supabase as any)
        .from('weekly_intentions')
        .select('id, week_start, social_energy, target_hangouts, vibes, notes')
        .eq('user_id', user!.id)
        .eq('week_start', weekStart)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return {
          weekStart,
          socialEnergy:    null,
          targetHangouts:  null,
          vibes:           [],
          notes:           null,
        };
      }
      return {
        id:              data.id,
        weekStart:       data.week_start,
        socialEnergy:    data.social_energy as SocialEnergy | null,
        targetHangouts:  data.target_hangouts,
        vibes:           data.vibes ?? [],
        notes:           data.notes,
      };
    },
  });
}

export function useUpsertIntention() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<WeeklyIntention>) => {
      if (!user?.id) throw new Error('Not signed in');
      const weekStart = input.weekStart ?? currentWeekStart();
      const payload: any = {
        user_id:    user.id,
        week_start: weekStart,
      };
      if (input.socialEnergy !== undefined)   payload.social_energy   = input.socialEnergy;
      if (input.targetHangouts !== undefined) payload.target_hangouts = input.targetHangouts;
      if (input.vibes !== undefined)          payload.vibes           = input.vibes;
      if (input.notes !== undefined)          payload.notes           = input.notes;

      const { error } = await (supabase as any)
        .from('weekly_intentions')
        .upsert(payload, { onConflict: 'user_id,week_start' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-intention'] });
    },
  });
}
