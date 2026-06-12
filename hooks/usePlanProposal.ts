/**
 * usePlanProposal — read plan_proposal_options + plan_proposal_votes for a
 * plan whose status='proposed' has multiple times to vote on. Provides
 * vote-for-option + finalize mutations.
 *
 * V1 single-pick voting: each user marks one option as their top choice
 * (rank=1). Per-option vote counts surface in the UI. Owner finalizes by
 * picking a winning option which updates plans.{date,time_slot,status='confirmed'}.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { invalidatePlanData } from '@/lib/dashboardQuery';
import type { TimeSlot } from '@/types/planner';

export interface PlanProposalOption {
  id:        string;
  planId:    string;
  date:      string;    // yyyy-MM-dd
  timeSlot:  TimeSlot;
  startTime: string | null;
  sortOrder: number;
  voteCount: number;
  /** This user's vote rank for this option (1 = top), or null */
  myRank:    number | null;
}

export function usePlanProposal(planId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    enabled: !!planId,
    queryKey: ['plan-proposal', planId, user?.id],
    staleTime: 30_000,
    queryFn: async (): Promise<PlanProposalOption[]> => {
      const { data: opts, error: optsErr } = await (supabase as any)
        .from('plan_proposal_options')
        .select('id, plan_id, date, time_slot, start_time, sort_order')
        .eq('plan_id', planId!)
        .order('sort_order', { ascending: true });
      if (optsErr) throw optsErr;
      const options = (opts ?? []) as any[];
      if (options.length === 0) return [];

      const optionIds = options.map((o) => o.id);
      const { data: votes } = await (supabase as any)
        .from('plan_proposal_votes')
        .select('option_id, user_id, rank')
        .in('option_id', optionIds);

      const voteByOption = new Map<string, any[]>();
      for (const v of (votes ?? []) as any[]) {
        const arr = voteByOption.get(v.option_id) ?? [];
        arr.push(v);
        voteByOption.set(v.option_id, arr);
      }

      return options.map((o) => {
        const opVotes = voteByOption.get(o.id) ?? [];
        const mine = opVotes.find((v) => v.user_id === user?.id);
        return {
          id:        o.id,
          planId:    o.plan_id,
          date:      o.date,
          timeSlot:  o.time_slot,
          startTime: o.start_time,
          sortOrder: o.sort_order,
          voteCount: opVotes.filter((v) => v.rank === 1).length,
          myRank:    mine?.rank ?? null,
        };
      });
    },
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * Set this user's top choice. Clears any prior vote (since we only support
 * single-pick voting), then inserts rank=1 for the chosen option.
 */
export function useVoteForOption() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      planId:    string;
      optionId:  string;
      otherOptionIds: string[];
    }) => {
      if (!user?.id) throw new Error('Not signed in');
      // Clear my prior vote(s) on other options for this plan
      if (input.otherOptionIds.length > 0) {
        await (supabase as any)
          .from('plan_proposal_votes')
          .delete()
          .in('option_id', input.otherOptionIds)
          .eq('user_id', user.id);
      }
      // Upsert my vote on the chosen option (rank=1)
      const { error } = await (supabase as any)
        .from('plan_proposal_votes')
        .upsert(
          {
            option_id: input.optionId,
            user_id:   user.id,
            rank:      1,
          },
          { onConflict: 'option_id,user_id' },
        );
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['plan-proposal', vars.planId] });
    },
  });
}

/**
 * Owner finalizes the proposal by picking a winning option. Updates the
 * plans row's date + time_slot + status='confirmed'.
 */
export function useFinalizeProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      planId:   string;
      date:     string;
      timeSlot: TimeSlot;
    }) => {
      const noonUtc = `${input.date}T12:00:00+00:00`;
      const { error } = await (supabase as any)
        .from('plans')
        .update({
          date:      noonUtc,
          time_slot: input.timeSlot,
          status:    'confirmed',
        })
        .eq('id', input.planId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      // Covers ['plan'] and ['plan-proposal'] plus the dashboard query, which
      // pushes the new date/status into the Zustand stores.
      invalidatePlanData(vars.planId);
    },
  });
}
