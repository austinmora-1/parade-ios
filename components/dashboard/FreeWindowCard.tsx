/**
 * FreeWindowCard — "Recommended"
 * Horizontal scroll of window chips. Each chip shows:
 *   - Day label eyebrow (e.g. "Monday")
 *   - Time range headline in Fraunces (e.g. "12–6pm") — spans all free slots
 *   - Friend overlap avatars + count
 *
 * Matches PWA FreeWindowCard layout. Read-only Phase 1; tap → day detail.
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
import { isSocialSlot, twoHourWindowLabel, SLOT_START_HOUR } from '@/lib/socialSlots';
import type { TimeSlot } from '@/types/planner';

const MAX_WINDOWS = 8;

// ─── Time slot helpers ────────────────────────────────────────────────────────

const SLOT_ORDER: TimeSlot[] = [
  'early-morning', 'late-morning', 'early-afternoon',
  'late-afternoon', 'evening', 'late-night',
];

function dayLabel(date: Date): string {
  if (isToday(date))   return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return format(date, 'EEEE');
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FreeWindow {
  date: Date;
  dateStr: string;
  slot: TimeSlot;
  label: string;
  timeRange: string;            // 2-hour window, e.g. "6–8pm"
  overlappingFriendIds: string[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FreeWindowCard() {
  const availability = usePlannerStore((s) => s.availability);
  const isLoading    = usePlannerStore((s) => s.isLoading);
  const { data: friendData } = useFriendDashboardData();

  const windows = useMemo<FreeWindow[]>(() => {
    const today = new Date();
    const results: FreeWindow[] = [];

    for (let i = 0; i < 7; i++) {
      const d       = addDays(today, i);
      const dateStr = format(d, 'yyyy-MM-dd');

      const dayAvail = availability.find(
        (a) => format(a.date, 'yyyy-MM-dd') === dateStr,
      );
      if (!dayAvail) continue;

      // One window per available SOCIAL slot (evenings + weekends),
      // each shown as a single ≤2-hour window rather than a merged span.
      const freeSlots = (Object.entries(dayAvail.slots) as [TimeSlot, boolean][])
        .filter(([slot, isFree]) => isFree && isSocialSlot(d, slot))
        .map(([slot]) => slot)
        .sort((a, b) => SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b));

      if (freeSlots.length === 0) continue;

      const overlappingIds = (friendData ?? [])
        .filter((f) => f.overlapSlots.some(
          (o) => o.date === dateStr,
        ))
        .map((f) => f.userId);

      for (const slot of freeSlots) {
        results.push({
          date:    d,
          dateStr,
          slot,
          label:   dayLabel(d),
          timeRange: twoHourWindowLabel(slot),
          overlappingFriendIds: overlappingIds,
        });
      }
    }

    // Sort: most friend overlap first, then soonest date, then earliest slot.
    results.sort(
      (a, b) =>
        b.overlappingFriendIds.length - a.overlappingFriendIds.length ||
        a.date.getTime() - b.date.getTime() ||
        SLOT_START_HOUR[a.slot] - SLOT_START_HOUR[b.slot],
    );
    return results.slice(0, MAX_WINDOWS);
  }, [availability, friendData]);

  return (
    <View className="gap-3">
      {/* Section eyebrow — matches PWA */}
      <View className="flex-row items-center gap-1.5 px-0.5">
        <Sparkles size={12} color="#23744D" strokeWidth={2} />
        <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Recommended
        </Text>
      </View>

      {isLoading ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2.5 px-0.5 pb-1"
          scrollEnabled={false}
        >
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              className="bg-white border border-border/30 rounded-2xl p-4 gap-2 shadow-sm"
              style={{ width: 176 }}
            >
              <View className="gap-1.5">
                <Skeleton width={56} height={10} />
                <Skeleton width={96} height={22} rounded="rounded-md" />
              </View>
              <View className="flex-row items-center gap-1.5 mt-1">
                {[0, 1].map((j) => (
                  <Skeleton key={j} width={24} height={24} rounded="rounded-full" />
                ))}
                <Skeleton width={36} height={10} className="ml-1" />
              </View>
            </View>
          ))}
        </ScrollView>
      ) : windows.length === 0 ? (
        <View className="bg-white rounded-2xl border border-dashed border-border/40 px-4 py-5 items-center gap-1">
          <Text className="font-sans text-sm text-muted-foreground">No open time this week</Text>
          <Text className="font-sans text-xs text-muted-foreground/60">
            Mark some days free in your availability
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2.5 px-0.5 pb-1"
        >
          {windows.map((w) => {
            const overlappingFriends = (friendData ?? []).filter((f) =>
              w.overlappingFriendIds.includes(f.userId),
            );

            return (
              <Pressable
                key={`${w.dateStr}-${w.slot}`}
                onPress={() => router.push(`/(app)/day/${w.dateStr}`)}
                className="bg-white border border-border/30 rounded-2xl p-4 gap-1.5 shadow-sm"
                style={{ width: 176 }}
              >
                {/* Day eyebrow */}
                <Text className="font-sans text-xs uppercase tracking-wide text-muted-foreground">
                  {w.label}
                </Text>

                {/* Time range — Fraunces headline (matches PWA font-display text-lg) */}
                <Text
                  className="font-display text-lg leading-tight text-evergreen"
                  numberOfLines={1}
                >
                  {w.timeRange}
                </Text>

                {/* Friend overlap */}
                <View className="flex-row items-center gap-1.5 mt-1">
                  {overlappingFriends.length > 0 ? (
                    <>
                      <View className="flex-row" style={{ gap: -6 }}>
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
                      <Text className="font-sans text-xs text-muted-foreground">
                        {overlappingFriends.length} free
                      </Text>
                    </>
                  ) : (
                    <>
                      <Users size={11} color="#929298" strokeWidth={1.75} />
                      <Text className="font-sans text-xs text-muted-foreground/60">
                        No overlap yet
                      </Text>
                    </>
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
