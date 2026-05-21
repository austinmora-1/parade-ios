/**
 * usePods — query and mutate the current user's pods (named friend groups).
 *
 * Tables: pods (id, user_id, name, emoji, sort_order), pod_members
 * (pod_id, friend_user_id). RLS on both restricts to owner.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export interface Pod {
  id:        string;
  name:      string;
  emoji:     string | null;
  sortOrder: number;
  /** friend_user_id list, derived from pod_members join */
  memberIds: string[];
}

export const POD_EMOJIS = [
  '💜', '🔥', '⭐', '🎯', '🏠', '🎉',
  '💪', '🌿', '🎵', '☕', '🍻', '🧘',
];

/** All pods the current user owns, with members joined */
export function usePods() {
  const { user } = useAuth();

  return useQuery({
    enabled: !!user?.id,
    queryKey: ['pods', user?.id],
    staleTime: 60_000,
    queryFn: async (): Promise<Pod[]> => {
      const { data, error } = await (supabase as any)
        .from('pods')
        .select('id, name, emoji, sort_order, pod_members(friend_user_id)')
        .eq('user_id', user!.id)
        .order('sort_order', { ascending: true });
      if (error) throw error;

      return ((data ?? []) as any[]).map((p) => ({
        id:        p.id,
        name:      p.name,
        emoji:     p.emoji,
        sortOrder: p.sort_order ?? 0,
        memberIds: (p.pod_members ?? []).map((m: any) => m.friend_user_id),
      }));
    },
  });
}

/** Single pod by id (for the detail screen) */
export function usePod(podId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    enabled: !!user?.id && !!podId,
    queryKey: ['pod', podId],
    queryFn: async (): Promise<Pod | null> => {
      const { data, error } = await (supabase as any)
        .from('pods')
        .select('id, name, emoji, sort_order, pod_members(friend_user_id)')
        .eq('id', podId!)
        .single();
      if (error) throw error;
      if (!data) return null;
      return {
        id:        data.id,
        name:      data.name,
        emoji:     data.emoji,
        sortOrder: data.sort_order ?? 0,
        memberIds: (data.pod_members ?? []).map((m: any) => m.friend_user_id),
      };
    },
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useCreatePod() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name:      string;
      emoji?:    string;
      memberIds: string[];
    }) => {
      if (!user?.id) throw new Error('Not signed in');
      const { data: pod, error: insertErr } = await (supabase as any)
        .from('pods')
        .insert({
          user_id:    user.id,
          name:       input.name.trim(),
          emoji:      input.emoji ?? null,
          sort_order: 0,
        })
        .select()
        .single();
      if (insertErr) throw insertErr;

      if (input.memberIds.length > 0) {
        const rows = input.memberIds.map((friend_user_id) => ({
          pod_id: pod.id,
          friend_user_id,
        }));
        const { error: memErr } = await (supabase as any)
          .from('pod_members')
          .insert(rows);
        if (memErr) throw memErr;
      }
      return pod.id as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pods'] });
    },
  });
}

export function useUpdatePod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id:        string;
      name?:     string;
      emoji?:    string | null;
      memberIds: string[];
    }) => {
      const updates: Record<string, any> = {};
      if (input.name !== undefined)  updates.name  = input.name.trim();
      if (input.emoji !== undefined) updates.emoji = input.emoji;

      if (Object.keys(updates).length > 0) {
        const { error } = await (supabase as any)
          .from('pods')
          .update(updates)
          .eq('id', input.id);
        if (error) throw error;
      }

      // Reconcile members: delete what's gone, insert what's new
      const { data: existing, error: exErr } = await (supabase as any)
        .from('pod_members')
        .select('id, friend_user_id')
        .eq('pod_id', input.id);
      if (exErr) throw exErr;

      const desired = new Set(input.memberIds);
      const toDelete = (existing ?? []).filter(
        (r: any) => !desired.has(r.friend_user_id),
      );
      const have = new Set((existing ?? []).map((r: any) => r.friend_user_id));
      const toInsert = input.memberIds
        .filter((id) => !have.has(id))
        .map((friend_user_id) => ({ pod_id: input.id, friend_user_id }));

      if (toDelete.length > 0) {
        await (supabase as any)
          .from('pod_members')
          .delete()
          .in('id', toDelete.map((r: any) => r.id));
      }
      if (toInsert.length > 0) {
        await (supabase as any)
          .from('pod_members')
          .insert(toInsert);
      }
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['pods'] });
      queryClient.invalidateQueries({ queryKey: ['pod', vars.id] });
    },
  });
}

export function useDeletePod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (podId: string) => {
      // pod_members deletes cascade via FK
      const { error } = await (supabase as any)
        .from('pods')
        .delete()
        .eq('id', podId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pods'] });
    },
  });
}
