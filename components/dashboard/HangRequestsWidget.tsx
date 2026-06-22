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
import { useQuery } from '@tanstack/react-query';
import {
  useIncomingHangRequests,
  useAcceptHangRequest,
  useDeclineHangRequest,
  notify,
} from '@/hooks/useHangRequests';
import { supabase } from '@/integrations/supabase/client';
import { usePlannerStore } from '@/stores/plannerStore';
import { useAuth } from '@/hooks/useAuth';
import { TIME_SLOT_LABELS, ACTIVITY_CONFIG } from '@/types/planner';
import type { TimeSlot, ActivityType } from '@/types/planner';

function dayLabel(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d))    return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'EEE, MMM d');
}

/** Vibes the recipient can respond with when accepting. */
const VIBES: { id: string; emoji: string; label: string }[] = [
  { id: 'social', emoji: '🎉', label: 'Social' },
  { id: 'chill', emoji: '🛋️', label: 'Chill' },
  { id: 'athletic', emoji: '🏃', label: 'Active' },
  { id: 'productive', emoji: '💼', label: 'Productive' },
];

/** Optional activity suggestions (subset of ACTIVITY_CONFIG). */
const ACTIVITIES: ActivityType[] = [
  'coffee', 'drinks', 'get-food', 'hanging-out', 'movies', 'gym', 'park',
];

/** A pretty time range from optional start/end "HH:mm" strings. */
function timeRangeLabel(start: string | null, end: string | null): string | null {
  const fmt = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const period = h < 12 || h === 24 ? 'am' : 'pm';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return m === 0 ? `${h12}${period}` : `${h12}:${m.toString().padStart(2, '0')}${period}`;
  };
  if (start && end) return `${fmt(start)}–${fmt(end)}`;
  if (start) return fmt(start);
  return null;
}

