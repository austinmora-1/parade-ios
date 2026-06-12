/**
 * OpenInvitesWidget — Home dashboard card showing plans where the current
 * user is invited but hasn't responded yet. Surfaces RSVPs that would
 * otherwise stay hidden behind a plan-detail tap.
 *
 * Empty case: returns null (renders nothing).
 */
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useMemo, useState, useCallback } from 'react';
import { format, isToday, isTomorrow } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { Sparkles, Check, X, Clock, MapPin } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';
import { supabase } from '@/integrations/supabase/client';
import { invalidatePlanData } from '@/lib/dashboardQuery';
import { TIME_SLOT_LABELS } from '@/types/planner';
import type { Plan, TimeSlot } from '@/types/planner';
import { activityAccent } from '@/lib/activityColors';

function planDayLabel(date: Date): string {
  if (isToday(date))    return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return format(date, 'EEE, MMM d');
}

// ─── Sub-component: single open invite card ──────────────────────────────────

function OpenInviteCard({
  plan,
  proposerName,
  onTap,
  onAccept,
  onDecline,
  loading,
}: {
  plan: Plan;
  proposerName: string;
  onTap: () => void;
  onAccept: () => void;
  onDecline: () => void;
  loading: 'accepted' | 'declined' | null;
}) {
  const planDate    = plan.date instanceof Date ? plan.date : new Date(plan.date);
  const accentColor = activityAccent(plan.activity as string | undefined);
  const slotLabel   = TIME_SLOT_LABELS[plan.timeSlot as TimeSlot]?.time ?? '';
  const locationStr =
    typeof plan.location === 'string'
      ? plan.location
      : (plan.location as any)?.name ?? '';

  return (
    <Pressable
      onPress={onTap}
      className="bg-card rounded-2xl border border-border/30 overflow-hidden shadow-sm active:opacity-80"
    >
      <View className="flex-row">
        {/* Left activity accent bar */}
        <View style={{ width: 4, backgroundColor: accentColor }} />

        <View className="flex-1 px-4 py-3 gap-1.5">
          {/* Title + "From X" */}
          <View className="flex-row items-start justify-between gap-2">
            <Text
              className="font-display text-xl text-foreground flex-1"
              numberOfLines={1}
            >
              {plan.title || 'Untitled plan'}
            </Text>
            <Text className="font-sans text-[13px] text-muted-foreground">
              {planDayLabel(planDate)}
            </Text>
          </View>

          {/* Meta row: time · location · proposer */}
          <View className="flex-row items-center gap-3 flex-wrap">
            {slotLabel ? (
              <View className="flex-row items-center gap-1">
                <Clock size={11} color="#929298" strokeWidth={1.75} />
                <Text className="font-sans text-sm text-muted-foreground">
                  {slotLabel}
                </Text>
              </View>
            ) : null}
            {locationStr ? (
              <View className="flex-row items-center gap-1 flex-shrink">
                <MapPin size={11} color="#929298" strokeWidth={1.75} />
                <Text
                  className="font-sans text-sm text-muted-foreground"
                  numberOfLines={1}
                >
                  {locationStr}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Proposer attribution */}
          {proposerName && (
            <Text className="font-sans text-[13px] text-muted-foreground/80">
              From {proposerName}
            </Text>
          )}
        </View>
      </View>

      {/* RSVP action row */}
      <View className="flex-row border-t border-border/20">
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onDecline();
          }}
          disabled={loading !== null}
          className="flex-1 flex-row items-center justify-center gap-1.5 py-3 active:bg-muted/20"
        >
          {loading === 'declined' ? (
            <ActivityIndicator size="small" color="#D46549" />
          ) : (
            <>
              <X size={14} color="#D46549" strokeWidth={2.2} />
              <Text className="font-sans text-[15px] font-semibold text-secondary">
                Can't make it
              </Text>
            </>
          )}
        </Pressable>
        <View className="w-px bg-border/30" />
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onAccept();
          }}
          disabled={loading !== null}
          className="flex-1 flex-row items-center justify-center gap-1.5 py-3 active:bg-primary/5"
        >
          {loading === 'accepted' ? (
            <ActivityIndicator size="small" color="#23744D" />
          ) : (
            <>
              <Check size={14} color="#23744D" strokeWidth={2.5} />
              <Text className="font-sans text-[15px] font-semibold text-primary">
                I'm in
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </Pressable>
  );
}

