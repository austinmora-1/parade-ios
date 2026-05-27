/**
 * useReactions — read + toggle emoji reactions on any polymorphic target
 * (plan, comment, photo, vibe, message). Writes to public.reactions with
 * UNIQUE(user_id, target_type, target_id, emoji).
 *
 * Aggregation is done client-side: rows are grouped by emoji and the current
 * user's reactions are flagged via `mine`.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export type ReactionTarget = 'plan' | 'comment' | 'photo' | 'vibe' | 'message';

export interface ReactionRow {
  id:         string;
  emoji:      string;
  user_id:    string;
  created_at: string;
}

export interface ReactionAggregate {
  emoji: string;
  count: number;
  mine:  boolean;       // current user has reacted with this emoji
}

/** Default emoji set offered in the picker. */
export const DEFAULT_REACTION_EMOJIS = ['❤️', '🎉', '🔥', '👏', '😂', '😍', '🙌', '✨'];

export function useReactions(target: ReactionTarget, targetId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    enabled: !!targetId,
    queryKey: ['reactions', target, targetId],
    staleTime: 30_000,
    queryFn: async (): Promise<ReactionAggregate[]> => {
      const { data, error } = await (supabase as any)
        .from('reactions')
        .select('id, emoji, user_id, created_at')
        .eq('target_type', target)
        .eq('target_id',   targetId!)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const rows = (data ?? []) as ReactionRow[];
      const groups = new Map<string, ReactionAggregate>();
      for (const r of rows) {
        const g = groups.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
        g.count += 1;
        if (r.user_id === user?.id) g.mine = true;
        groups.set(r.emoji, g);
      }
      // Sort: mine first, then by count desc, then by emoji
      return Array.from(groups.values()).sort((a, b) => {
        if (a.mine !== b.mine) return a.mine ? -1 : 1;
        if (b.count !== a.count) return b.count - a.count;
        return a.emoji.localeCompare(b.emoji);
      });
    },
  });
}

export function useToggleReaction(target: ReactionTarget, targetId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['reactions', target, targetId];

  return useMutation({
    mutationFn: async (emoji: string) => {
      if (!user?.id)  throw new Error('Not signed in');
      if (!targetId)  throw new Error('No target id');

      // Check if a row exists for this (user, target, emoji)
      const { data: existing, error: selErr } = await (supabase as any)
        .from('reactions')
        .select('id')
        .eq('user_id',     user.id)
        .eq('target_type', target)
        .eq('target_id',   targetId)
        .eq('emoji',       emoji)
        .maybeSingle();
      if (selErr) throw selErr;

      if (existing?.id) {
        const { error } = await (supabase as any)
          .from('reactions')
          .delete()
          .eq('id', existing.id);
        if (error) throw error;
        return { action: 'removed' as const, emoji };
      }
      const { error } = await (supabase as any)
        .from('reactions')
        .insert({
          user_id:     user.id,
          target_type: target,
          target_id:   targetId,
          emoji,
        });
      if (error) throw error;
      return { action: 'added' as const, emoji };
    },
    // Optimistic update
    onMutate: async (emoji: string) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<ReactionAggregate[]>(queryKey) ?? [];
      const idx = prev.findIndex((r) => r.emoji === emoji);
      let next: ReactionAggregate[];
      if (idx === -1) {
        next = [...prev, { emoji, count: 1, mine: true }];
      } else {
        const row = prev[idx];
        if (row.mine) {
          const updated = { ...row, count: row.count - 1, mine: false };
          next = updated.count <= 0
            ? prev.filter((_, i) => i !== idx)
            : prev.map((r, i) => (i === idx ? updated : r));
        } else {
          next = prev.map((r, i) =>
            i === idx ? { ...r, count: r.count + 1, mine: true } : r,
          );
        }
      }
      // Resort like the query does
      next.sort((a, b) => {
        if (a.mine !== b.mine) return a.mine ? -1 : 1;
        if (b.count !== a.count) return b.count - a.count;
        return a.emoji.localeCompare(b.emoji);
      });
      queryClient.setQueryData(queryKey, next);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
}
