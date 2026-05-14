/**
 * FreeWindowCard — shows the user's own open free windows for the next 7 days,
 * sorted by friend overlap (most overlapping friends first). Read-only for Phase 1.
 *
 * Data source: plannerStore.availability (already loaded by loadAllData).
 * Friend overlap: from useFriendDashboardData (batched).
 */
import { ScrollView, View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { format, addDays, isToday, isTomorrow } from 'date-fns';
import { Sparkles, Users } from 'lucide-react-native';
import { usePlannerStore } from '@/stores/plannerStore';
import { useFriendDashboardData } from '@/hooks/useFriendDashboardData';
import { Avatar } from '@/components/primitives/Avatar';
import { Skeleton } from '@/components/primitives/Skeleton';
import type { TimeSlot } from '@/types/planner';

const SLOT_LABEL: Record<TimeSlot, { short: string; range: string }> = {
  'early-morning':   { short: 'Early AM',   range: '6–9am' },
  'late-morning':    { short: 'Late AM',     range: '9am–12pm' },
  'early-afternoon': { short: 'Afternoon',   range: '12–3pm' },
  'late-afternoon':  { short: 'Late PM',     range: '3–6pm' },
  'evening':         { short: 'Evening',     range: '6–10pm' },
  'late-night':      { short: 'Late night',  range: '10pm+' },
};

function dayLabel(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return format(date, 'EEEE');
}

interface FreeWindow {
  date: Date;
  dateStr: string;
  dayLabel: string;
  slots: TimeSlot[];
  overlappingFriendIds: string[];
}

export function FreeWindowCard() {
  const availability = usePlannerStore((s) => s.availability);
  const isLoading = usePlannerStore((s) => s.isLoading);
  const { data: friendData } = useFriendDashboardData();

  const windows = useMemo<FreeWindow[]>(() => {
    const today = new Date();
    const results: FreeWindow[] = [];

    for (let i = 0; i < 7; i++) {
      const d = addDays(today, i);
      const dateStr = format(d, 'yyyy-MM-dd');

      // Find this day in the availability array (date is a Date object in the store)
      const dayAvail = availability.find(
        (a) => format(a.date, 'yyyy-MM-dd') === dateStr
      );
      if (!dayAvail) continue;

      const freeSlots = (Object.entries(dayAvail.slots) as [TimeSlot, boolean][])
        .filter(([, isFree]) => isFree)
        .map(([slot]) => slot);

      if (freeSlots.length === 0) continue;

      // Which friends are also free on this date?
      const overlappingIds = (friendData ?? [])
        .filter((f) => f.freeDates.includes(dateStr))
        .map((f) => f.userId);

      results.push({
        date: d,
        dateStr,
        dayLabel: dayLabel(d),
        slots: freeSlots,
        overlappingFriendIds: overlappingIds,
      });
    }

    // Sort: most friend overlap first, then soonest date
    return results.sort(
      (a, b) =>
        b.overlappingFriendIds.length - a.overlappingFriendIds.length ||
        a.date.getTime() - b.date.getTime()
    );
  }, [availability, friendData]);

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-1.5 px-0.5">
        <Sparkles size={13} color="#DDA73A" strokeWidth={2} />
        <Text className="font-sans text-xs text-foreground/40 uppercase tracking-widest">
          Your free windows
        </Text>
      </View>

      {isLoading ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3 px-0.5 pb-1"
          scrollEnabled={false}
        >
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              className="bg-white border border-border/30 rounded-2xl p-4 gap-2 w-44 shadow-sm"
            >
              <View className="gap-1">
                <Skeleton width={48} height={10} />
                <Skeleton width={80} height={18} rounded="rounded-md" />
                <Skeleton width={56} height={10} />
              </View>
              <View className="flex-row items-center gap-1.5 mt-1">
                {[0, 1, 2].map((j) => (
                  <Skeleton key={j} width={24} height={24} rounded="rounded-full" />
                ))}
                <Skeleton width={40} height={10} className="ml-1" />
              </View>
            </View>
          ))}
        </ScrollView>
      ) : windows.length === 0 ? (
        <View className="bg-white rounded-2xl border border-dashed border-border/40 px-4 py-5 items-center gap-1">
          <Text className="font-sans text-sm text-foreground/40">No open time this week</Text>
          <Text className="font-sans text-xs text-foreground/30">
            Mark some days free in your availability
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3 px-0.5 pb-1"
        >
          {windows.map((w) => {
            const overlappingFriends = (friendData ?? []).filter((f) =>
              w.overlappingFriendIds.includes(f.userId)
            );
            const primarySlot = w.slots[0];
            const label = SLOT_LABEL[primarySlot];

            return (
              <Pressable
                key={w.dateStr}
                onPress={() => router.push(`/(app)/day/${w.dateStr}`)}
                className="bg-white border border-border/30 rounded-2xl p-4 gap-2 w-44 shadow-sm"
              >
                {/* Day + date */}
                <View>
                  <Text className="font-sans text-foreground/50 text-xs">{w.dayLabel}</Text>
                  <Text className="font-sans font-semibold text-evergreen text-base mt-0.5">
                    {label.short}
                    {w.slots.length > 1 ? ` +${w.slots.length - 1}` : ''}
                  </Text>
                  <Text className="font-sans text-foreground/40 text-xs">{label.range}</Text>
                </View>

                {/* Friend overlap */}
                {overlappingFriends.length > 0 ? (
                  <View className="flex-row items-center gap-1.5 mt-1">
                    <View className="flex-row -space-x-1.5">
                      {overlappingFriends.slice(0, 3).map((f) => (
                        <Avatar
                          key={f.userId}
                          url={f.avatarUrl}
                          displayName={f.displayName ?? undefined}
                          size="xs"
                          className="border border-white"
                        />
                      ))}
                    </View>
                    <Text className="font-sans text-xs text-sage">
                      {overlappingFriends.length} free
                    </Text>
                  </View>
                ) : (
                  <View className="flex-row items-center gap-1 mt-1">
                    <Users size={12} color="#9CB094" strokeWidth={1.75} />
                    <Text className="font-sans text-xs text-foreground/30">No overlap yet</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      ) /* end isLoading else */}
    </View>
  );
}
