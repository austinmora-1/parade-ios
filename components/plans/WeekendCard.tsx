/**
 * WeekendCard — one Sat/Sun pair in the "Open weekends" view. Renders the
 * weekend's state (open / partial / away / booked), tappable open-slot chips,
 * and friends-free avatars. Open/partial cards collapse the slot-pill rows by
 * default; tapping the card toggles expand/collapse (XPE-286). When expanded,
 * tapping a chip routes into the existing quick-plan composer with the date +
 * slot prefilled — the same non-FAB path FreeWindowCard / RecommendedCTA use.
 * (Reframe of XPE-274.)
 */
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { format, isToday } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { Plane, CalendarCheck, ChevronDown, ChevronRight, Home } from 'lucide-react-native';
import { Avatar } from '@/components/primitives/Avatar';
import { DateDial, getDayStatus, dayStatusColor, TOTAL_SLOTS } from '@/components/plans/DateDial';
import { PARADE_GREEN, EMBER } from '@/lib/colors';
import type { WeekendSummary, WeekendState } from '@/lib/openWeekends';

const AMBER = '#BA7517';
const GRAY = '#B4B2A9';

const ACCENT: Record<WeekendState, string> = {
  open: PARADE_GREEN,
  partial: AMBER,
  booked: GRAY,
  away: EMBER,
};

function parseLocal(d: string): Date {
  return new Date(`${d}T00:00:00`);
}

function dateRangeLabel(saturday: string, sunday: string): string {
  const sat = parseLocal(saturday);
  const sun = parseLocal(sunday);
  const sameMonth = sat.getMonth() === sun.getMonth();
  return `${format(sat, 'MMM d')} – ${sameMonth ? format(sun, 'd') : format(sun, 'MMM d')}`;
}

/** Open the quick-plan composer for a whole day — the same overlapping-free-
 *  friends menu the slot chips used, without preselecting a slot. */
function goToQuickPlanDay(date: string) {
  Haptics.selectionAsync();
  router.push(`/(app)/quick-plan?date=${date}`);
}

export function WeekendCard({ summary }: { summary: WeekendSummary }) {
  const { state, openSlots, friends, bookedTitles, awayLocation } = summary;
  const accent = ACCENT[state];
  const interactive = state === 'open' || state === 'partial';
  const [expanded, setExpanded] = useState(false);

  const stateLine =
    state === 'open' ? 'Free all weekend'
    : state === 'partial' ? 'Some open time'
    : state === 'away' ? `Away${awayLocation ? ` · ${awayLocation}` : ''}`
    : `Booked${bookedTitles[0] ? ` · ${bookedTitles[0]}` : ''}`;

  const onCardPress = interactive
    ? () => {
        Haptics.selectionAsync();
        setExpanded((e) => !e);
      }
    : undefined;

  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <Pressable
      onPress={onCardPress}
      disabled={!interactive}
      accessibilityRole={interactive ? 'button' : undefined}
      accessibilityState={interactive ? { expanded } : undefined}
      className="flex-row gap-3 bg-card rounded-2xl border border-border/20 p-3.5 mb-2.5 active:opacity-80"
      style={state === 'away' ? { backgroundColor: 'rgba(212,101,73,0.06)' } : undefined}
    >
      <View style={{ width: 4, borderRadius: 999, backgroundColor: accent }} />
      <View className="flex-1">
        <View className="flex-row items-baseline justify-between">
          <Text className="font-display text-[17px] text-foreground">
            {dateRangeLabel(summary.saturday, summary.sunday)}
          </Text>
          <View className="flex-row items-center gap-1">
            <Text className="font-sans text-[11px] text-muted-foreground">Sat – Sun</Text>
            {interactive && <Chevron size={14} color={GRAY} strokeWidth={2} />}
          </View>
        </View>

        <View className="flex-row items-center gap-1.5 mt-0.5">
          {state === 'away' && <Plane size={14} color={EMBER} strokeWidth={2} />}
          {state === 'booked' && <CalendarCheck size={14} color={GRAY} strokeWidth={2} />}
          <Text
            className="font-sans text-[13px] font-medium"
            style={{ color: accent === GRAY ? '#8A8579' : accent, flexShrink: 1 }}
            numberOfLines={1}
          >
            {stateLine}
          </Text>
          {state !== 'away' && (
            // A weekend a trip only touches via a timed travel day stays
            // open/partial — keep the trip visible with a Travel pill
            // instead of claiming a full "Home" weekend.
            awayLocation ? (
              <View
                className="flex-row items-center gap-1 rounded-full px-1.5 py-0.5"
                style={{ marginLeft: 'auto', backgroundColor: 'rgba(212,101,73,0.10)' }}
              >
                <Plane size={11} color={EMBER} strokeWidth={2} />
                <Text
                  className="font-sans text-[10px] font-medium"
                  style={{ color: EMBER, maxWidth: 120 }}
                  numberOfLines={1}
                >
                  Traveling · {awayLocation}
                </Text>
              </View>
            ) : (
              <View
                className="flex-row items-center gap-1 rounded-full px-1.5 py-0.5"
                style={{ marginLeft: 'auto', backgroundColor: 'rgba(35,116,77,0.10)' }}
              >
                <Home size={11} color={PARADE_GREEN} strokeWidth={2} />
                <Text className="font-sans text-[10px] font-medium" style={{ color: PARADE_GREEN }}>
                  Home
                </Text>
              </View>
            )
          )}
        </View>

        {interactive && expanded && (
          <View className="flex-row gap-3 mt-3">
            {([summary.saturday, summary.sunday] as const).map((date) => {
              const day = parseLocal(date);
              const free = openSlots.filter((s) => s.date === date).length;
              const { status, fill } = getDayStatus(free, true);
              return (
                <Pressable
                  key={date}
                  onPress={() => goToQuickPlanDay(date)}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel={`${format(day, 'EEEE')} — ${free} of ${TOTAL_SLOTS} slots free, tap to plan`}
                  className="flex-1 items-center gap-1.5 rounded-xl py-2 active:opacity-70"
                >
                  <DateDial
                    status={status}
                    fill={fill}
                    arcColor={dayStatusColor(status)}
                    dayName={format(day, 'EEE')}
                    dayNum={format(day, 'd')}
                    isToday={isToday(day)}
                    size={56}
                  />
                  <Text className="font-sans text-[11px] font-medium text-muted-foreground">
                    {free > 0 ? `${free} slot${free === 1 ? '' : 's'} free` : 'Booked'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {state !== 'away' && friends.length > 0 && (
          <View className="flex-row items-center mt-2.5">
            <View className="flex-row">
              {friends.slice(0, 3).map((f, i) => (
                <View key={f.userId} style={{ marginLeft: i === 0 ? 0 : -7 }}>
                  <Avatar url={f.avatarUrl} displayName={f.name} size="sm" />
                </View>
              ))}
            </View>
            <Text className="font-sans text-[12px] text-muted-foreground ml-2">
              {friends.length} {friends.length === 1 ? 'friend' : 'friends'} free
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
