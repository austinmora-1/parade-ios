/**
 * Day detail — read-only Phase 1.
 * Shows your availability for the day + any plans on that date.
 * Matches PWA visual treatment: Fraunces day heading, colored availability
 * pills, left-border-accent plan cards.
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Clock, MapPin, Check, Plus } from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, isToday } from 'date-fns';
import { useState, useCallback, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';
import type { TimeSlot } from '@/types/planner';

// ─── Constants ────────────────────────────────────────────────────────────────

const SLOT_LABELS: Record<string, string> = {
  early_morning:    'Early morning',
  late_morning:     'Late morning',
  early_afternoon:  'Afternoon',
  late_afternoon:   'Late afternoon',
  evening:          'Evening',
  late_night:       'Late night',
};

const SLOT_TIME: Record<string, string> = {
  early_morning:    '6–9am',
  late_morning:     '9am–12pm',
  early_afternoon:  '12–3pm',
  late_afternoon:   '3–6pm',
  evening:          '6–10pm',
  late_night:       '10pm+',
};

/** Activity → left-border accent color (matches dashboard + plans tab) */
const ACTIVITY_COLOR: Record<string, string> = {
  drinks: '#D46549', food: '#D46549', coffee: '#C47030', brunch: '#D46549',
  'happy-hour': '#D46549', hike: '#9CB094', run: '#9CB094', gym: '#9CB094',
  sports: '#9CB094', movie: '#7744BB', concert: '#6E9BC2', game: '#7744BB',
  travel: '#23744D', beach: '#23744D', park: '#23744D', meetup: '#23744D',
};
function activityAccent(activity?: string): string {
  return ACTIVITY_COLOR[activity ?? ''] ?? '#23744D';
}

/** DB column underscore_case → TimeSlot kebab-case */
function colToTimeSlot(col: string): TimeSlot {
  return col.replace(/_/g, '-') as TimeSlot;
}

/** Treat truthy values (true OR legacy 'free' string) as free */
function isFree(v: unknown): boolean {
  return v === true || v === 'free';
}

// ─── Data ─────────────────────────────────────────────────────────────────────

