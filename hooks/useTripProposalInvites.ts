/**
 * useTripProposalInvites — pending trip-proposal invitations for the
 * current user (proposals they've been invited to but haven't finalized
 * voting on yet).
 *
 * Surfaced on the Home dashboard via TripProposalInvitesWidget so users
 * see when friends are planning trips with them.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export interface TripProposalInvite {
  inviteId:     string;
  proposalId:   string;
  proposalName: string | null;
  destination:  string | null;
  hostUserId:   string | null;
  hostName:     string;
  dateCount:    number;
  createdAt:    Date;
}

export function useTripProposalInvites() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user?.id,
    queryKey: ['trip-proposal-invites', user?.id],
    staleTime: 30_000,
    queryFn: async (): Promise<TripProposalInvite[]> => {
      // Get invites where I'm the recipient and proposal isn't finalized
      const { data: invites, error } = await (supabase as any)
        .from('trip_proposal_invites')
        .select(`
          id, proposal_id, created_at,
          trip_proposals!inner (
            id, name, destination, host_user_id, status,
            trip_proposal_dates (id)
          )
        `)
        .eq('accepted_by', user!.id)
        .eq('status', 'pending');
      if (error) throw error;
      const rows = ((invites ?? []) as any[]).filter(
        (r) => r.trip_proposals?.status === 'pending',
      );
      if (rows.length === 0) return [];

      // Join host display names in one batch
      const hostIds = [
        ...new Set(rows.map((r) => r.trip_proposals.host_user_id).filter(Boolean)),
      ] as string[];
      const hostNames = new Map<string, string>();
      if (hostIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, display_name, first_name')
          .in('user_id', hostIds);
        for (const p of ((profs ?? []) as any[])) {
          hostNames.set(
            p.user_id,
            p.first_name || p.display_name || 'A friend',
          );
        }
      }

      return rows.map((r) => {
        const prop = r.trip_proposals;
        return {
          inviteId:     r.id,
          proposalId:   prop.id,
          proposalName: prop.name,
          destination:  prop.destination,
          hostUserId:   prop.host_user_id,
          hostName:     hostNames.get(prop.host_user_id) ?? 'A friend',
          dateCount:    (prop.trip_proposal_dates ?? []).length,
          createdAt:    new Date(r.created_at),
        };
      });
    },
  });
}
