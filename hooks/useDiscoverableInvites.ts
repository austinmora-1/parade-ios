/**
 * useDiscoverableInvites — surfaces friends' open invites the current user
 * could claim. Specifically: future plans owned by a friend with
 * feed_visibility ∈ {'friends', any pod the user is a member of} where the
 * user is NOT already a participant.
 *
 * Match for the PWA's IncomingOpenInvites widget pattern, using the plans
 * table directly since our openInvite=true flow writes there with
 * feed_visibility='friends'. Pod-scoped variant uses pod_members where
 * friend_user_id = me to find pods I'm in.
 */
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';
import { supabase } from '@/integrations/supabase/client';

export interface DiscoverableInvite {
  id:             string;
  title:          string;
  activity:       string | null;
  date:           Date;
  timeSlot:       string;
  location:       string | null;
  ownerUserId:    string;
  ownerName:      string;
  feedVisibility: string;
}

export function useDiscoverableInvites() {
  const { user } = useAuth();
  const friends = usePlannerStore((s) => s.friends);

  const connectedFriends = friends.filter(
    (f) => f.status === 'connected' && f.friendUserId,
  );
  const friendUserIds = connectedFriends
    .map((f) => f.friendUserId!)
    .slice(0, 100);
  const friendNameByUserId = new Map(
    connectedFriends.map((f) => [f.friendUserId!, f.name] as const),
  );

  return useQuery({
    enabled: !!user?.id && friendUserIds.length > 0,
    queryKey: ['discoverable-invites', user?.id, friendUserIds.join(',')],
    staleTime: 60_000,
    queryFn: async (): Promise<DiscoverableInvite[]> => {
      // 1. Pods the current user is a *member* of (not the owner)
      const { data: memberRows } = await (supabase as any)
        .from('pod_members')
        .select('pod_id')
        .eq('friend_user_id', user!.id);
      const memberPodIds = ((memberRows ?? []) as any[]).map((r) => r.pod_id);
      const visibilityTokens = [
        'friends',
        ...memberPodIds.map((id: string) => `pod:${id}`),
      ];

      const todayStr = format(new Date(), 'yyyy-MM-dd');

      // 2. Future plans from friends with matching visibility
      const { data: plans, error } = await (supabase as any)
        .from('plans')
        .select('id, title, activity, date, time_slot, location, status, user_id, feed_visibility')
        .in('user_id', friendUserIds)
        .in('feed_visibility', visibilityTokens)
        .gte('date', todayStr)
        .order('date', { ascending: true })
        .limit(50);
      if (error) throw error;
      if (!plans || plans.length === 0) return [];

      // 3. Filter out plans the user is already a participant on
      const planIds = (plans as any[]).map((p) => p.id);
      const { data: partRows } = await (supabase as any)
        .from('plan_participants')
        .select('plan_id')
        .in('plan_id', planIds)
        .eq('friend_id', user!.id);
      const alreadyJoined = new Set(((partRows ?? []) as any[]).map((r) => r.plan_id));

      return (plans as any[])
        .filter((p) => !alreadyJoined.has(p.id))
        .map((p) => ({
          id:             p.id,
          title:          p.title || 'Untitled plan',
          activity:       p.activity,
          date:           new Date(p.date),
          timeSlot:       p.time_slot,
          location:       p.location,
          ownerUserId:    p.user_id,
          ownerName:      friendNameByUserId.get(p.user_id) ?? 'A friend',
          feedVisibility: p.feed_visibility ?? 'private',
        }));
    },
  });
}
