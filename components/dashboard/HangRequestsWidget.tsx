/**
 * HangRequestsWidget — pending incoming pings ("Hey, free Friday?")
 * surfaced on the Home dashboard. Each request gets an inline
 * Accept (→ creates plan + closes request) / Decline (→ marks declined).
 *
 * Returns null when there are no pending requests.
 */
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useState, useCallback, useMemo } from 'react';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { MessageCircle, Check, X } from 'lucide-react-native';
import {
  useIncomingHangRequests,
  useAcceptHangRequest,
  useDeclineHangRequest,
} from '@/hooks/useHangRequests';
import { usePlannerStore } from '@/stores/plannerStore';
import { useAuth } from '@/hooks/useAuth';
import { TIME_SLOT_LABELS } from '@/types/planner';
import type { TimeSlot } from '@/types/planner';

function dayLabel(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d))    return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'EEE, MMM d');
}

export function HangRequestsWidget() {
  const { user } = useAuth();
  const { data: requests, isLoading } = useIncomingHangRequests();
  const acceptMut = useAcceptHangRequest();
  const declineMut = useDeclineHangRequest();
  const addPlan   = usePlannerStore((s) => s.addPlan);
  const friends   = usePlannerStore((s) => s.friends);
  const [busyId, setBusyId] = useState<string | null>(null);

  const friendsByUserId = useMemo(() => {
    const m = new Map<string, any>();
    for (const f of friends) {
      if (f.friendUserId) m.set(f.friendUserId, f);
    }
    return m;
  }, [friends]);

  const handleAccept = useCallback(async (r: any) => {
    setBusyId(r.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      // Look up the requester in friends to get id + name for participants
      const requesterFriend = r.senderId ? friendsByUserId.get(r.senderId) : null;
      const participants = requesterFriend
        ? [{
            id:           requesterFriend.id,
            friendUserId: r.senderId,
            name:         requesterFriend.name,
            avatar:       requesterFriend.avatar,
            status:       'connected',
            role:         'participant',
          }]
        : [];

      // Create the plan (status=confirmed since both parties have already aligned)
      await addPlan({
        title:    r.message?.trim() || `Hangout with ${r.requesterName}`,
        activity: 'meetup' as any,
        date:     parseISO(r.selectedDay),
        timeSlot: r.selectedSlot,
        duration: 60,
        participants: participants as any,
        status:   'confirmed',
        feedVisibility: 'private',
        blocksAvailability: true,
      } as any);

      // Mark the request accepted
      await acceptMut.mutateAsync(r.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error('Accept hang request failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Couldn't create plan", err?.message ?? 'Please try again.');
    } finally {
      setBusyId(null);
    }
  }, [addPlan, acceptMut, friendsByUserId]);

  const handleDecline = useCallback((r: any) => {
    Alert.alert(
      'Pass on this?',
      `${r.requesterName} won't be notified.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setBusyId(r.id);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            try {
              await declineMut.mutateAsync(r.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (err) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  }, [declineMut]);

  if (isLoading || !requests || requests.length === 0) return null;

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-1.5 px-0.5">
        <MessageCircle size={12} color="#D46549" strokeWidth={2} />
        <Text className="font-sans text-[13px] font-semibold uppercase tracking-widest text-muted-foreground">
          Pings for you
        </Text>
        <View className="ml-auto bg-secondary/15 rounded-full px-2 py-0.5">
          <Text className="font-sans text-sm text-secondary font-semibold">
            {requests.length}
          </Text>
        </View>
      </View>

      <View className="gap-2">
        {requests.map((r) => {
          const slotLabel = TIME_SLOT_LABELS[r.selectedSlot as TimeSlot]?.time ?? '';
          const busy = busyId === r.id;
          return (
            <View
              key={r.id}
              className="bg-card rounded-2xl border border-border/30 overflow-hidden shadow-sm"
            >
              <View className="px-4 py-3 gap-1">
                <Text className="font-display text-xl text-foreground">
                  {r.requesterName}
                </Text>
                <Text className="font-sans text-sm text-muted-foreground">
                  {dayLabel(r.selectedDay)} · {slotLabel}
                </Text>
                {r.message && (
                  <Text className="font-sans text-sm text-foreground/80 leading-relaxed mt-1">
                    "{r.message}"
                  </Text>
                )}
              </View>

              {/* Action row */}
              <View className="flex-row border-t border-border/20">
                <Pressable
                  onPress={() => handleDecline(r)}
                  disabled={busy}
                  className="flex-1 flex-row items-center justify-center gap-1.5 py-3 active:bg-muted/20"
                >
                  {busy && declineMut.isPending ? (
                    <ActivityIndicator size="small" color="#D46549" />
                  ) : (
                    <>
                      <X size={14} color="#D46549" strokeWidth={2.2} />
                      <Text className="font-sans text-[15px] font-semibold text-secondary">
                        Pass
                      </Text>
                    </>
                  )}
                </Pressable>
                <View className="w-px bg-border/30" />
                <Pressable
                  onPress={() => handleAccept(r)}
                  disabled={busy}
                  className="flex-1 flex-row items-center justify-center gap-1.5 py-3 active:bg-primary/5"
                >
                  {busy && acceptMut.isPending ? (
                    <ActivityIndicator size="small" color="#23744D" />
                  ) : (
                    <>
                      <Check size={14} color="#23744D" strokeWidth={2.5} />
                      <Text className="font-sans text-[15px] font-semibold text-primary">
                        Let's do it
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
