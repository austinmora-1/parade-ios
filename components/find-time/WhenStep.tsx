/**
 * Step 2 of the find-time wizard — "When works?"
 *
 *   1. Month rows listing every upcoming month with group overlap.
 *   2. Expanding a month shows a CALENDAR GRID: each day gets a
 *      green / yellow / red indicator from the overlap level (3+ slots /
 *      1–2 / none), with preferred-social-days emphasized (ring + dot).
 *   3. Tapping a day opens a pop-up of that day's slots ranked by the
 *      user's social preferences (preferred ones first, "Pick" badge),
 *      multi-select like the who's-around picker.
 *
 * Presentational only; overlap query + selection state live in
 * app/(app)/find-time.tsx.
 */
import { ScrollView, View, Text, Pressable, ActivityIndicator, Modal } from 'react-native';
import { useState, useMemo } from 'react';
import { router } from 'expo-router';
import { format, parseISO, startOfMonth, startOfWeek, addDays, isSameMonth } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { ChevronDown, Sparkles, X } from 'lucide-react-native';
import { CheckCircle } from '@/components/primitives/CheckCircle';
import { SLOT_LABEL, slotRangeLabel, SLOT_START_HOUR } from '@/lib/socialSlots';
import { SLOT_TO_PREF_BUCKET } from '@/hooks/useFriendDashboardData';
import type { MonthGroup } from '@/components/find-time/slots';
import type { TimeSlot } from '@/types/planner';
import { PARADE_GREEN, ELEPHANT, TINT } from '@/lib/colors';
import { TC } from '@/lib/theme';

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// Availability traffic light
const LEVEL = {
  high:  { bg: 'rgba(35,116,77,0.16)',  border: 'rgba(35,116,77,0.55)',  text: '#23744D' },
  some:  { bg: 'rgba(223,165,58,0.16)', border: 'rgba(223,165,58,0.55)', text: '#9A6B14' },
  none:  { bg: 'rgba(212,101,73,0.10)', border: 'rgba(212,101,73,0.25)', text: 'rgba(212,101,73,0.55)' },
} as const;

interface WhenStepProps {
  selectedFriendCount: number;
  overlapLoading: boolean;
  hasSlots: boolean;
  grouped: MonthGroup[];
  expandedMonths: Set<string>;
  selectedSlots: { date: string; slot: TimeSlot }[];
  onToggleMonth: (key: string) => void;
  onToggleSlot: (s: { date: string; slot: TimeSlot }) => void;
  /** My preferred social days, full lowercase names ('friday', …). */
  preferredDays: string[];
  /** My preferred social times, "<day>:<bucket>" keys ('friday:evening'). */
  preferredTimes: Set<string>;
}

