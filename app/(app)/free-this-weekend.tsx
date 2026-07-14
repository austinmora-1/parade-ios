/**
 * Free this weekend — friend-centric view of who's free on this week's
 * Fri/Sat/Sun, reached from the Home "X free this weekend" stat pill.
 * (XPE-280)
 *
 * Lists the exact friends the pill counts (useFriendDashboardData is already
 * same-city + mutual-free-social-slot filtered). Each friend shows one
 * availability wheel per weekend day (mutual-free share of that day's social
 * capacity); tapping a day expands its open slots as chips → quick-plan.
 */
import { ScrollView, View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { format, addDays, startOfWeek } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { ChevronRight, Share2 } from 'lucide-react-native';
import { useFriendDashboardData, type OverlapSlot, type FriendVibe } from '@/hooks/useFriendDashboardData';
import { Avatar } from '@/components/primitives/Avatar';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { DateDial } from '@/components/plans/DateDial';
import { SLOT_LABEL, SLOT_OPTIONS, SLOT_START_HOUR, isSocialSlot, slotRangeLabel } from '@/lib/socialSlots';
import { PARADE_GREEN, MARIGOLD } from '@/lib/colors';
import { formatDisplayName } from '@/lib/utils';

// ─── Shared weekend day set ───────────────────────────────────────────────────

/**
 * Fri/Sat/Sun of the current week (weeks start Monday) as yyyy-MM-dd strings.
 * Single source of truth for BOTH the Home "X free this weekend" pill count
 * and this page, so the two can never drift.
 */
export function weekendDateStrs(now: Date = new Date()): string[] {
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  return [4, 5, 6].map((i) => format(addDays(weekStart, i), 'yyyy-MM-dd'));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseLocal(d: string): Date {
  return new Date(`${d}T00:00:00`);
}

/** e.g. "Fri, Jul 17 – Sun 19" (month repeated only when it changes). */
function weekendRangeLabel(dates: string[]): string {
  const fri = parseLocal(dates[0]);
  const sun = parseLocal(dates[dates.length - 1]);
  const sameMonth = fri.getMonth() === sun.getMonth();
  return `${format(fri, 'EEE, MMM d')} – ${format(sun, sameMonth ? 'EEE d' : 'EEE, MMM d')}`;
}

function goToQuickPlan(date: string, slot: OverlapSlot['slot']) {
  Haptics.selectionAsync();
  router.push(`/(app)/quick-plan?date=${date}&slot=${slot}`);
}

// ─── Friend card ──────────────────────────────────────────────────────────────

/** Social-slot capacity for a date (Sat/Sun = 6; Fri = evening + late night). */
function socialCapacity(date: string): number {
  const day = parseLocal(date);
  return SLOT_OPTIONS.filter((o) => isSocialSlot(day, o.id)).length;
}

/**
 * One friend: header row → friend page, then an availability wheel per
 * weekend day (arc = mutual-free share of that day's social capacity).
 * Tapping a day with any free time expands its slots as chips → quick-plan.
 */
function FriendWeekendCard({
  friend,
  weekendDates,
}: {
  friend: FriendVibe & { weekendSlots: OverlapSlot[] };
  weekendDates: string[];
}) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const name = formatDisplayName({
    firstName: friend.firstName,
    lastName: friend.lastName,
    displayName: friend.displayName,
  });

  const days = weekendDates.map((date) => {
    const slots = friend.weekendSlots.filter((s) => s.date === date);
    const capacity = socialCapacity(date);
    const share = capacity > 0 ? slots.length / capacity : 0;
    return { date, slots, capacity, share };
  });

  const toggleDay = (date: string, hasSlots: boolean) => {
    if (!hasSlots) return;
    Haptics.selectionAsync();
    setExpandedDate((cur) => (cur === date ? null : date));
  };

  const expanded = days.find((d) => d.date === expandedDate);

  return (
    <View className="bg-card rounded-2xl border border-border/30 p-4 gap-3 shadow-sm">
      {/* Friend row → friend page */}
      <Pressable
        onPress={() => router.push(`/(app)/friend/${friend.userId}`)}
        className="flex-row items-center gap-3 active:opacity-70"
        accessibilityRole="button"
        accessibilityLabel={`Open ${name}'s page`}
      >
        <Avatar
          url={friend.avatarUrl}
          firstName={friend.firstName}
          lastName={friend.lastName}
          displayName={friend.displayName}
          size="md"
        />
        <View className="flex-1 min-w-0">
          {friend.city && (
            <Text
              className="font-sans text-[10px] font-semibold uppercase tracking-widest text-primary/70"
              numberOfLines={1}
            >
              In town · {friend.city}
            </Text>
          )}
          <Text className="font-display text-[17px] text-foreground" numberOfLines={1}>
            {name}
          </Text>
        </View>
        <ChevronRight size={16} color="#929298" strokeWidth={2} />
      </Pressable>

      {/* One availability wheel per weekend day — tap to expand its slots */}
      <View className="flex-row justify-around">
        {days.map((d) => {
          const free = d.slots.length;
          const isExpanded = expandedDate === d.date;
          const dayDate = parseLocal(d.date);
          return (
            <Pressable
              key={d.date}
              onPress={() => toggleDay(d.date, free > 0)}
              disabled={free === 0}
              className="items-center gap-1 rounded-2xl px-2.5 py-1.5 active:opacity-70"
              style={isExpanded ? { backgroundColor: 'rgba(35,116,77,0.08)' } : undefined}
              accessibilityRole="button"
              accessibilityState={{ expanded: isExpanded }}
              accessibilityLabel={
                free > 0
                  ? `${format(dayDate, 'EEEE')} — ${free} of ${d.capacity} windows free, tap to ${isExpanded ? 'collapse' : 'see times'}`
                  : `${format(dayDate, 'EEEE')} — not free`
              }
            >
              <DateDial
                status={free === 0 ? 'unavailable' : 'some'}
                fill={d.share}
                dayName={format(dayDate, 'EEE')}
                dayNum={format(dayDate, 'd')}
                size={54}
                arcColor={d.share >= 0.5 ? PARADE_GREEN : MARIGOLD}
              />
              <Text
                className="font-sans text-[10px] font-medium"
                style={{ color: free > 0 ? '#6E6E74' : '#B4B2A9' }}
              >
                {free > 0 ? `${free} free` : 'busy'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Expanded day → its open slots as chips → quick-plan */}
      {expanded && expanded.slots.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5 pt-0.5">
          {expanded.slots.map((s) => (
            <Pressable
              key={`${s.date}-${s.slot}`}
              onPress={() => goToQuickPlan(s.date, s.slot)}
              hitSlop={4}
              className="flex-row items-center gap-1.5 bg-primary/10 border border-primary/25 rounded-full px-3 py-1.5 active:opacity-70"
              accessibilityRole="button"
              accessibilityLabel={`Plan ${format(parseLocal(s.date), 'EEEE')} ${SLOT_LABEL[s.slot].toLowerCase()} with ${name}`}
            >
              <Text className="font-sans text-xs font-semibold text-primary">
                {SLOT_LABEL[s.slot]}
              </Text>
              <Text className="font-sans text-[11px] text-primary/60">
                {slotRangeLabel(s.slot)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FreeThisWeekendScreen() {
  const { data: friendData, isLoading } = useFriendDashboardData();

  const weekendDates = useMemo(() => weekendDateStrs(), []);
  const weekendSet = useMemo(() => new Set(weekendDates), [weekendDates]);

  // Friends with ≥1 mutual slot on the weekend day set, each carrying only
  // their weekend slots (chronological). Hook order (most-free-first) kept.
  const freeFriends = useMemo(
    () =>
      (friendData ?? [])
        .map((f) => ({
          ...f,
          weekendSlots: f.overlapSlots
            .filter((s) => weekendSet.has(s.date))
            .sort(
              (a, b) =>
                a.date.localeCompare(b.date) ||
                SLOT_START_HOUR[a.slot] - SLOT_START_HOUR[b.slot],
            ),
        }))
        .filter((f) => f.weekendSlots.length > 0),
    [friendData, weekendSet],
  );

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      <ScreenHeader title="Free this weekend" subtitle={weekendRangeLabel(weekendDates)} />

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        {isLoading ? (
          <View className="items-center py-20">
            <ActivityIndicator size="large" color="#23744D" />
          </View>
        ) : freeFriends.length === 0 ? (
          <View className="items-center py-20 px-8 gap-3">
            <Text style={{ fontSize: 32 }}>🗓️</Text>
            <Text className="font-sans text-sm font-semibold text-foreground text-center">
              No friends are free this weekend yet
            </Text>
            <Text className="font-sans text-xs text-muted-foreground text-center">
              Share your availability so friends know when you're around.
            </Text>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                router.push('/(app)/share-availability');
              }}
              className="flex-row items-center gap-1.5 mt-2 bg-primary rounded-full px-4 py-2 active:opacity-90"
            >
              <Share2 size={14} color="#FFFFFF" strokeWidth={2.5} />
              <Text className="font-sans text-sm font-semibold text-white">
                Share your availability
              </Text>
            </Pressable>
          </View>
        ) : (
          <View className="px-5 pt-2 gap-3">
            {freeFriends.map((f) => (
              <FriendWeekendCard key={f.userId} friend={f} weekendDates={weekendDates} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
