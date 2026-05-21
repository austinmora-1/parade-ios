/**
 * useHangRequests — query + mutate hang_requests rows.
 *
 * Hang requests are lightweight async pings: "Hey, free Friday evening?"
 * They're separate from plan invites. On accept, a plan is created and
 * the request status flips to 'accepted'.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { TimeSlot } from '@/types/planner';

export interface HangRequest {
  id:             string;
  userId:         string;      // recipient
  senderId:       string | null;
  requesterName:  string;
  selectedDay:    string;      // yyyy-MM-dd
  selectedSlot:   TimeSlot;
  message:        string | null;
  status:         'pending' | 'accepted' | 'declined';
  createdAt:      Date;
}

function mapRow(r: any): HangRequest {
  return {
    id:             r.id,
    userId:         r.user_id,
    senderId:       r.sender_id,
    requesterName:  r.requester_name,
    selectedDay:    r.selected_day,
    selectedSlot:   r.selected_slot,
    message:        r.message,
    status:         r.status,
    createdAt:      new Date(r.created_at),
  };
}

/** Incoming pending hang requests for the current user */
export function useIncomingHangRequests() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user?.id,
    queryKey: ['hang-requests', 'incoming', user?.id],
    staleTime: 30_000,
    queryFn: async (): Promise<HangRequest[]> => {
      const { data, error } = await (supabase as any)
        .from('hang_requests')
        .select('*')
        .eq('user_id', user!.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
  });
}

/** Outgoing hang requests this user has sent */
export function useOutgoingHangRequests() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user?.id,
    queryKey: ['hang-requests', 'outgoing', user?.id],
    staleTime: 30_000,
    queryFn: async (): Promise<HangRequest[]> => {
      const { data, error } = await (supabase as any)
        .from('hang_requests')
        .select('*')
        .eq('sender_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useSendHangRequest() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      recipientUserId: string;
      requesterName:   string;
      selectedDay:     string;
      selectedSlot:    TimeSlot;
      message?:        string;
    }) => {
      if (!user?.id) throw new Error('Not signed in');

      // Recipient's share_code is required on the row
      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('share_code')
        .eq('user_id', input.recipientUserId)
        .maybeSingle();
      if (profErr) throw profErr;
      const shareCode = (prof as any)?.share_code;
      if (!shareCode) throw new Error("Recipient hasn't shared their availability");

      const { error: insertErr } = await (supabase as any)
        .from('hang_requests')
        .insert({
          user_id:        input.recipientUserId,
          sender_id:      user.id,
          requester_name: input.requesterName,
          selected_day:   input.selectedDay,
          selected_slot:  input.selectedSlot,
          message:        input.message ?? null,
          share_code:     shareCode,
          status:         'pending',
        });
      if (insertErr) throw insertErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hang-requests', 'outgoing'] });
    },
  });
}

export function useDeclineHangRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('hang_requests')
        .update({ status: 'declined' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hang-requests'] });
    },
  });
}

/**
 * Accept a hang request → flip status='accepted'. Plan creation happens
 * in the screen layer so the user can edit details before saving.
 */
export function useAcceptHangRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('hang_requests')
        .update({ status: 'accepted' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hang-requests'] });
    },
  });
}
