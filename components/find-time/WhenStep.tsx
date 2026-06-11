/**
 * Step 2 of the find-time wizard — collapsible month → day → slot tree of
 * group availability overlaps. Presentational only; overlap query and
 * selection state live in app/(app)/find-time.tsx.
 */
import { ScrollView, View, Text, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { Check, ChevronDown } from 'lucide-react-native';
import { slotRangeLabel } from '@/lib/socialSlots';
import { TINT } from '@/lib/colors';
import { SLOT_LABEL, type MonthGroup } from '@/components/find-time/slots';
import type { TimeSlot } from '@/types/planner';

interface WhenStepProps {
  selectedFriendCount: number;
  overlapLoading: boolean;
  hasSlots: boolean;
  grouped: MonthGroup[];
  expandedMonths: Set<string>;
  expandedDays: Set<string>;
  selectedSlots: { date: string; slot: TimeSlot }[];
  onToggleMonth: (key: string) => void;
  onToggleDay: (date: string) => void;
  onToggleSlot: (s: { date: string; slot: TimeSlot }) => void;
}

export function WhenStep({
  selectedFriendCount,
  overlapLoading,
  hasSlots,
  grouped,
  expandedMonths,
  expandedDays,
  selectedSlots,
  onToggleMonth,
  onToggleDay,
  onToggleSlot,
}: WhenStepProps) {
  return (
    <ScrollView className="flex-1" contentContainerClassName="px-5 py-4 gap-2" keyboardShouldPersistTaps="handled">
      <Text className="font-sans text-xs text-muted-foreground px-1 pb-1">
        {selectedFriendCount > 0
          ? "Times in the next 6 months when you and everyone you picked are free and in the same city. Pick one — or several to let them vote."
          : 'Your open evenings & weekends. Pick one or more.'}
      </Text>

      {overlapLoading ? (
        <View className="items-center py-10">
          <ActivityIndicator color="#23744D" />
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
                router.replace('/(app)/new-trip-proposal');
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
          return (
            <View key={m.key} className="gap-1.5">
              {/* Month tier */}
              <Pressable
                onPress={() => onToggleMonth(m.key)}
                className="flex-row items-center justify-between bg-card rounded-2xl border border-border/30 px-4 py-3 shadow-sm active:opacity-80"
              >
                <View className="flex-row items-center gap-2">
                  <ChevronDown size={16} color="#929298" strokeWidth={2} style={{ transform: [{ rotate: mExpanded ? '0deg' : '-90deg' }] }} />
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

              {/* Day tier */}
              {mExpanded && m.days.map((day) => {
                const dExpanded = expandedDays.has(day.date);
                const dPicked = selectedSlots.filter((s) => s.date === day.date).length;
                const dObj = new Date(`${day.date}T12:00:00`);
                return (
                  <View key={day.date} className="ml-3 gap-1.5">
                    <Pressable
                      onPress={() => onToggleDay(day.date)}
                      className="flex-row items-center justify-between bg-card rounded-xl border border-border/30 px-3.5 py-2.5 active:opacity-80"
                    >
                      <View className="flex-row items-center gap-2">
                        <ChevronDown size={14} color="#929298" strokeWidth={2} style={{ transform: [{ rotate: dExpanded ? '0deg' : '-90deg' }] }} />
                        <Text className="font-sans text-sm font-semibold text-foreground">{format(dObj, 'EEE, MMM d')}</Text>
                      </View>
                      <View className="flex-row items-center gap-2">
                        {dPicked > 0 && <View className="w-2 h-2 rounded-full bg-primary" />}
                        <Text className="font-sans text-xs text-muted-foreground">
                          {day.slots.length} {day.slots.length === 1 ? 'time' : 'times'}
                        </Text>
                      </View>
                    </Pressable>

                    {/* Slot tier */}
                    {dExpanded && day.slots.map((slot) => {
                      const selected = selectedSlots.some((p) => p.date === day.date && p.slot === slot);
                      return (
                        <Pressable
                          key={slot}
                          onPress={() => onToggleSlot({ date: day.date, slot })}
                          className={`ml-3 rounded-xl border px-3.5 py-2.5 flex-row items-center gap-3 ${selected ? 'bg-primary/10 border-primary/50' : 'bg-card border-border/30'} active:opacity-80`}
                        >
                          <View className="flex-1">
                            <Text className="font-sans text-sm font-semibold text-foreground">{SLOT_LABEL[slot]}</Text>
                            <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">{slotRangeLabel(slot)}</Text>
                          </View>
                          <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: selected ? '#23744D' : TINT.grayStrong, backgroundColor: selected ? '#23744D' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                            {selected && <Check size={13} color="#FFFFFF" strokeWidth={2.5} />}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