function useDayData(userId: string | undefined, date: string) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['day', userId, date],
    queryFn: async () => {
      const [{ data: avail }, { data: plans }] = await Promise.all([
        supabase
          .from('availability')
          .select('*')
          .eq('user_id', userId!)
          .eq('date', date)
          .maybeSingle(),
        supabase
          .from('plans')
          .select('id, title, time_slot, location, activity')
          .eq('user_id', userId!)
          .eq('date', date),
      ]);
      return { avail, plans: plans ?? [] };
    },
  });
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DayDetailScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const setAvailability = usePlannerStore((s) => s.setAvailability);
  const setUserId       = usePlannerStore((s) => s.setUserId);

  const { data, isLoading } = useDayData(user?.id, date);
  const avail: any = data?.avail;
  const plans = (data?.plans ?? []) as any[];

  const parsedDate = date ? parseISO(date) : new Date();
  const today = isToday(parsedDate);
  const slots = Object.entries(SLOT_LABELS);

  // Optimistic overrides keyed by underscore_case column name
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());

  // Reset optimistic state when day changes
  useEffect(() => {
    setOptimistic({});
  }, [date]);

  // Ensure planner store has the userId set
  useEffect(() => {
    if (user?.id) setUserId(user.id);
  }, [user?.id]);

  /** True if this slot is marked free (optimistic > server) */
  const slotIsFree = (slotCol: string): boolean => {
    if (slotCol in optimistic) return optimistic[slotCol];
    return isFree(avail?.[slotCol]);
  };

  const toggleSlot = useCallback(
    async (slotCol: string) => {
      const current  = slotIsFree(slotCol);
      const newValue = !current;

      // Optimistic + haptic
      Haptics.selectionAsync();
      setOptimistic((prev) => ({ ...prev, [slotCol]: newValue }));
      setSaving((prev) => new Set(prev).add(slotCol));

      try {
        await setAvailability(parsedDate, colToTimeSlot(slotCol), newValue);
        // Sync this screen's query with the new server state
        await queryClient.invalidateQueries({ queryKey: ['day', user?.id, date] });
      } catch (err) {
        console.error('toggleSlot failed', err);
        // Roll back optimistic update
        setOptimistic((prev) => {
          const next = { ...prev };
          delete next[slotCol];
          return next;
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setSaving((prev) => {
          const next = new Set(prev);
          next.delete(slotCol);
          return next;
        });
      }
    },
    [setAvailability, parsedDate, queryClient, user?.id, date, avail, optimistic],
  );

  /** Mark all six slots free (or all busy if all currently free) */
  const toggleAllSlots = useCallback(async () => {
    const allFree = slots.every(([col]) => slotIsFree(col));
    const newValue = !allFree;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Optimistic all
    const updates: Record<string, boolean> = {};
    slots.forEach(([col]) => { updates[col] = newValue; });
    setOptimistic((prev) => ({ ...prev, ...updates }));

    try {
      await Promise.all(
        slots.map(([col]) =>
          setAvailability(parsedDate, colToTimeSlot(col), newValue),
        ),
      );
      await queryClient.invalidateQueries({ queryKey: ['day', user?.id, date] });
    } catch (err) {
      console.error('toggleAllSlots failed', err);
      setOptimistic({});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [slots, setAvailability, parsedDate, queryClient, user?.id, date, avail, optimistic]);

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-3 py-2 gap-1">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
        >
          <ChevronLeft size={22} color="#2F4F3F" strokeWidth={2} />
        </Pressable>
        <View className="flex-1">
          <Text className="font-display text-base text-foreground">
            {today ? 'Today' : format(parsedDate, 'EEEE')}
          </Text>
          <Text className="font-sans text-[11px] text-muted-foreground">
            {format(parsedDate, 'MMMM d, yyyy')}
          </Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator className="mt-16" color="#23744D" />
      ) : (
        <ScrollView contentContainerClassName="px-5 pb-10 gap-5 pt-2">
          {/* ── Availability ─────────────────────────────────────────── */}
          <View className="gap-2">
            <View className="flex-row items-center justify-between px-1">
              <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Availability
              </Text>
              <Pressable onPress={toggleAllSlots} hitSlop={6} className="active:opacity-60">
                <Text className="font-sans text-xs font-semibold text-primary">
                  {slots.every(([col]) => slotIsFree(col)) ? 'Clear all' : 'Mark all free'}
                </Text>
              </Pressable>
            </View>

            <View className="bg-white rounded-2xl border border-border/30 shadow-sm overflow-hidden">
              {slots.map(([slotCol, label], i) => {
                const free = slotIsFree(slotCol);
                const isSaving = saving.has(slotCol);
                return (
                  <View key={slotCol}>
                    <Pressable
                      onPress={() => toggleSlot(slotCol)}
                      disabled={isSaving}
                      className="flex-row items-center px-4 py-3.5 gap-3 active:bg-muted/30"
                    >
                      {/* Checkbox-style indicator */}
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          borderWidth: 1.5,
                          borderColor: free ? '#23744D' : 'rgba(146,146,152,0.4)',
                          backgroundColor: free ? '#23744D' : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: isSaving ? 0.5 : 1,
                        }}
                      >
                        {free && <Check size={14} color="#FFFFFF" strokeWidth={2.5} />}
                      </View>

                      <View className="flex-1">
                        <Text className="font-sans text-sm text-foreground font-medium">
                          {label}
                        </Text>
                        <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
                          {SLOT_TIME[slotCol]}
                        </Text>
                      </View>

                      {/* Status pill */}
                      {free ? (
                        <View
                          style={{
                            backgroundColor: 'rgba(35,116,77,0.12)',
                            borderRadius: 999,
                            paddingHorizontal: 10,
                            paddingVertical: 3,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: 'Inter_600SemiBold',
                              fontSize: 11,
                              color: '#23744D',
                            }}
                          >
                            Free
                          </Text>
                        </View>
                      ) : (
                        <Text className="font-sans text-xs text-muted-foreground/40">
                          Tap to mark free
                        </Text>
                      )}
                    </Pressable>
                    {i < slots.length - 1 && (
                      <View className="h-px bg-border/30 mx-4" />
                    )}
                  </View>
                );
              })}
            </View>
          </View>

          {/* ── Plans on this day ─────────────────────────────────────── */}
          {plans.length > 0 && (
            <View className="gap-2">
              <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-1">
                Plans
              </Text>

              {plans.map((plan) => (
                <Pressable
                  key={plan.id}
                  onPress={() => router.push(`/(app)/plan/${plan.id}`)}
                  className="bg-white rounded-2xl border border-border/30 overflow-hidden flex-row shadow-sm active:opacity-80"
                >
                  <View style={{ width: 4, backgroundColor: activityAccent(plan.activity) }} />
                  <View className="flex-1 px-4 py-3 gap-1">
                    <Text
                      className="font-display text-sm text-foreground"
                      numberOfLines={1}
                    >
                      {plan.title || 'Untitled plan'}
                    </Text>

                    <View className="flex-row items-center gap-3">
                      {plan.time_slot && (
                        <View className="flex-row items-center gap-1">
                          <Clock size={11} color="#929298" strokeWidth={1.75} />
                          <Text className="font-sans text-xs text-muted-foreground">
                            {SLOT_LABELS[plan.time_slot] ?? plan.time_slot}
                          </Text>
                        </View>
                      )}
                      {plan.location && (
                        <View className="flex-row items-center gap-1 flex-1">
                          <MapPin size={11} color="#929298" strokeWidth={1.75} />
                          <Text
                            className="font-sans text-xs text-muted-foreground"
                            numberOfLines={1}
                          >
                            {plan.location}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {/* ── Create plan CTA ──────────────────────────────────────── */}
          <Pressable
            onPress={() => router.push(`/(app)/new-plan?date=${date}`)}
            className="bg-primary rounded-2xl flex-row items-center justify-center gap-2 px-4 py-3.5 active:opacity-80 shadow-sm"
          >
            <Plus size={16} color="#FFFFFF" strokeWidth={2.5} />
            <Text className="font-sans text-sm font-semibold text-white">
              Create a plan for this day
            </Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
