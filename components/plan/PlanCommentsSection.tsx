/**
 * PlanCommentsSection — threaded text comments under a plan, visible to
 * everyone with access. Inserts into plan_comments table.
 */
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { MessageCircle, Send } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Avatar } from '@/components/primitives/Avatar';
import { formatDisplayName } from '@/lib/utils';

interface Comment {
  id:        string;
  planId:    string;
  userId:    string;
  content:   string;
  createdAt: Date;
  /** joined */
  authorName:      string;
  authorAvatarUrl: string | null;
}

function useComments(planId: string) {
  return useQuery({
    enabled: !!planId,
    queryKey: ['plan-comments', planId],
    staleTime: 30_000,
    queryFn: async (): Promise<Comment[]> => {
      const { data: rows, error } = await (supabase as any)
        .from('plan_comments')
        .select('id, plan_id, user_id, content, created_at')
        .eq('plan_id', planId)
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) throw error;
      const items = (rows ?? []) as any[];
      if (items.length === 0) return [];

      // Join author profiles (small set, batch one query)
      const ids = [...new Set(items.map((r) => r.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, first_name, last_name, avatar_url')
        .in('user_id', ids);
      const byId = new Map(
        ((profiles ?? []) as any[]).map((p) => [p.user_id, p]),
      );

      return items.map((r) => {
        const p = byId.get(r.user_id);
        return {
          id:              r.id,
          planId:          r.plan_id,
          userId:          r.user_id,
          content:         r.content ?? '',
          createdAt:       new Date(r.created_at),
          authorName: p
            ? formatDisplayName({
                firstName:   p.first_name,
                lastName:    p.last_name,
                displayName: p.display_name,
              }) || 'Someone'
            : 'Someone',
          authorAvatarUrl: p?.avatar_url ?? null,
        };
      });
    },
  });
}

function usePostComment() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { planId: string; content: string }) => {
      if (!user?.id) throw new Error('Not signed in');
      const { error } = await (supabase as any)
        .from('plan_comments')
        .insert({
          plan_id: input.planId,
          user_id: user.id,
          content: input.content.trim(),
        });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['plan-comments', vars.planId] });
    },
  });
}

export function PlanCommentsSection({ planId }: { planId: string }) {
  const { data: comments, isLoading } = useComments(planId);
  const postMut = usePostComment();
  const [draft, setDraft] = useState('');

  const handleSend = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await postMut.mutateAsync({ planId, content: trimmed });
      setDraft('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [draft, planId, postMut]);

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-1.5 px-1">
        <MessageCircle size={12} color="#929298" strokeWidth={2} />
        <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Comments {comments && comments.length > 0 ? `(${comments.length})` : ''}
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#23744D" />
      ) : (
        <View className="bg-white rounded-2xl border border-border/30 shadow-sm overflow-hidden">
          {(comments ?? []).length === 0 ? (
            <View className="px-4 py-5 items-center">
              <Text className="font-sans text-xs text-muted-foreground">
                No comments yet — start the conversation.
              </Text>
            </View>
          ) : (
            (comments ?? []).map((c, i) => (
              <View key={c.id}>
                <View className="flex-row items-start px-4 py-3 gap-3">
                  <Avatar
                    url={c.authorAvatarUrl}
                    displayName={c.authorName}
                    size="xs"
                  />
                  <View className="flex-1 gap-0.5">
                    <View className="flex-row items-center gap-2">
                      <Text className="font-sans text-xs font-semibold text-foreground">
                        {c.authorName}
                      </Text>
                      <Text className="font-sans text-[10px] text-muted-foreground/70">
                        {formatDistanceToNow(c.createdAt, { addSuffix: true })}
                      </Text>
                    </View>
                    <Text className="font-sans text-sm text-foreground leading-relaxed">
                      {c.content}
                    </Text>
                  </View>
                </View>
                {i < (comments?.length ?? 0) - 1 && (
                  <View className="h-px bg-border/30 mx-4" />
                )}
              </View>
            ))
          )}
        </View>
      )}

      {/* Compose row */}
      <View className="flex-row items-center bg-white rounded-2xl border border-border/40 px-3 gap-2 shadow-sm">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Add a comment…"
          placeholderTextColor="#929298"
          className="flex-1 font-sans text-sm text-foreground py-3"
          multiline
          maxLength={500}
          onSubmitEditing={handleSend}
        />
        <Pressable
          onPress={handleSend}
          disabled={!draft.trim() || postMut.isPending}
          hitSlop={4}
          className={`rounded-xl p-2 ${draft.trim() ? 'bg-primary' : 'bg-muted'}`}
        >
          {postMut.isPending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Send size={14} color={draft.trim() ? '#FFFFFF' : '#929298'} strokeWidth={2.2} />
          )}
        </Pressable>
      </View>
    </View>
  );
}
