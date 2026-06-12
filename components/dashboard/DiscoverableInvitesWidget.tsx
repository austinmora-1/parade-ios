/**
 * DiscoverableInvitesWidget — friends' OPEN INVITES you could claim.
 *
 * Reads the open_invites table (audience-scoped by RLS, 48h expiry) — the
 * same surface the PWA's incoming-invites widget reads, so broadcasts from
 * either platform appear here. Claiming calls the claim-open-invite edge
 * function; the first claimer locks in the plan.
 *
 * Distinct from OpenInvitesWidget (plans you were specifically invited to).
 * Returns null when nothing to surface.
 */
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { useState, useCallback } from 'react';
import { format, isToday, isTomorrow, formatDistanceToNow, parseISO } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { Megaphone, Check, X as XIcon, Clock, MapPin } from 'lucide-react-native';
import { usePlannerStore } from '@/stores/plannerStore';
import {
  useIncomingOpenInvites,
  useClaimOpenInvite,
  useDeclineOpenInvite,
} from '@/hooks/useOpenInvites';
import { TIME_SLOT_LABELS } from '@/types/planner';
import type { TimeSlot } from '@/types/planner';
import { activityAccent } from '@/lib/activityColors';
import { TC } from '@/lib/theme';
import { TINT } from '@/lib/colors';

const DEFAULT_ACCENT = '#DFA53A'; // marigold for discovery

function dayLabel(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'EEE, MMM d');
}

export function DiscoverableInvitesWidget() {
  const friends = usePlannerStore((s) => s.friends);
  const { data: invites, isLoading } = useIncomingOpenInvites();
  const claimMut = useClaimOpenInvite();
  const declineMut = useDeclineOpenInvite();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const nameFor = useCallback(
    (userId: string) =>
      friends.find((f) => f.friendUserId === userId)?.name?.split(' ')[0] ?? 'A friend',
    [friends],
  );

  const handleClaim = useCallback(async (inviteId: string) => {
    setBusyId(inviteId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await claimMut.mutateAsync(inviteId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (result?.plan_id) router.push(`/(app)/plan/${result.plan_id}`);
    } catch (err: any) {
      console.error('Claim open invite failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Couldn't claim", err?.message ?? 'It may have just been claimed by someone else.');
    } finally {
      setBusyId(null);
    }
  }, [claimMut]);

  const handleDecline = useCallback(async (inviteId: string) => {
    Haptics.selectionAsync();
    setHidden((prev) => new Set(prev).add(inviteId));
    declineMut.mutate(inviteId);
  }, [declineMut]);

  const visible = (invites ?? []).filter((i) => !hidden.has(i.id));
  if (isLoading || visible.length === 0) return null;

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-1.5 px-0.5">
        <Megaphone size={12} color="#DFA53A" strokeWidth={2} />
        <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Open invites
        </Text>
        <View className="ml-auto bg-marigold/15 rounded-full px-2 py-0.5">
          <Text className="font-sans text-xs text-marigold font-semibold">
            {visible.length}
          </Text>
        </View>
      </View>

      <View className="gap-2">
        {visible.slice(0, 5).map((inv) => {
          const accent = activityAccent(inv.activity, DEFAULT_ACCENT);
          const slotLabel = TIME_SLOT_LABELS[inv.time_slot as TimeSlot]?.time ?? '';
          const busy = busyId === inv.id;
          const owner = nameFor(inv.user_id);

          return (
            <View
              key={inv.id}
              className="bg-card rounded-2xl border border-border/30 overflow-hidden shadow-sm"
            >
              <View className="flex-row">
                <View style={{ width: 4, backgroundColor: accent }} />
                <View className="flex-1 px-4 py-3 gap-1">
                  <View className="flex-row items-start justify-between gap-2">
                    <Text className="font-display text-[17px] text-foreground flex-1" numberOfLines={1}>
                      {inv.title}
                    </Text>
                    <Text className="font-sans text-xs text-muted-foreground">
                      {dayLabel(inv.date)}
                    </Text>
                  </View>

                  <View className="flex-row items-center gap-3 flex-wrap">
                    {slotLabel ? (
                      <View className="flex-row items-center gap-1">
                        <Clock size={11} color={TC.muted} strokeWidth={1.75} />
                        <Text className="font-sans text-xs text-muted-foreground">{slotLabel}</Text>
                      </View>
                    ) : null}
                    {inv.location ? (
                      <View className="flex-row items-center gap-1 flex-shrink">
                        <MapPin size={11} color={TC.muted} strokeWidth={1.75} />
                        <Text className="font-sans text-xs text-muted-foreground" numberOfLines={1}>
                          {inv.location}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {inv.notes ? (
                    <Text className="font-sans text-[11px] text-foreground/70 leading-relaxed" numberOfLines={2}>
                      "{inv.notes}"
                    </Text>
                  ) : null}

                  <Text className="font-sans text-[11px] text-muted-foreground/80 mt-0.5">
                    {owner} is looking for company · expires{' '}
                    {formatDistanceToNow(parseISO(inv.expires_at), { addSuffix: true })}
                  </Text>
                </View>
              </View>

              {/* Action row: Not now / I'm in (claim) */}
              <View className="flex-row border-t border-border/20">
                <Pressable
                  onPress={() => handleDecline(inv.id)}
                  className="flex-1 flex-row items-center justify-center gap-1.5 py-3 active:bg-muted/20"
                >
                  <XIcon size={14} color={TINT.graySolid} strokeWidth={2} />
                  <Text className="font-sans text-[13px] font-semibold text-muted-foreground">
                    Not now
                  </Text>
                </Pressable>
                <View className="w-px bg-border/30" />
                <Pressable
                  onPress={() => handleClaim(inv.id)}
                  disabled={busy}
                  className="flex-1 flex-row items-center justify-center gap-1.5 py-3 active:bg-primary/5"
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={TC.primary} />
                  ) : (
                    <>
                      <Check size={14} color={TC.primary} strokeWidth={2.5} />
                      <Text className="font-sans text-[13px] font-semibold text-primary">
                        I'm in
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
