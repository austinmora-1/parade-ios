import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ─── Profile settings query ──────────────────────────────────────────────────

export function useProfileSettings(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['profile-settings', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'plan_reminders, friend_requests_notifications, plan_invitations_notifications, ' +
          'show_availability, show_location, show_vibe_status, allow_all_hang_requests, ' +
          'interests, preferred_social_days, preferred_social_times, default_work_days, default_work_start_hour, default_work_end_hour',
        )
        .eq('user_id', userId!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });
}
