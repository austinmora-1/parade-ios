/**
 * TripActivitiesSection — collaborative activity board for a trip proposal.
 * Anyone with access can suggest activities; everyone votes (multi-pick,
 * not ranked) for the ones they're excited about.
 *
 * Used on the trip-proposal screen. Suggestions survive proposal
 * finalization because trips.proposal_id keeps the link alive.
 */
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useState, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { Sparkles, Heart, Plus } from 'lucide-react-native';
import {
  useTripActivities,
  useSuggestActivity,
  useToggleActivityVote,
} from '@/hooks/useTripActivities';

export function TripActivitiesSection({ proposalId }: { proposalId: string }) {
  const { data: activities, isLoading } = useTripActivities(proposalId);
  const suggestMut = useSuggestActivity();
  const voteMut    = useToggleActivityVote();
  const [draft, setDraft] = useState('');

  const handleSuggest = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await suggestMut.mutateAsync({ proposalId, title: trimmed });
      setDraft('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [draft, proposalId, suggestMut]);

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-1.5 px-1">
        <Sparkles size={12} color="#DFA53A" strokeWidth={2} />
        <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Activities {activities && activities.length > 0 ? `(${activities.length})` : ''}
        </Text>
      </View>

      {isLoading ? (
        <View className="bg-card rounded-2xl border border-border/30 px-4 py-5 items-center shadow-sm">
          <ActivityIndicator color="#23744D" />
        </View>
      ) : (activities ?? []).length === 0 ? (
        <View className="bg-card rounded-2xl border border-dashed border-border/40 px-4 py-5 items-center gap-1">
          <Text className="font-sans text-sm text-muted-foreground">
            No suggestions yet
          </Text>
          <Text className="font-sans text-xs text-muted-foreground/60 text-center">
            Add something fun the group could do.
          </Text>
        </View>
      ) : (
        <View className="bg-card rounded-2xl border border-border/30 shadow-sm overflow-hidden">
          {(activities ?? []).map((a, i) => {
            const voted = a.myRank !== null;
            return (
              <View key={a.id}>
                <View className="px-4 py-3 flex-row items-center gap-3">
                  <View className="flex-1">
                    <Text
                      className="font-display text-sm text-foreground"
                      numberOfLines={2}
                    >
                      {a.title}
                    </Text>
                    <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
                      Suggested by {a.suggesterName}
                    </Text>
                  </View>
                  <Pressable
                    onPress={async () => {
                      Haptics.selectionAsync();
                      try {
                        await voteMut.mutateAsync({
                          proposalId,
                          suggestionId:   a.id,
                          currentlyVoted: voted,
                        });
                      } catch {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                      }
                    }}
                    disabled={voteMut.isPending}
                    hitSlop={6}
                    className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 active:opacity-70 ${
                      voted ? 'bg-secondary/15' : 'bg-muted/40'
                    }`}
                  >
                    <Heart
                      size={12}
                      color={voted ? '#D46549' : '#929298'}
                      strokeWidth={2.2}
                      fill={voted ? '#D46549' : 'transparent'}
                    />
                    <Text
                      className={`font-sans text-xs font-semibold ${
                        voted ? 'text-secondary' : 'text-muted-foreground'
                      }`}
                    >
                      {a.voteCount}
                    </Text>
                  </Pressable>
                </View>
                {i < (activities?.length ?? 0) - 1 && (
                  <View className="h-px bg-border/30 mx-4" />
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Suggest input */}
      <View className="flex-row items-center bg-card rounded-2xl border border-border/40 px-3 gap-2 shadow-sm">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Suggest an activity…"
          placeholderTextColor="#929298"
          className="flex-1 font-sans text-sm text-foreground py-3"
          maxLength={120}
          onSubmitEditing={handleSuggest}
        />
        <Pressable
          onPress={handleSuggest}
          disabled={!draft.trim() || suggestMut.isPending}
          hitSlop={4}
          className={`rounded-xl p-2 ${draft.trim() ? 'bg-primary' : 'bg-muted'}`}
        >
          {suggestMut.isPending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Plus size={14} color={draft.trim() ? '#FFFFFF' : '#929298'} strokeWidth={2.2} />
          )}
        </Pressable>
      </View>
    </View>
  );
}
