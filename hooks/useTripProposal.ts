/**
 * useTripProposal — read trip_proposal_dates + trip_proposal_votes for a
 * trip proposal whose participants are voting on candidate date ranges.
 *
 * V1 single-pick voting: each user marks one date range as top choice.
 * Owner finalizes by picking a winner → spawns a real trips row + flips
 * the proposal status='finalized'.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export interface TripProposal {
  id:           string;
  name:         string | null;
  destination:  string | null;
  hostUserId:   string | null;
  createdBy:    string;
  status:       'pending' | 'finalized' | 'cancelled';
  proposalType: string;
  dates:        TripProposalDate[];
}

export interface TripProposalDate {
  id:        string;
  startDate: string;
  endDate:   string;
  voteCount: number;
  /** Current user's vote rank for this date option, or null */
  myRank:    number | null;
}

export function useTripProposal(proposalId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    enabled: !!proposalId,
    queryKey: ['trip-proposal', proposalId, user?.id],
    staleTime: 30_000,
    queryFn: async (): Promise<TripProposal | null> => {
      const { data: prop, error: propErr } = await (supabase as any)
        .from('trip_proposals')
        .select('*')
        .eq('id', proposalId!)
        .maybeSingle();
      if (propErr) throw propErr;
      if (!prop) return null;

      const { data: dateRows } = await (supabase as any)
        .from('trip_proposal_dates')
        .select('id, start_date, end_date')
        .eq('proposal_id', proposalId!)
        .order('start_date', { ascending: true });
      const dates = (dateRows ?? []) as any[];

      if (dates.length === 0) {
        return {
          id:           prop.id,
          name:         prop.name,
          destination:  prop.destination,
          hostUserId:   prop.host_user_id,
          createdBy:    prop.created_by,
          status:       prop.status,
          proposalType: prop.proposal_type,
          dates:        [],
        };
      }

      const dateIds = dates.map((d) => d.id);
      const { data: voteRows } = await (supabase as any)
        .from('trip_proposal_votes')
        .select('date_id, user_id, rank')
        .in('date_id', dateIds);

      const votesByDate = new Map<string, any[]>();
      for (const v of (voteRows ?? []) as any[]) {
        const arr = votesByDate.get(v.date_id) ?? [];
        arr.push(v);
        votesByDate.set(v.date_id, arr);
      }

      return {
        id:           prop.id,
        name:         prop.name,
        destination:  prop.destination,
        hostUserId:   prop.host_user_id,
        createdBy:    prop.created_by,
        status:       prop.status,
        proposalType: prop.proposal_type,
        dates: dates.map((d) => {
          const dVotes = votesByDate.get(d.id) ?? [];
          const mine = dVotes.find((v) => v.user_id === user?.id);
          return {
            id:        d.id,
            startDate: d.start_date,
            endDate:   d.end_date,
            voteCount: dVotes.filter((v) => v.rank === 1).length,
            myRank:    mine?.rank ?? null,
          };
        }),
      };
    },
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useVoteForTripDate() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      proposalId:   string;
      dateId:       string;
      otherDateIds: string[];
    }) => {
      if (!user?.id) throw new Error('Not signed in');
      if (input.otherDateIds.length > 0) {
        await (supabase as any)
          .from('trip_proposal_votes')
          .delete()
          .in('date_id', input.otherDateIds)
          .eq('user_id', user.id);
      }
      const { error } = await (supabase as any)
        .from('trip_proposal_votes')
        .upsert(
          {
            date_id: input.dateId,
            user_id: user.id,
            rank:    1,
          },
          { onConflict: 'date_id,user_id' },
        );
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['trip-proposal', vars.proposalId] });
    },
  });
}

/**
 * Owner finalizes by picking a winning date range → spawns a trips row
 * + flips trip_proposal.status='finalized'.
 */
export function useFinalizeTripProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      proposalId:  string;
      hostUserId:  string;
      name:        string | null;
      destination: string | null;
      startDate:   string;
      endDate:     string;
    }) => {
      // Create the real trip
      const { error: tripErr } = await (supabase as any)
        .from('trips')
        .insert({
          user_id:    input.hostUserId,
          name:       input.name,
          location:   input.destination,
          start_date: input.startDate,
          end_date:   input.endDate,
          proposal_id: input.proposalId,
        });
      if (tripErr) throw tripErr;

      // Mark proposal as finalized
      await (supabase as any)
        .from('trip_proposals')
        .update({ status: 'finalized' })
        .eq('id', input.proposalId);
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['trip-proposal', vars.proposalId] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
    },
  });
}
