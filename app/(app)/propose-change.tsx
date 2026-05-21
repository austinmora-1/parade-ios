/**
 * Propose Change — modal to suggest a new date/slot for an existing plan.
 *
 * Reached via "Propose change" link in the plan-detail owner menu OR a
 * shortcut for participants. URL: /(app)/propose-change?planId=xxx
 *
 * Creates a plan_change_requests row with status='pending' + seeds
 * plan_change_responses for every other participant. They see the proposed
 * change banner on the plan detail screen and accept/decline there.
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, addDays, parseISO, isToday, isTomorrow, isSameDay } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { X, AlertCircle } from 'lucide-react-native';
import { supabase } from '@/integrations/supabase/client';
import { useProposeChange } from '@/hooks/usePlanChangeRequests';
import type { TimeSlot } from '@/types/planner';

const SLOTS: { id: TimeSlot; label: string; range: string }[] = [
  { id: 'early-morning',   label: 'Early',     range: '6–9am' },
  { id: 'late-morning',    label: 'Morning',   range: '9am–12pm' },
  { id: 'early-afternoon', label: 'Afternoon', range: '12–3pm' },
  { id: 'late-afternoon',  label: 'Late PM',   range: '3–6pm' },
  { id: 'evening',         label: 'Evening',   range: '6–10pm' },
  { id: 'late-night',      label: 'Late',      range: '10pm+' },
];

function dateLabel(d: Date): string {
  if (isToday(d))    return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'EEE');
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-0.5 mb-2">
      {children}
    </Text>
  );
}

function Chip({ selected, onPress, children }: {
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-xl px-3 py-2.5 border active:opacity-70 ${
        selected ? 'bg-primary border-primary' : 'bg-white border-border/40'
      }`}
    >
      <View className="flex-row items-center gap-1.5">{children}</View>
    </Pressable>
  );
}

/** Pulls the current plan to seed the date/slot pickers with existing values */
function usePlanForChange(planId: string | undefined) {
  return useQuery({
    enabled: !!planId,
    queryKey: ['plan-for-change', planId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plans')
        .select('id, title, date, time_slot')
        .eq('id', planId!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });
}

export default function ProposeChangeScreen() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const { data: plan } = usePlanForChange(planId);
  const proposeMut = useProposeChange();

  const initialDate = plan?.date ? new Date(plan.date) : new Date();
  const initialSlot = (plan?.time_slot ?? 'evening') as TimeSlot;

  const [date, setDate] = useState<Date>(initialDate);
  const [slot, setSlot] = useState<TimeSlot>(initialSlot);

  // Hydrate when plan loads
  useMemo(() => {
    if (plan) {
      setDate(new Date(plan.date));
      setSlot(plan.time_slot as TimeSlot);
    }
  }, [plan?.id]);

  const dateOptions = useMemo(
    () => Array.from({ length: 14 }, (_, i) => addDays(new Date(), i)),
    [],
  );

  const handleSubmit = useCallback(async () => {
    if (!planId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await proposeMut.mutateAsync({
        planId,
        proposedDate:     format(date, 'yyyy-MM-dd'),
        proposedTimeSlot: slot,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: any) {
      console.error('Propose change failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        "Couldn't send proposal",
        err?.message ?? 'Please try again.',
      );
    }
  }, [planId, date, slot, proposeMut]);

  const saving = proposeMut.isPending;
  const noChange = plan
    ? isSameDay(new Date(plan.date), date) && plan.time_slot === slot
    : true;
  const canSubmit = !!planId && !saving && !noChange;

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      <View className="flex-row items-center justify-between px-3 py-2 border-b border-border/20">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
        >
          <X size={20} color="#2F4F3F" strokeWidth={2} />
        </Pressable>
        <Text className="font-display text-base text-foreground">Propose change</Text>
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          hitSlop={6}
          className={`rounded-xl px-3 py-1.5 ${canSubmit ? 'bg-primary' : 'bg-muted'}`}
        >
          <Text className={`font-sans text-sm font-semibold ${
            canSubmit ? 'text-white' : 'text-muted-foreground'
          }`}>
            {saving ? 'Sending…' : 'Send'}
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 py-5 gap-5"
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-row items-start gap-2 bg-marigold/10 rounded-2xl px-4 py-3">
            <AlertCircle size={16} color="#92400E" strokeWidth={2} />
            <Text className="font-sans text-xs text-foreground flex-1 leading-relaxed">
              Everyone on the plan will get a notification. Until they all
              accept, the plan stays at its original time.
            </Text>
          </View>

          {plan && (
            <View className="bg-white rounded-2xl border border-border/30 px-4 py-3 shadow-sm">
              <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                Original
              </Text>
              <Text className="font-display text-sm text-foreground" numberOfLines={1}>
                {plan.title}
              </Text>
              <Text className="font-sans text-xs text-muted-foreground mt-0.5">
                {format(new Date(plan.date), 'EEE, MMM d')} ·{' '}
                {SLOTS.find((s) => s.id === plan.time_slot)?.label ?? plan.time_slot}
              </Text>
            </View>
          )}

          {/* New date */}
          <View>
            <FieldLabel>New date</FieldLabel>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2 px-0.5 pb-1"
            >
              {dateOptions.map((d) => {
                const selected = isSameDay(d, date);
                return (
                  <Chip
                    key={d.toISOString()}
                    selected={selected}
                    onPress={() => { Haptics.selectionAsync(); setDate(d); }}
                  >
                    <View className="items-center">
                      <Text className={`font-sans text-[10px] font-semibold uppercase tracking-wider ${
                        selected ? 'text-white/80' : 'text-muted-foreground'
                      }`}>
                        {dateLabel(d)}
                      </Text>
                      <Text className={`font-display text-base ${
                        selected ? 'text-white' : 'text-foreground'
                      }`}>
                        {format(d, 'MMM d')}
                      </Text>
                    </View>
                  </Chip>
                );
              })}
            </ScrollView>
          </View>

          {/* New time slot */}
          <View>
            <FieldLabel>New time</FieldLabel>
            <View className="flex-row flex-wrap gap-2">
              {SLOTS.map((s) => {
                const selected = slot === s.id;
                return (
                  <Chip
                    key={s.id}
                    selected={selected}
                    onPress={() => { Haptics.selectionAsync(); setSlot(s.id); }}
                  >
                    <View>
                      <Text className={`font-sans text-xs font-semibold ${
                        selected ? 'text-white' : 'text-foreground'
                      }`}>
                        {s.label}
                      </Text>
                      <Text className={`font-sans text-[10px] ${
                        selected ? 'text-white/70' : 'text-muted-foreground'
                      }`}>
                        {s.range}
                      </Text>
                    </View>
                  </Chip>
                );
              })}
            </View>
          </View>

          {noChange && (
            <Text className="font-sans text-xs text-muted-foreground/70 text-center px-4">
              Pick a different date or time to propose a change.
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
