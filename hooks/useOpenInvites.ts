/**
 * useOpenInvites — the real open-invite ("find friends to join") data layer,
 * matching the PWA's hook 1:1 on the open_invites table.
 *
 *   • create  → insert open_invites row + fire on-open-invite edge fn
 *               (targeted notifications to the audience)
 *   • incoming → friends' open, non-expired invites I could claim
 *   • mine     → my broadcast invites
 *   • claim    → claim-open-invite edge fn (first claimer spawns the plan)
 *   • decline  → open_invite_responses upsert
 *   • cancel   → status='cancelled'
 *
 * audience_type: 'all_friends' | 'pod' | 'interest' | 'friends'
 * audience_ref:  pod id / interest tag / comma-separated friend user ids
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export type OpenInviteAudienceType = 'all_friends' | 'pod' | 'interest' | 'friends';

export interface OpenInvite {
  id: string;
  user_id: string;
  title: string;
  activity: string;
  date: string;          // yyyy-MM-dd
  time_slot: string;
  duration: number;
  location: string | null;
  notes: string | null;
  audience_type: OpenInviteAudienceType;
  audience_ref: string | null;
  expires_at: string;
  status: 'open' | 'claimed' | 'expired' | 'cancelled';
  claimed_plan_id: string | null;
  created_at: string;
}

export interface CreateOpenInviteInput {
  title: string;
  activity: string;
  date: string;          // yyyy-MM-dd
  time_slot: string;
  duration?: number;
  location?: string | null;
  notes?: string | null;
  audience_type: OpenInviteAudienceType;
  audience_ref?: string | null;
  plan_id?: string | null;
  /** Defaults to 48h from now (DB default) when omitted. */
  expires_at?: string;
}

/** My broadcast invites, newest first. */
export function useMyOpenInvites() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user?.id,
    queryKey: ['open-invites', 'mine', user?.id],
    staleTime: 30_000,
    queryFn: async (): Promise<OpenInvite[]> => {
      const { data, error } = await (supabase as any)
        .from('open_invites')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as OpenInvite[];
    },
  });
}

/** Friends' open, unexpired invites (RLS scopes visibility/audience). */
export function useIncomingOpenInvites() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user?.id,
    queryKey: ['open-invites', 'incoming', user?.id],
    staleTime: 30_000,
    queryFn: async (): Promise<OpenInvite[]> => {
      const { data, error } = await (supabase as any)
        .from('open_invites')
        .select('*')
        .neq('user_id', user!.id)
        .eq('status', 'open')
        .gt('expires_at', new Date().toISOString())
        .order('date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as OpenInvite[];
    },
  });
}

export function useCreateOpenInvite() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOpenInviteInput): Promise<OpenInvite> => {
      if (!user?.id) throw new Error('Not signed in');
      const { data, error } = await (supabase as any)
        .from('open_invites')
        .insert({
          user_id: user.id,
          title: input.title,
          activity: input.activity,
          date: input.date,
          time_slot: input.time_slot,
          duration: input.duration ?? 60,
          location: input.location ?? null,
          notes: input.notes ?? null,
          audience_type: input.audience_type,
          audience_ref: input.audience_ref ?? null,
          plan_id: input.plan_id ?? null,
          ...(input.expires_at ? { expires_at: input.expires_at } : {}),
        })
        .select()
        .single();
      if (error) throw error;

      // Fire-and-forget targeted notifications (same edge fn as the PWA)
      supabase.functions
        .invoke('on-open-invite', { body: { open_invite_id: data.id } })
        .then(() => {}, (e) => console.warn('[open-invites] notify failed', e));

      return data as OpenInvite;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['open-invites'] });
    },
  });
}

export function useClaimOpenInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (openInviteId: string) => {
      const { data, error } = await supabase.functions.invoke('claim-open-invite', {
        body: { open_invite_id: openInviteId },
      });
      if (error) throw error;
      return data as { success: boolean; plan_id: string | null };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['open-invites'] });
    },
  });
}

export function useDeclineOpenInvite() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (openInviteId: string) => {
      if (!user?.id) throw new Error('Not signed in');
      const { error } = await (supabase as any)
        .from('open_invite_responses')
        .upsert(
          { open_invite_id: openInviteId, user_id: user.id, response: 'declined' },
          { onConflict: 'open_invite_id,user_id' },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['open-invites'] });
    },
  });
}

export function useCancelOpenInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (openInviteId: string) => {
      const { error } = await (supabase as any)
        .from('open_invites')
        .update({ status: 'cancelled' })
        .eq('id', openInviteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['open-invites'] });
    },
  });
}
