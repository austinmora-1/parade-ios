/**
 * usePlanChangeRequests — read/write the plan_change_requests +
 * plan_change_responses tables. Lets participants propose a new date/slot
 * for an existing plan; everyone else accepts/declines.
 *
 * The plan stays at its original time until all participants have accepted
 * (or majority — server-side trigger handles consolidation in PWA).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { TimeSlot } from '@/types/planner';

export interface PlanChangeRequest {
  id:               string;
  planId:           string;
  proposedBy:       string;
  proposedDate:     string | null;     // yyyy-MM-dd
  proposedTimeSlot: string | null;
  proposedDuration: number | null;
  status:           'pending' | 'accepted' | 'declined' | 'expired';
  createdAt:        Date;
  /** Joined responses */
  responses:        PlanChangeResponse[];
}

export interface PlanChangeResponse {
  id:              string;
  changeRequestId: string;
  participantId:   string;          // friend_id of the responder
  response:        'pending' | 'accepted' | 'declined';
  respondedAt:     Date | null;
}

function mapResponse(r: any): PlanChangeResponse {
  return {
    id:              r.id,
    changeRequestId: r.change_request_id,
    participantId:   r.participant_id,
    response:        r.response,
    respondedAt:     r.responded_at ? new Date(r.responded_at) : null,
  };
}

function mapRequest(r: any): PlanChangeRequest {
  return {
    id:               r.id,
    planId:           r.plan_id,
    proposedBy:       r.proposed_by,
    proposedDate:     r.proposed_date,
    proposedTimeSlot: r.proposed_time_slot,
    proposedDuration: r.proposed_duration,
    status:           r.status,
    createdAt:        new Date(r.created_at),
    responses:        (r.plan_change_responses ?? []).map(mapResponse),
  };
}

/** Active (pending) change request for a plan, if any */
export function usePlanChangeRequest(planId: string | undefined) {
  return useQuery({
    enabled: !!planId,
    queryKey: ['plan-change-request', planId],
    staleTime: 30_000,
    queryFn: async (): Promise<PlanChangeRequest | null> => {
      const { data, error } = await (supabase as any)
        .from('plan_change_requests')
        .select('*, plan_change_responses(*)')
        .eq('plan_id', planId!)
        .eq('status', 'pending')
        .maybeSingle();
      if (error) throw error;
      return data ? mapRequest(data) : null;
    },
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useProposeChange() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      planId:           string;
      proposedDate?:    string;   // yyyy-MM-dd
      proposedTimeSlot?: TimeSlot;
      proposedDuration?: number;
    }) => {
      if (!user?.id) throw new Error('Not signed in');

      // Insert the change request
      const { data: req, error: reqErr } = await (supabase as any)
        .from('plan_change_requests')
        .insert({
          plan_id:            input.planId,
          proposed_by:        user.id,
          proposed_date:      input.proposedDate ?? null,
          proposed_time_slot: input.proposedTimeSlot ?? null,
          proposed_duration:  input.proposedDuration ?? null,
          status:             'pending',
        })
        .select('id')
        .single();
      if (reqErr) throw reqErr;

      // Seed pending responses for every participant except the proposer
      const { data: participants } = await (supabase as any)
        .from('plan_participants')
        .select('friend_id')
        .eq('plan_id', input.planId);
      const otherIds = ((participants ?? []) as any[])
        .map((p) => p.friend_id)
        .filter((id) => id && id !== user.id);

      if (otherIds.length > 0) {
        const rows = otherIds.map((participantId) => ({
          change_request_id: req.id,
          participant_id:    participantId,
          response:          'pending',
        }));
        // Best-effort — PWA's trigger may already seed these
        await (supabase as any).from('plan_change_responses').insert(rows);
      }
      return req.id as string;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['plan-change-request', vars.planId] });
    },
  });
}

export function useRespondToChange() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      changeRequestId: string;
      response:        'accepted' | 'declined';
      planId:          string;
    }) => {
      if (!user?.id) throw new Error('Not signed in');
      const { error } = await (supabase as any)
        .from('plan_change_responses')
        .update({
          response:     input.response,
          responded_at: new Date().toISOString(),
        })
        .eq('change_request_id', input.changeRequestId)
        .eq('participant_id', user.id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['plan-change-request', vars.planId] });
      queryClient.invalidateQueries({ queryKey: ['plan', vars.planId] });
    },
  });
}
