/**
 * usePlanJoinRequests — non-invited friends can request to join a plan;
 * owner approves (via approve_participant_request RPC) or declines.
 *
 * Tables: plan_participant_requests
 * RPC: approve_participant_request(p_request_id)
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export interface JoinRequest {
  id:            string;
  planId:        string;
  friendUserId:  string;
  friendName:    string;
  requestedBy:   string;
  status:        'pending' | 'approved' | 'declined';
  createdAt:     Date;
}

function mapRow(r: any): JoinRequest {
  return {
    id:           r.id,
    planId:       r.plan_id,
    friendUserId: r.friend_user_id,
    friendName:   r.friend_name,
    requestedBy:  r.requested_by,
    status:       r.status,
    createdAt:    new Date(r.created_at),
  };
}

/** All pending join requests for a plan (owner sees these) */
export function usePlanJoinRequests(planId: string | undefined) {
  return useQuery({
    enabled: !!planId,
    queryKey: ['plan-join-requests', planId],
    staleTime: 30_000,
    queryFn: async (): Promise<JoinRequest[]> => {
      const { data, error } = await (supabase as any)
        .from('plan_participant_requests')
        .select('*')
        .eq('plan_id', planId!)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
  });
}

/** Does the current user have a pending request on this plan? */
export function useMyJoinRequest(planId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    enabled: !!planId && !!user?.id,
    queryKey: ['my-join-request', planId, user?.id],
    staleTime: 30_000,
    queryFn: async (): Promise<JoinRequest | null> => {
      const { data, error } = await (supabase as any)
        .from('plan_participant_requests')
        .select('*')
        .eq('plan_id', planId!)
        .eq('friend_user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return data && data.length > 0 ? mapRow(data[0]) : null;
    },
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useRequestToJoin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { planId: string; friendName: string }) => {
      if (!user?.id) throw new Error('Not signed in');
      const { error } = await (supabase as any)
        .from('plan_participant_requests')
        .insert({
          plan_id:        input.planId,
          friend_user_id: user.id,
          friend_name:    input.friendName,
          requested_by:   user.id,
          status:         'pending',
        });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['my-join-request', vars.planId] });
      queryClient.invalidateQueries({ queryKey: ['plan-join-requests', vars.planId] });
    },
  });
}

export function useApproveJoinRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { requestId: string; planId: string }) => {
      const { error } = await (supabase as any).rpc(
        'approve_participant_request',
        { p_request_id: input.requestId },
      );
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['plan-join-requests', vars.planId] });
      queryClient.invalidateQueries({ queryKey: ['plan', vars.planId] });
    },
  });
}

export function useDeclineJoinRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { requestId: string; planId: string }) => {
      const { error } = await (supabase as any)
        .from('plan_participant_requests')
        .update({
          status:      'declined',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', input.requestId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['plan-join-requests', vars.planId] });
    },
  });
}