export function HangRequestsWidget() {
  const { user } = useAuth();
  const { data: requests, isLoading } = useIncomingHangRequests();
  const acceptMut = useAcceptHangRequest();
  const declineMut = useDeclineHangRequest();
  const addPlan   = usePlannerStore((s) => s.addPlan);
  const friends   = usePlannerStore((s) => s.friends);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Which request is in "respond" mode + the recipient's picks for it.
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [respVibe, setRespVibe] = useState<string | null>(null);
  const [respActivity, setRespActivity] = useState<ActivityType | null>(null);

  // My display name, so the sender's "accepted" notification can say who.
  const { data: myName } = useQuery({
    enabled: !!user?.id,
    queryKey: ['my-display-name', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, first_name')
        .eq('user_id', user!.id)
        .maybeSingle();
      const m = data as any;
      return (m?.first_name || m?.display_name || 'Your friend') as string;
    },
  });

  const friendsByUserId = useMemo(() => {
    const m = new Map<string, any>();
    for (const f of friends) {
      if (f.friendUserId) m.set(f.friendUserId, f);
    }
    return m;
  }, [friends]);

  // "Let's do it" opens the response section instead of accepting outright.
  const openRespond = useCallback((r: any) => {
    Haptics.selectionAsync();
    setRespondingId(r.id);
    setRespVibe(null);
    setRespActivity(null);
  }, []);

  const confirmAccept = useCallback(async (r: any) => {
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

      // Create the plan (confirmed — both parties have aligned). Use the
      // recipient's suggested activity + the sender's optional specific time.
      await addPlan({
        title:    r.message?.trim() || `Hangout with ${r.requesterName}`,
        activity: (respActivity ?? 'meetup') as any,
        date:     parseISO(r.selectedDay),
        timeSlot: r.selectedSlot,
        startTime: r.startTime ?? undefined,
        endTime:   r.endTime ?? undefined,
        duration: 60,
        participants: participants as any,
        status:   'confirmed',
        feedVisibility: 'private',
        blocksAvailability: true,
      } as any);

      // Mark the request accepted + record the recipient's response.
      await acceptMut.mutateAsync({
        id: r.id,
        responseVibe: respVibe,
        responseActivity: respActivity,
      });

      // Close the loop — tell the sender it's on (with the chosen vibe/activity).
      if (r.senderId && user?.id) {
        const vibeLabel = respVibe ? VIBES.find((v) => v.id === respVibe)?.label : null;
        const actLabel = respActivity ? ACTIVITY_CONFIG[respActivity]?.label : null;
        const extra = [vibeLabel, actLabel].filter(Boolean).join(' · ');
        await notify({
          recipientId: r.senderId,
          actorId: user.id,
          type: 'vibe-check-accepted',
          title: `${myName ?? 'Your friend'} is in! 🎉`,
          body: extra ? `${dayLabel(r.selectedDay)} · ${extra}` : `You're on for ${dayLabel(r.selectedDay)}`,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRespondingId(null);
    } catch (err: any) {
      console.error('Accept hang request failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Couldn't create plan", err?.message ?? 'Please try again.');
    } finally {
      setBusyId(null);
    }
  }, [addPlan, acceptMut, friendsByUserId, respVibe, respActivity, myName, user?.id]);

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
        <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Vibe checks
        </Text>
        <View className="ml-auto bg-secondary/15 rounded-full px-2 py-0.5">
          <Text className="font-sans text-xs text-secondary font-semibold">
            {requests.length}
          </Text>
        </View>
      </View>

      <View className="gap-2">
        {requests.map((r) => {
          const slotLabel = TIME_SLOT_LABELS[r.selectedSlot as TimeSlot]?.label ?? '';
          const timeRange = timeRangeLabel(r.startTime, r.endTime);
          const busy = busyId === r.id;
          const responding = respondingId === r.id;
          return (
            <View
              key={r.id}
              className="bg-card rounded-2xl border border-border/30 overflow-hidden shadow-sm"
            >
              <View className="px-4 py-3 gap-1">
                <Text className="font-display text-[17px] text-foreground">
                  {r.requesterName}
                </Text>
                <Text className="font-sans text-xs text-muted-foreground">
                  {dayLabel(r.selectedDay)} · {timeRange ? `${timeRange}` : slotLabel}
                </Text>
                {r.message && (
                  <Text className="font-sans text-xs text-foreground/80 leading-relaxed mt-1">
                    "{r.message}"
                  </Text>
                )}
              </View>

              {responding ? (
                /* Response section — pick a vibe + optional activity */
                <View className="px-4 pb-3 pt-1 gap-3 border-t border-border/20">
                  <View className="gap-1.5">
                    <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Your vibe?
                    </Text>
                    <View className="flex-row flex-wrap gap-1.5">
                      {VIBES.map((v) => {
                        const sel = respVibe === v.id;
                        return (
                          <Pressable
                            key={v.id}
                            onPress={() => { Haptics.selectionAsync(); setRespVibe(sel ? null : v.id); }}
                            className={`flex-row items-center gap-1 rounded-full border px-2.5 py-1.5 active:opacity-70 ${
                              sel ? 'bg-primary border-primary' : 'bg-card border-border/40'
                            }`}
                          >
                            <Text style={{ fontSize: 12 }}>{v.emoji}</Text>
                            <Text className={`font-sans text-xs font-semibold ${sel ? 'text-white' : 'text-foreground'}`}>
                              {v.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View className="gap-1.5">
                    <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Suggest an activity (optional)
                    </Text>
                    <View className="flex-row flex-wrap gap-1.5">
                      {ACTIVITIES.map((a) => {
                        const cfg = ACTIVITY_CONFIG[a];
                        if (!cfg) return null;
                        const sel = respActivity === a;
                        return (
                          <Pressable
                            key={a}
                            onPress={() => { Haptics.selectionAsync(); setRespActivity(sel ? null : a); }}
                            className={`rounded-full border px-2.5 py-1.5 active:opacity-70 ${
                              sel ? 'bg-primary/10 border-primary/50' : 'bg-card border-border/40'
                            }`}
                          >
                            <Text className="font-sans text-xs font-medium text-foreground">
                              {cfg.icon} {cfg.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View className="flex-row gap-2 pt-0.5">
                    <Pressable
                      onPress={() => setRespondingId(null)}
                      disabled={busy}
                      className="rounded-xl border border-border/40 px-4 py-2.5 active:opacity-70"
                    >
                      <Text className="font-sans text-[13px] font-semibold text-muted-foreground">Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => confirmAccept(r)}
                      disabled={busy}
                      className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 ${
                        busy ? 'bg-muted' : 'bg-primary active:opacity-90'
                      }`}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Check size={14} color="#FFFFFF" strokeWidth={2.5} />
                      )}
                      <Text className="font-sans text-[13px] font-semibold text-white">
                        {busy ? 'Confirming…' : 'Confirm'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                /* Action row */
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
                        <Text className="font-sans text-[13px] font-semibold text-secondary">
                          Pass
                        </Text>
                      </>
                    )}
                  </Pressable>
                  <View className="w-px bg-border/30" />
                  <Pressable
                    onPress={() => openRespond(r)}
                    disabled={busy}
                    className="flex-1 flex-row items-center justify-center gap-1.5 py-3 active:bg-primary/5"
                  >
                    <Check size={14} color="#23744D" strokeWidth={2.5} />
                    <Text className="font-sans text-[13px] font-semibold text-primary">
                      Let's do it
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