// ─── Main widget ────────────────────────────────────────────────────────────

export function OpenInvitesWidget() {
  const { user } = useAuth();
  const plans     = usePlannerStore((s) => s.plans);
  const friends   = usePlannerStore((s) => s.friends);

  /** plan.id → which response is in-flight */
  const [pending, setPending] = useState<
    Record<string, 'accepted' | 'declined' | null>
  >({});

  const openInvites = useMemo<Plan[]>(() => {
    const now = new Date();
    return plans
      .filter((p) => {
        const d = p.date instanceof Date ? p.date : new Date(p.date);
        return (p as any).myRsvpStatus === 'invited' && d >= now;
      })
      .sort((a, b) => {
        const da = a.date instanceof Date ? a.date : new Date(a.date);
        const db = b.date instanceof Date ? b.date : new Date(b.date);
        return da.getTime() - db.getTime();
      });
  }, [plans]);

  /** Friend name lookup for "From X" proposer attribution */
  const friendsByUserId = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of friends) {
      if (f.friendUserId) m.set(f.friendUserId, f.name.split(' ')[0]);
    }
    return m;
  }, [friends]);

  const respond = useCallback(
    async (planId: string, response: 'accepted' | 'declined') => {
      if (!user?.id) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setPending((p) => ({ ...p, [planId]: response }));

      try {
        // Look up the participant row id for this user on this plan
        const { data: row, error: lookupErr } = await supabase
          .from('plan_participants')
          .select('id')
          .eq('plan_id', planId)
          .eq('friend_id', user.id)
          .single();
        if (lookupErr || !row?.id) throw lookupErr ?? new Error('No participant row');

        // Update participant status
        const { error: updateErr } = await supabase
          .from('plan_participants')
          .update({
            status: response,
            responded_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        if (updateErr) throw updateErr;

        // If accepting, also flip plan.status proposed → confirmed
        if (response === 'accepted') {
          await supabase
            .from('plans')
            .update({ status: 'confirmed' })
            .eq('id', planId);
        }

        // Refresh the dashboard query (mirrored into the planner stores) and
        // per-plan queries so the invite disappears from this widget.
        await invalidatePlanData(planId);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err) {
        console.error('Open-invite RSVP failed', err);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setPending((p) => ({ ...p, [planId]: null }));
      }
    },
    [user?.id],
  );

  if (openInvites.length === 0) return null;

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-1.5 px-0.5">
        <Sparkles size={12} color="#D46549" strokeWidth={2} />
        <Text className="font-sans text-[13px] font-semibold uppercase tracking-widest text-muted-foreground">
          Awaiting your RSVP
        </Text>
        <View className="ml-auto bg-secondary/15 rounded-full px-2 py-0.5">
          <Text className="font-sans text-sm text-secondary font-semibold">
            {openInvites.length}
          </Text>
        </View>
      </View>

      <View className="gap-2">
        {openInvites.map((plan) => {
          const proposerName =
            (plan as any).proposedBy
              ? friendsByUserId.get((plan as any).proposedBy) ?? ''
              : friendsByUserId.get((plan as any).userId) ?? '';
          return (
            <OpenInviteCard
              key={plan.id}
              plan={plan}
              proposerName={proposerName}
              onTap={() => router.push(`/(app)/plan/${plan.id}`)}
              onAccept={() => respond(plan.id, 'accepted')}
              onDecline={() => respond(plan.id, 'declined')}
              loading={pending[plan.id] ?? null}
            />
          );
        })}
      </View>
    </View>
  );
}
