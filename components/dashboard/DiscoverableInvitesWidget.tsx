/**
 * DiscoverableInvitesWidget — open invites you could claim.
 *
 * Distinct from OpenInvitesWidget (which surfaces plans you were specifically
 * invited to). This widget surfaces public/friends-scoped plans owned by your
 * friends where you're NOT a participant yet — you can opt in with one tap.
 *
 * Returns null when nothing to surface.
 */
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { useState, useCallback } from 'react';
import { format, isToday, isTomorrow } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { Compass, Check, ChevronRight, Clock, MapPin } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePlannerStore } from '@/stores/plannerStore';
import { useDiscoverableInvites } from '@/hooks/useDiscoverableInvites';
import { TIME_SLOT_LABELS } from '@/types/planner';
import type { TimeSlot } from '@/types/planner';

const ACTIVITY_COLOR: Record<string, string> = {
  drinks: '#D46549', food: '#D46549', coffee: '#C47030', brunch: '#D46549',
  'happy-hour': '#D46549', hike: '#9CB094', run: '#9CB094', gym: '#9CB094',
  sports: '#9CB094', movie: '#7744BB', concert: '#6E9BC2', game: '#7744BB',
  travel: '#23744D', beach: '#23744D', park: '#23744D', meetup: '#23744D',
};
const DEFAULT_ACCENT = '#DFA53A'; // marigold for discovery (distinct from invites)

function dayLabel(d: Date): string {
  if (isToday(d))    return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'EEE, MMM d');
}

export function DiscoverableInvitesWidget() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const loadAll = usePlannerStore((s) => s.loadAllData);
  const { data: invites, isLoading } = useDiscoverableInvites();
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleJoin = useCallback(async (planId: string) => {
    if (!user?.id) return;
    setBusyId(planId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      // Insert ourselves as a participant with status='accepted'
      const { error } = await (supabase as any)
        .from('plan_participants')
        .insert({
          plan_id:      planId,
          friend_id:    user.id,
          status:       'accepted',
          role:         'participant',
          responded_at: new Date().toISOString(),
        });
      if (error) throw error;

      // Refresh queries that depend on participant state
      await Promise.all([
        loadAll(true),
        queryClient.invalidateQueries({ queryKey: ['discoverable-invites'] }),
      ]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error('Join open invite failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Couldn't join",
        err?.message ?? 'The plan owner may need to accept join requests.',
      );
    } finally {
      setBusyId(null);
    }
  }, [user?.id, loadAll, queryClient]);

  if (isLoading || !invites || invites.length === 0) return null;

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-1.5 px-0.5">
        <Compass size={12} color="#DFA53A" strokeWidth={2} />
        <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Discover
        </Text>
        <View className="ml-auto bg-marigold/15 rounded-full px-2 py-0.5">
          <Text className="font-sans text-xs text-marigold font-semibold">
            {invites.length}
          </Text>
        </View>
      </View>

      <View className="gap-2">
        {invites.slice(0, 5).map((inv) => {
          const accent    = ACTIVITY_COLOR[inv.activity ?? ''] ?? DEFAULT_ACCENT;
          const slotLabel = TIME_SLOT_LABELS[inv.timeSlot as TimeSlot]?.time ?? '';
          const busy      = busyId === inv.id;

          return (
            <Pressable
              key={inv.id}
              onPress={() => router.push(`/(app)/plan/${inv.id}`)}
              className="bg-white rounded-2xl border border-border/30 overflow-hidden shadow-sm active:opacity-80"
            >
              <View className="flex-row">
                <View style={{ width: 4, backgroundColor: accent }} />
                <View className="flex-1 px-4 py-3 gap-1">
                  <View className="flex-row items-start justify-between gap-2">
                    <Text
                      className="font-display text-sm text-foreground flex-1"
                      numberOfLines={1}
                    >
                      {inv.title}
                    </Text>
                    <Text className="font-sans text-xs text-muted-foreground">
                      {dayLabel(inv.date)}
                    </Text>
                  </View>

                  <View className="flex-row items-center gap-3 flex-wrap">
                    {slotLabel && (
                      <View className="flex-row items-center gap-1">
                        <Clock size={11} color="#929298" strokeWidth={1.75} />
                        <Text className="font-sans text-xs text-muted-foreground">
                          {slotLabel}
                        </Text>
                      </View>
                    )}
                    {inv.location && (
                      <View className="flex-row items-center gap-1 flex-shrink">
                        <MapPin size={11} color="#929298" strokeWidth={1.75} />
                        <Text
                          className="font-sans text-xs text-muted-foreground"
                          numberOfLines={1}
                        >
                          {inv.location}
                        </Text>
                      </View>
                    )}
                  </View>

                  <Text className="font-sans text-[11px] text-muted-foreground/80 mt-0.5">
                    {inv.ownerName} is open to friends joining
                  </Text>
                </View>
              </View>

              {/* Action row: I'm in */}
              <View className="flex-row border-t border-border/20">
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation?.();
                    router.push(`/(app)/plan/${inv.id}`);
                  }}
                  className="flex-1 flex-row items-center justify-center gap-1.5 py-3 active:bg-muted/20"
                >
                  <Text className="font-sans text-sm font-semibold text-muted-foreground">
                    See details
                  </Text>
                  <ChevronRight size={14} color="#929298" strokeWidth={2} />
                </Pressable>
                <View className="w-px bg-border/30" />
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation?.();
                    handleJoin(inv.id);
                  }}
                  disabled={busy}
                  className="flex-1 flex-row items-center justify-center gap-1.5 py-3 active:bg-primary/5"
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#23744D" />
                  ) : (
                    <>
                      <Check size={14} color="#23744D" strokeWidth={2.5} />
                      <Text className="font-sans text-sm font-semibold text-primary">
                        I'm in
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
