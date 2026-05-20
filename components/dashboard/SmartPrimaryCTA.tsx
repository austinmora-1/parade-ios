/**
 * SmartPrimaryCTA — context-aware dashboard card. Currently surfaces a
 * single state ("Today's plan") matching the PWA's primary use case. If the
 * user has a confirmed plan today (own or accepted invite), this card
 * deep-links them straight to it.
 *
 * Returns null when there's nothing to surface.
 */
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { isToday } from 'date-fns';
import { ArrowRight, CalendarCheck } from 'lucide-react-native';
import { usePlannerStore } from '@/stores/plannerStore';
import { TIME_SLOT_LABELS } from '@/types/planner';
import type { Plan, TimeSlot } from '@/types/planner';

export function SmartPrimaryCTA() {
  const plans = usePlannerStore((s) => s.plans);

  const todayPlan = useMemo<Plan | null>(() => {
    const matches = plans.filter((p) => {
      const d = p.date instanceof Date ? p.date : new Date(p.date);
      if (!isToday(d)) return false;
      const status = (p as any).status;
      if (status && status !== 'confirmed') return false;
      const myRsvp = (p as any).myRsvpStatus;
      // Own plan (no myRsvp) or accepted invite
      if (myRsvp === undefined || myRsvp === 'accepted') return true;
      return false;
    });
    return matches[0] ?? null;
  }, [plans]);

  if (!todayPlan) return null;

  const slotLabel = TIME_SLOT_LABELS[todayPlan.timeSlot as TimeSlot]?.time ?? '';

  return (
    <Pressable
      onPress={() => router.push(`/(app)/plan/${todayPlan.id}`)}
      className="flex-row items-center bg-white rounded-2xl border border-primary/30 px-4 py-3.5 gap-3 shadow-sm active:opacity-80"
      style={{
        shadowColor: '#23744D',
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      }}
    >
      <View
        className="w-10 h-10 rounded-xl items-center justify-center"
        style={{ backgroundColor: 'rgba(35,116,77,0.12)' }}
      >
        <CalendarCheck size={18} color="#23744D" strokeWidth={2} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="font-sans text-[10px] font-semibold uppercase tracking-wider text-primary">
          Happening today
        </Text>
        <Text
          className="font-display text-base text-foreground"
          numberOfLines={1}
        >
          {todayPlan.title || 'Untitled plan'}
        </Text>
        {slotLabel && (
          <Text className="font-sans text-xs text-muted-foreground">
            {slotLabel}
          </Text>
        )}
      </View>
      <ArrowRight size={16} color="#23744D" strokeWidth={2.2} />
    </Pressable>
  );
}
