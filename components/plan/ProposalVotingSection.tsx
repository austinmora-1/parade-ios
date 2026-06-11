/**
 * ProposalVotingSection — "Vote on a time" option list with vote counts and
 * the owner-only "Pick this" finalize action. Renders null unless the plan
 * is still proposed and has options. Owns its own query + mutations.
 */
import { View, Text, Pressable, Alert } from 'react-native';
import { Check } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import * as Haptics from 'expo-haptics';
import {
  usePlanProposal,
  useVoteForOption,
  useFinalizeProposal,
} from '@/hooks/usePlanProposal';
import { TIME_SLOT_LABELS } from '@/types/planner';
import { TINT } from '@/lib/colors';

export function ProposalVotingSection({
  planId,
  planStatus,
  isOwner,
}: {
  planId: string;
  planStatus: string | null | undefined;
  isOwner: boolean;
}) {
  const { data: proposalOptions } = usePlanProposal(planId);
  const voteForOptionMut = useVoteForOption();
  const finalizeMut      = useFinalizeProposal();

  if ((proposalOptions?.length ?? 0) === 0 || planStatus !== 'proposed') return null;

  return (
    <View className="gap-2">
      <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-1">
        Vote on a time
      </Text>
      <View className="bg-card rounded-2xl border border-border/30 shadow-sm overflow-hidden">
        {proposalOptions!.map((opt, i) => {
          const dateObj = parseISO(opt.date);
          const slotLabel = TIME_SLOT_LABELS[opt.timeSlot]?.time ?? '';
          const isMyPick = opt.myRank === 1;
          const otherIds = proposalOptions!.filter((o) => o.id !== opt.id).map((o) => o.id);
          return (
            <View key={opt.id}>
              <Pressable
                onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  try {
                    await voteForOptionMut.mutateAsync({
                      planId,
                      optionId: opt.id,
                      otherOptionIds: otherIds,
                    });
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  } catch (err) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                  }
                }}
                disabled={voteForOptionMut.isPending}
                className={`px-4 py-3 flex-row items-center gap-3 ${
                  isMyPick ? 'bg-primary/8' : 'active:bg-muted/30'
                }`}
              >
                <View
                  style={{
                    width: 22, height: 22, borderRadius: 999,
                    borderWidth: 2,
                    borderColor: isMyPick ? '#23744D' : TINT.grayStrong,
                    backgroundColor: isMyPick ? '#23744D' : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {isMyPick && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                </View>
                <View className="flex-1">
                  <Text className="font-display text-sm text-foreground">
                    {format(dateObj, 'EEE, MMM d')}
                  </Text>
                  {slotLabel && (
                    <Text className="font-sans text-xs text-muted-foreground mt-0.5">
                      {slotLabel}
                    </Text>
                  )}
                </View>
                <View className="items-end">
                  <Text className="font-display text-sm text-foreground">
                    {opt.voteCount}
                  </Text>
                  <Text className="font-sans text-[10px] text-muted-foreground">
                    vote{opt.voteCount === 1 ? '' : 's'}
                  </Text>
                </View>
                {/* Owner finalize */}
                {isOwner && (
                  <Pressable
                    onPress={async (e) => {
                      e.stopPropagation?.();
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      try {
                        await finalizeMut.mutateAsync({
                          planId,
                          date: opt.date,
                          timeSlot: opt.timeSlot,
                        });
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      } catch (err: any) {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                        Alert.alert('Could not finalize', err?.message ?? 'Please try again.');
                      }
                    }}
                    hitSlop={4}
                    className="bg-primary/10 rounded-xl px-2 py-1 ml-1 active:opacity-70"
                  >
                    <Text className="font-sans text-[11px] font-semibold text-primary">
                      Pick this
                    </Text>
                  </Pressable>
                )}
              </Pressable>
              {i < proposalOptions!.length - 1 && (
                <View className="h-px bg-border/30 mx-4" />
              )}
            </View>
          );
        })}
      </View>
      <Text className="font-sans text-[11px] text-muted-foreground px-1">
        {isOwner
          ? 'Tap "Pick this" once everyone has voted to confirm the time.'
          : 'Tap to vote for your top choice.'}
      </Text>
    </View>
  );
}
