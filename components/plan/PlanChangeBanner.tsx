/**
 * PlanChangeBanner — "Change proposed" banner with Accept / Keep-original
 * actions for pending participants. Renders null when there is no pending
 * change request. Owns its own query + mutation via usePlanChangeRequests.
 */
import { View, Text, Pressable } from 'react-native';
import { AlertCircle, Check, X } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import * as Haptics from 'expo-haptics';
import {
  usePlanChangeRequest,
  useRespondToChange,
} from '@/hooks/usePlanChangeRequests';
import { TINT } from '@/lib/colors';

export function PlanChangeBanner({
  planId,
  currentUserId,
}: {
  planId: string;
  currentUserId: string | undefined;
}) {
  const { data: pendingChange } = usePlanChangeRequest(planId);
  const respondChangeMut = useRespondToChange();

  if (!pendingChange) return null;

  const pendingCount = pendingChange.responses.filter((r) => r.response === 'pending').length;
  const acceptedCount = pendingChange.responses.filter((r) => r.response === 'accepted').length;
  const canRespond =
    pendingChange.proposedBy !== currentUserId &&
    pendingChange.responses.some(
      (r) => r.participantId === currentUserId && r.response === 'pending',
    );

  const respond = async (response: 'accepted' | 'declined') => {
    Haptics.impactAsync(
      response === 'accepted'
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light,
    );
    try {
      await respondChangeMut.mutateAsync({
        changeRequestId: pendingChange.id,
        response,
        planId,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); }
  };

  return (
    <View
      className="bg-card rounded-2xl border overflow-hidden shadow-sm"
      style={{ borderColor: TINT.amberStrong }}
    >
      <View className="px-4 py-3 gap-1">
        <View className="flex-row items-center gap-1.5">
          <AlertCircle size={14} color="#92400E" strokeWidth={2} />
          <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#92400E' }}>
            Change proposed
          </Text>
        </View>
        <Text className="font-display text-sm text-foreground mt-1">
          Move to{' '}
          {pendingChange.proposedDate
            ? format(parseISO(pendingChange.proposedDate), 'EEE, MMM d')
            : 'a new date'}
          {pendingChange.proposedTimeSlot ? ` · ${pendingChange.proposedTimeSlot.replace('-', ' ')}` : ''}
        </Text>
        <Text className="font-sans text-xs text-muted-foreground mt-0.5">
          Waiting for {pendingCount} response
          {pendingCount === 1 ? '' : 's'} · {acceptedCount} accepted
        </Text>
      </View>

      {/* Show Accept/Decline if user is a non-proposer participant with pending response */}
      {canRespond && (
        <View className="flex-row border-t border-border/20">
          <Pressable
            onPress={() => respond('declined')}
            className="flex-1 flex-row items-center justify-center gap-1.5 py-3 active:bg-muted/20"
          >
            <X size={14} color="#D46549" strokeWidth={2.2} />
            <Text className="font-sans text-sm font-semibold text-secondary">
              Keep original
            </Text>
          </Pressable>
          <View className="w-px bg-border/30" />
          <Pressable
            onPress={() => respond('accepted')}
            className="flex-1 flex-row items-center justify-center gap-1.5 py-3 active:bg-primary/5"
          >
            <Check size={14} color="#23744D" strokeWidth={2.5} />
            <Text className="font-sans text-sm font-semibold text-primary">
              Accept change
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