export function WhenStep({
  selectedFriendCount,
  overlapLoading,
  hasSlots,
  grouped,
  expandedMonths,
  selectedSlots,
  onToggleMonth,
  onToggleSlot,
  preferredDays,
  preferredTimes,
}: WhenStepProps) {
  // Day whose slots are shown in the pop-up
  const [openDay, setOpenDay] = useState<string | null>(null);

  const isPreferredSlot = (date: string, slot: TimeSlot) => {
    const weekday = format(parseISO(date), 'EEEE').toLowerCase();
    return preferredTimes.has(`${weekday}:${SLOT_TO_PREF_BUCKET[slot]}`);
  };
  const isPreferredDay = (date: string) =>
    preferredDays.includes(format(parseISO(date), 'EEEE').toLowerCase());

  // date → slots lookup across all months
  const slotsByDate = useMemo(() => {
    const map = new Map<string, TimeSlot[]>();
    for (const m of grouped) for (const d of m.days) map.set(d.date, d.slots);
    return map;
  }, [grouped]);

  const openDaySlots = useMemo(() => {
    if (!openDay) return [];
    const slots = slotsByDate.get(openDay) ?? [];
    // Preferred slots first, then by start hour
    return [...slots].sort((a, b) => {
      const pa = isPreferredSlot(openDay, a) ? 0 : 1;
      const pb = isPreferredSlot(openDay, b) ? 0 : 1;
      return pa - pb || SLOT_START_HOUR[a] - SLOT_START_HOUR[b];
    });
  }, [openDay, slotsByDate, preferredTimes]);

  return (
    <ScrollView className="flex-1" contentContainerClassName="px-5 py-4 gap-2" keyboardShouldPersistTaps="handled">
      <Text className="font-sans text-xs text-muted-foreground px-1 pb-1">
        {selectedFriendCount > 0
          ? 'Months when you and everyone you picked are free in the same city. Tap a month, then a day.'
          : 'Your open evenings & weekends. Tap a month, then a day.'}
      </Text>

      {overlapLoading ? (
        <View className="items-center py-10">
          <ActivityIndicator color={PARADE_GREEN} />
          <Text className="font-sans text-xs text-muted-foreground mt-3">Finding overlaps…</Text>
        </View>
      ) : !hasSlots ? (
        /* No co-located overlap in 6 months → suggest a visit */
        <View className="bg-card rounded-2xl border border-dashed border-border/40 px-5 py-6 items-center gap-2 mt-2">
          <Text style={{ fontSize: 28 }}>🗺️</Text>
          <Text className="font-display text-base text-foreground text-center">
            No overlapping free time in the same city
          </Text>
          <Text className="font-sans text-xs text-muted-foreground text-center leading-relaxed">
            {selectedFriendCount > 0
              ? "You and your friends aren't free in the same place over the next 6 months. Want to plan a visit instead?"
              : 'No open social time in the next 6 months.'}
          </Text>
          {selectedFriendCount > 0 && (
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                router.replace('/(app)/go-somewhere');
              }}
              className="mt-2 bg-primary rounded-2xl px-5 py-3 active:opacity-80"
            >
              <Text className="font-sans text-sm font-semibold text-white">Plan a visit</Text>
            </Pressable>
          )}
        </View>
      ) : (
        grouped.map((m) => {
          const mExpanded = expandedMonths.has(m.key);
          const mPicked = selectedSlots.filter((s) => s.date.startsWith(m.key)).length;

          // Calendar grid for this month (Mon-start weeks)
          const monthDate = parseISO(`${m.key}-01T12:00:00`);
          const gridStart = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 });
          const weeks = Array.from({ length: 6 }, (_, w) =>
            Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)),
          ).filter((week) => week.some((day) => isSameMonth(day, monthDate)));

          return (
            <View key={m.key} className="gap-1.5">
              {/* Month tier */}
              <Pressable
                onPress={() => onToggleMonth(m.key)}
                className="flex-row items-center justify-between bg-card rounded-2xl border border-border/30 px-4 py-3 shadow-sm active:opacity-80"
              >
                <View className="flex-row items-center gap-2">
                  <ChevronDown size={16} color={ELEPHANT} strokeWidth={2} style={{ transform: [{ rotate: mExpanded ? '0deg' : '-90deg' }] }} />
                  <Text className="font-display text-base text-foreground">{m.label}</Text>
                </View>
                <View className="flex-row items-center gap-2">
                  {mPicked > 0 && (
                    <View className="bg-primary rounded-full px-2 py-0.5">
                      <Text className="font-sans text-[10px] font-semibold text-white">{mPicked} picked</Text>
                    </View>
                  )}
                  <Text className="font-sans text-xs text-muted-foreground">
                    {m.dayCount} {m.dayCount === 1 ? 'day' : 'days'}
                  </Text>
                </View>
              </Pressable>

              {/* Calendar grid */}
              {mExpanded && (
                <View className="bg-card rounded-2xl border border-border/30 p-3 gap-1.5 shadow-sm">
                  {/* Weekday initials */}
                  <View className="flex-row">
                    {WEEKDAY_INITIALS.map((d, i) => (
                      <View key={i} className="flex-1 items-center">
                        <Text className="font-sans text-[10px] font-semibold text-muted-foreground">{d}</Text>
                      </View>
                    ))}
                  </View>

                  {weeks.map((week, wi) => (
                    <View key={wi} className="flex-row">
                      {week.map((day) => {
                        const inMonth = isSameMonth(day, monthDate);
                        if (!inMonth) {
                          return <View key={day.toISOString()} className="flex-1 py-1" />;
                        }
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const past = dateStr < format(new Date(), 'yyyy-MM-dd');
                        const slots = slotsByDate.get(dateStr) ?? [];
                        const level = slots.length >= 3 ? LEVEL.high : slots.length >= 1 ? LEVEL.some : LEVEL.none;
                        const preferred = !past && slots.length > 0 && isPreferredDay(dateStr);

                        return (
                          <Pressable
                            key={dateStr}
                            disabled={past || slots.length === 0}
                            onPress={() => { Haptics.selectionAsync(); setOpenDay(dateStr); }}
                            className="flex-1 items-center py-1 active:opacity-70"
                          >
                            <View
                              className="w-9 h-9 rounded-full items-center justify-center"
                              style={
                                past
                                  ? undefined
                                  : {
                                      backgroundColor: level.bg,
                                      borderWidth: preferred ? 2 : 1,
                                      borderColor: preferred ? PARADE_GREEN : level.border,
                                    }
                              }
                            >
                              <Text
                                className="font-sans text-[13px]"
                                style={{
                                  color: past ? TINT.graySolid : level.text,
                                  fontFamily: preferred ? 'Inter_600SemiBold' : 'Inter_400Regular',
                                }}
                              >
                                {format(day, 'd')}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}

                  {/* Legend */}
                  <View className="flex-row items-center justify-center gap-4 pt-1">
                    {[
                      ['Lots of overlap', LEVEL.high.border],
                      ['Some', LEVEL.some.border],
                      ['None', LEVEL.none.border],
                    ].map(([label, color]) => (
                      <View key={String(label)} className="flex-row items-center gap-1">
                        <View className="w-2 h-2 rounded-full" style={{ backgroundColor: String(color) }} />
                        <Text className="font-sans text-[10px] text-muted-foreground">{String(label)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          );
        })
      )}

      {/* ── Day slots pop-up ──────────────────────────────────────────── */}
      <Modal
        visible={!!openDay}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenDay(null)}
      >
        <Pressable className="flex-1 bg-black/40 justify-center px-6" onPress={() => setOpenDay(null)}>
          <Pressable className="bg-card rounded-2xl p-4 gap-3" onPress={() => {}}>
            {/* Header */}
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="font-display text-base text-foreground">
                  {openDay ? format(parseISO(openDay), 'EEEE, MMM d') : ''}
                </Text>
                <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
                  {selectedFriendCount > 0 ? 'Everyone is free at these times' : "You're free at these times"}
                </Text>
              </View>
              <Pressable
                onPress={() => setOpenDay(null)}
                hitSlop={8}
                className="w-9 h-9 items-center justify-center rounded-full active:opacity-60"
              >
                <X size={18} color={ELEPHANT} strokeWidth={2} />
              </Pressable>
            </View>

            {/* Slots ranked by social preference */}
            <View className="gap-2">
              {openDay && openDaySlots.map((slot) => {
                const selected = selectedSlots.some((p) => p.date === openDay && p.slot === slot);
                const preferred = isPreferredSlot(openDay, slot);
                return (
                  <Pressable
                    key={slot}
                    onPress={() => onToggleSlot({ date: openDay, slot })}
                    className={`rounded-xl border px-3.5 py-2.5 flex-row items-center gap-3 ${selected ? 'bg-primary/10 border-primary/50' : preferred ? 'bg-marigold/10 border-marigold/40' : 'bg-card border-border/30'} active:opacity-80`}
                  >
                    <View className="flex-1">
                      <View className="flex-row items-center gap-1.5">
                        <Text className="font-sans text-sm font-semibold text-foreground">{SLOT_LABEL[slot]}</Text>
                        {preferred && (
                          <View className="flex-row items-center gap-0.5 bg-marigold/15 rounded-full px-1.5 py-px">
                            <Sparkles size={9} color="#DFA53A" strokeWidth={2} />
                            <Text className="font-sans text-[9px] font-semibold uppercase tracking-wide text-marigold">Pick</Text>
                          </View>
                        )}
                      </View>
                      <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">{slotRangeLabel(slot)}</Text>
                    </View>
                    <CheckCircle checked={selected} />
                  </Pressable>
                );
              })}
            </View>

            {/* Done */}
            <Pressable
              onPress={() => setOpenDay(null)}
              className="rounded-xl items-center py-2.5 active:opacity-70"
              style={{ backgroundColor: TINT.primarySubtle }}
            >
              <Text className="font-sans text-sm font-semibold" style={{ color: PARADE_GREEN }}>
                Done
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}
