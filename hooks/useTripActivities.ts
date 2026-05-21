/**
 * useTripActivities — read trip_activity_suggestions + trip_activity_votes
 * for a trip proposal. Participants can suggest activities and vote on
 * each other's suggestions.
 *
 * Suggestions stay attached to the proposal indefinitely (via proposal_id).
 * Finalized trips reference the proposal via trips.proposal_id, so the
 * suggestions remain accessible from the trip detail screen too.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export interface TripActivitySuggestion {
  id:           string;
  proposalId:   string;
  title:        string;
  description:  string | null;
  suggestedBy:  string;
  /** Joined display name */
  suggesterName: string;
  voteCount:    number;
  /** Current user's vote rank, or null */
  myRank:       number | null;
  sortOrder:    number;
  createdAt:    Date;
}

export function useTripActivities(proposalId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    enabled: !!proposalId,
    queryKey: ['trip-activities', proposalId, user?.id],
    staleTime: 30_000,
    queryFn: async (): Promise<TripActivitySuggestion[]> => {
      const { data: rows, error } = await (supabase as any)
        .from('trip_activity_suggestions')
        .select('id, proposal_id, title, description, suggested_by, sort_order, created_at')
        .eq('proposal_id', proposalId!)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      const items = (rows ?? []) as any[];
      if (items.length === 0) return [];

      // Join suggester profile names + vote counts
      const suggesterIds = [...new Set(items.map((r) => r.suggested_by))];
      const itemIds = items.map((r) => r.id);
      const [{ data: profs }, { data: voteRows }] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, display_name, first_name')
          .in('user_id', suggesterIds),
        (supabase as any)
          .from('trip_activity_votes')
          .select('suggestion_id, user_id, rank')
          .in('suggestion_id', itemIds),
      ]);
      const nameByUserId = new Map<string, string>();
      for (const p of ((profs ?? []) as any[])) {
        nameByUserId.set(p.user_id, p.first_name || p.display_name || 'Someone');
      }
      const votesBySuggestion = new Map<string, any[]>();
      for (const v of ((voteRows ?? []) as any[])) {
        const arr = votesBySuggestion.get(v.suggestion_id) ?? [];
        arr.push(v);
        votesBySuggestion.set(v.suggestion_id, arr);
      }

      return items.map((r) => {
        const votes = votesBySuggestion.get(r.id) ?? [];
        const mine = votes.find((v) => v.user_id === user?.id);
        return {
          id:            r.id,
          proposalId:    r.proposal_id,
          title:         r.title,
          description:   r.description,
          suggestedBy:   r.suggested_by,
          suggesterName: nameByUserId.get(r.suggested_by) ?? 'Someone',
          voteCount:     votes.length,
          myRank:        mine?.rank ?? null,
          sortOrder:     r.sort_order ?? 0,
          createdAt:     new Date(r.created_at),
        };
      });
    },
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useSuggestActivity() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { proposalId: string; title: string }) => {
      if (!user?.id) throw new Error('Not signed in');
      const { error } = await (supabase as any)
        .from('trip_activity_suggestions')
        .insert({
          proposal_id:  input.proposalId,
          suggested_by: user.id,
          title:        input.title.trim(),
          sort_order:   Date.now(),
        });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['trip-activities', vars.proposalId] });
    },
  });
}

export function useToggleActivityVote() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      proposalId:   string;
      suggestionId: string;
      currentlyVoted: boolean;
    }) => {
      if (!user?.id) throw new Error('Not signed in');
      if (input.currentlyVoted) {
        // Remove my vote
        await (supabase as any)
          .from('trip_activity_votes')
          .delete()
          .eq('suggestion_id', input.suggestionId)
          .eq('user_id', user.id);
      } else {
        // Add a vote (rank=1; multi-pick voting — different from date voting)
        await (supabase as any)
          .from('trip_activity_votes')
          .upsert(
            { suggestion_id: input.suggestionId, user_id: user.id, rank: 1 },
            { onConflict: 'suggestion_id,user_id' },
          );
      }
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['trip-activities', vars.proposalId] });
    },
  });
}
