/**
 * Plans tab — matches PWA Availability/Plans page layout.
 *
 * Structure:
 *  1. Header: "Plans & Trips" (Fraunces black) + week navigator
 *  2. Weekend hero card (Sat/Sun, white, Fraunces day numbers)
 *  3. "Weekdays" section (Mon–Fri) — each row has DateDial +
 *     availability pill + plan items + "+" button
 *  4. All Upcoming plans list (left-border accent cards)
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useCallback, useState, useEffect } from 'react';
import {
  format,
  startOfWeek,
  addDays,
  addWeeks,
  isToday,
  isTomorrow,
  isSameDay,
  isSameMonth,
  differenceInCalendarDays,
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  ArrowLeft,
  Plus,
  MapPin,
  Plane,
  Zap,
  Users,
} from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';
import { supabase } from '@/integrations/supabase/client';
import { TIME_SLOT_LABELS } from '@/types/planner';
import type { Plan, DayAvailability, TimeSlot } from '@/types/planner';
import { activityAccent } from '@/lib/activityColors';
import { TC } from '@/lib/theme';
import { TINT, PARADE_GREEN, MARIGOLD } from '@/lib/colors';
import { DateDial, getDayStatus } from '@/components/plans/DateDial';
import { Avatar } from '@/components/primitives/Avatar';
import { formatDisplayName } from '@/lib/utils';
import { citiesMatch, normalizeCity } from '@/lib/locationMatch';
import { formatCityForDisplay } from '@/lib/formatCity';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Short time labels for right-side of weekday row plan items */
const SLOT_SHORT: Record<string, string> = {
  'early-morning':   '6am',
  'late-morning':    '9am',
  'early-afternoon': '12pm',
  'late-afternoon':  '3pm',
  'evening':         '6pm',
  'late-night':      '10pm',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekLabel(start: Date, end: Date): string {
  if (isSameMonth(start, end)) return `${format(start, 'MMM d')}–${format(end, 'd')}`;
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`;
}

function casualDayLabel(date: Date): string {
  if (isToday(date)) return 'today';
  if (isTomorrow(date)) return 'tomorrow';
  return format(date, 'EEEE');
}

/** Hour each slot ends — used to skip windows already past today */
const SLOT_END_HOUR: Record<string, number> = {
  'early-morning':   9,
  'late-morning':    12,
  'early-afternoon': 15,
  'late-afternoon':  18,
  'evening':         22,
  'late-night':      26,
};

const SLOT_ORDER: TimeSlot[] = [
  'early-morning', 'late-morning', 'early-afternoon',
  'late-afternoon', 'evening', 'late-night',
];

interface FreeWindow { date: Date; slot: TimeSlot }

/** First upcoming free window in the given days with no plan in it yet */
function findNextFreeWindow(
  days: Date[],
  availability: DayAvailability[],
  plans: Plan[],
): FreeWindow | null {
  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');

  for (const day of days) {
    const dateStr = format(day, 'yyyy-MM-dd');
    if (dateStr < todayStr) continue;
    const dayAvail = availability.find(
      (a) => format(a.date, 'yyyy-MM-dd') === dateStr,
    );
    if (!dayAvail) continue;

    const dayPlans = plans.filter((p) =>
      isSameDay(p.date instanceof Date ? p.date : new Date(p.date), day),
    );

    for (const slot of SLOT_ORDER) {
      if (!dayAvail.slots[slot]) continue;
      if (dateStr === todayStr && now.getHours() >= SLOT_END_HOUR[slot]) continue;
      if (dayPlans.some((p) => p.timeSlot === slot)) continue;
      return { date: day, slot };
    }
  }
  return null;
}

/** Availability-driven CTA — replaces the old "All Upcoming" list */
function AvailabilityCTA({ nextFree }: { nextFree: FreeWindow | null }) {
  if (nextFree) {
    const slotMeta = TIME_SLOT_LABELS[nextFree.slot];
    const dateStr = format(nextFree.date, 'yyyy-MM-dd');
    return (
      <Pressable
        onPress={() => router.push(`/(app)/quick-plan?date=${dateStr}&slot=${nextFree.slot}`)}
        className="mx-5 rounded-2xl px-4 py-3.5 flex-row items-center gap-3 active:opacity-80"
        style={{ backgroundColor: TINT.primarySubtle, borderWidth: 1, borderColor: TINT.primaryBorder }}
      >
        <View
          className="w-9 h-9 rounded-full items-center justify-center"
          style={{ backgroundColor: PARADE_GREEN }}
        >
          <Zap size={16} color="#FFFFFF" strokeWidth={2.25} />
        </View>
        <View className="flex-1">
          <Text className="font-display text-sm" style={{ color: PARADE_GREEN }}>
            You're free {casualDayLabel(nextFree.date)} {slotMeta.label.toLowerCase()}
          </Text>
          <Text className="font-sans text-xs text-muted-foreground mt-0.5">
            {slotMeta.time} · grab the window before it fills up
          </Text>
        </View>
        <View className="bg-primary rounded-full px-3 py-1.5">
          <Text className="font-sans text-xs font-semibold text-white">Quick plan</Text>
        </View>
      </Pressable>
    );
  }

  // No free windows left this week — point at find-time instead
  return (
    <Pressable
      onPress={() => router.push('/(app)/find-time')}
      className="mx-5 rounded-2xl px-4 py-3.5 flex-row items-center gap-3 active:opacity-80"
      style={{ backgroundColor: TINT.secondarySubtle, borderWidth: 1, borderColor: TINT.secondaryBorder }}
    >
      <View
        className="w-9 h-9 rounded-full items-center justify-center"
        style={{ backgroundColor: '#D46549' }}
      >
        <Users size={16} color="#FFFFFF" strokeWidth={2.25} />
      </View>
      <View className="flex-1">
        <Text className="font-display text-sm" style={{ color: '#D46549' }}>
          Booked up this week
        </Text>
        <Text className="font-sans text-xs text-muted-foreground mt-0.5">
          See where your time overlaps with friends
        </Text>
      </View>
      <View className="rounded-full px-3 py-1.5" style={{ backgroundColor: '#D46549' }}>
        <Text className="font-sans text-xs font-semibold text-white">Find time</Text>
      </View>
    </Pressable>
  );
}

/** "Ben" / "Ben & Jules" / "Ben, Jules & Erin" from first names */
function nameList(names: string[]): string {
  const firsts = names.map((n) => n.split(' ')[0]).filter(Boolean);
  if (firsts.length === 0) return '';
  if (firsts.length === 1) return firsts[0];
  return `${firsts.slice(0, -1).join(', ')} & ${firsts[firsts.length - 1]}`;
}

interface AvailInfo { count: number; hasData: boolean }

function getAvailInfo(date: Date, availability: DayAvailability[]): AvailInfo {
  const dateStr = format(date, 'yyyy-MM-dd');
  const dayAvail = availability.find((a) => format(a.date, 'yyyy-MM-dd') === dateStr);
  if (!dayAvail) return { count: 0, hasData: false };
  const count = Object.values(dayAvail.slots).filter(Boolean).length;
  return { count, hasData: true };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Availability summary pill — matches PWA summaryPillClass logic */
function AvailPill({ count, hasData }: AvailInfo) {
  if (!hasData) return null;

  let label: string;
  let bg: string;
  let textColor: string;

  if (count === 0) {
    label = 'Booked'; bg = TINT.secondarySubtle; textColor = '#D46549';
  } else if (count <= 2) {
    label = 'Some time'; bg = TINT.amberSubtle; textColor = '#92400E';
  } else if (count <= 4) {
    label = 'Mostly open'; bg = TINT.primarySubtle; textColor = '#23744D';
  } else {
    label = 'Open'; bg = TINT.primaryBorder; textColor = '#1A5C3A';
  }

  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: textColor }}>
        {label}
      </Text>
    </View>
  );
}

/** Weekend hero — gradient card (PWA parity: primary → card → sunshine)
 *  with Fraunces headline, Sat/Sun day grid, and an inline trip banner
 *  when a trip overlaps the weekend. */
function WeekendHeroCard({
  days,
  plans,
  trip,
}: {
  days: Date[];
  plans: Plan[];
  trip?: any | null;
}) {
  const weekendPlanCount = plans.filter((p) =>
    days.some((day) =>
      isSameDay(p.date instanceof Date ? p.date : new Date(p.date), day),
    ),
  ).length;

  const headline = trip
    ? trip.name || (trip.location ? `Headed to ${trip.location}` : 'Trip in progress')
    : weekendPlanCount > 0
      ? 'Weekend lineup'
      : 'Open weekend';

  // People line — split everyone on the trip by home city vs destination:
  // locals (home = destination) are being visited, the rest are traveling.
  //   travelers + locals → "You & Erin are visiting Ben & Jules"
  //   travelers only     → "You & Erin are going to Austin"
  const people: TripPerson[] = trip?.people ?? [];
  const destCity = normalizeCity(trip?.location || '');
  // Only people with a known home city can be classified — others are
  // left out of the sentence (they still appear in the avatar stack).
  const known = people.filter((p) => !!normalizeCity(p.home || ''));
  const locals = destCity
    ? known.filter((p) => citiesMatch(normalizeCity(p.home!), destCity))
    : [];
  const travelers = destCity ? known.filter((p) => !locals.includes(p)) : [];
  const tripPeople = people.filter((p) => !p.isSelf); // avatar stack

  /** First names, with yourself shown first as "You" */
  const peopleNames = (list: TripPerson[]): string[] =>
    [...list]
      .sort((a, b) => Number(b.isSelf) - Number(a.isSelf))
      .map((p) => (p.isSelf ? 'You' : p.name));

  let peopleLine = '';
  if (travelers.length > 0 && locals.length > 0) {
    const verb = travelers.length > 1 || travelers[0].isSelf ? 'are' : 'is';
    peopleLine = `${nameList(peopleNames(travelers))} ${verb} visiting ${nameList(peopleNames(locals))}`;
  } else if (travelers.length > 0 && destCity && tripPeople.length > 0) {
    const verb = travelers.length > 1 || travelers[0].isSelf ? 'are' : 'is';
    peopleLine = `${nameList(peopleNames(travelers))} ${verb} going to ${formatCityForDisplay(trip.location)}`;
  } else if (tripPeople.length > 0) {
    peopleLine = `With ${nameList(peopleNames(tripPeople))}`;
  }

  // Measured so the gradient SVG gets explicit dimensions — percentage
  // sizing on an absolute-fill Svg leaves part of the card unpainted.
  const [heroSize, setHeroSize] = useState<{ w: number; h: number } | null>(null);

  return (
    <View
      className="bg-card rounded-2xl p-4 gap-3 mx-5 shadow-sm overflow-hidden"
      style={{
        borderWidth: 1,
        borderColor: trip ? TINT.primaryStrong : TINT.primaryBorder,
      }}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setHeroSize({ w: width, h: height });
      }}
    >
      {/* Gradient wash — from-primary/15 via-card to-sunshine/18 (PWA) */}
      {heroSize && (
        <Svg
          width={heroSize.w}
          height={heroSize.h}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Defs>
            <LinearGradient id="weekendHeroGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={PARADE_GREEN} stopOpacity={trip ? 0.18 : 0.12} />
              <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0} />
              <Stop offset="1" stopColor={MARIGOLD} stopOpacity={trip ? 0.22 : 0.16} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={heroSize.w} height={heroSize.h} fill="url(#weekendHeroGrad)" />
        </Svg>
      )}

      {/* Header */}
      <View className="flex-row items-center gap-2">
        <View className="w-1.5 h-1.5 rounded-full bg-primary" />
        <Text className="font-sans text-[11px] font-bold uppercase tracking-wider text-primary">
          This Weekend
        </Text>
        <Text className="font-sans text-[11px] text-muted-foreground ml-1">
          {format(days[0], 'MMM d')} – {format(days[1], 'd')}
        </Text>
      </View>

      {/* Headline — Fraunces black (PWA font-display text-2xl font-black) */}
      <View className="gap-1 -mt-1">
        <Text
          className="font-display leading-tight"
          style={{ fontSize: 24, color: PARADE_GREEN }}
          numberOfLines={2}
        >
          {headline}
        </Text>
        {!trip && weekendPlanCount === 0 && (
          <Text className="font-sans text-xs text-muted-foreground">
            Two clear days to fill — make plans or pencil in some rest.
          </Text>
        )}

        {/* Trip people — avatar stack + "You & Erin are visiting Ben & Jules" */}
        {trip && peopleLine ? (
          <View className="flex-row items-center gap-2 mt-0.5">
            {tripPeople.length > 0 && (
              <View className="flex-row" style={{ gap: -6 }}>
                {tripPeople.slice(0, 4).map((p, i) => (
                  <Avatar
                    key={i}
                    url={p.avatar}
                    displayName={p.name}
                    size="xs"
                    className="border border-white"
                  />
                ))}
              </View>
            )}
            <Text
              className="font-sans text-xs font-medium text-muted-foreground flex-1"
              numberOfLines={1}
            >
              {peopleLine}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Trip overlay — appears above the day grid when a trip spans the weekend */}
      {trip && (
        <Pressable
          onPress={() => router.push(`/(app)/trip/${trip.id}`)}
          className="flex-row items-center gap-2 bg-primary/8 rounded-xl px-3 py-2 active:opacity-70"
        >
          <Plane size={13} color="#23744D" strokeWidth={2} />
          <Text
            className="flex-1 font-sans text-xs font-medium text-primary"
            numberOfLines={1}
          >
            {trip.location ? `Trip to ${trip.location}` : trip.name || 'Trip in progress'}
          </Text>
          <ChevronRight size={12} color="#23744D" strokeWidth={2} />
        </Pressable>
      )}

      {/* Sat / Sun grid */}
      <View className="flex-row gap-2.5">
        {days.map((day) => {
          const dayPlans = plans.filter((p) =>
            isSameDay(p.date instanceof Date ? p.date : new Date(p.date), day),
          );
          const dateStr = format(day, 'yyyy-MM-dd');
          return (
            <Pressable
              key={dateStr}
              onPress={() => router.push(`/(app)/day/${dateStr}`)}
              className="flex-1 bg-card rounded-xl border border-border/30 p-2.5 gap-1.5 active:opacity-80"
            >
              {/* Day name */}
              <Text className="font-sans text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {format(day, 'EEE')}
              </Text>

              {/* Day number — Fraunces black (matches PWA font-display text-2xl font-black) */}
              <Text
                className="font-display leading-none"
                style={{
                  fontSize: 28,
                  color: isToday(day) ? '#23744D' : TC.icon,
                }}
              >
                {format(day, 'd')}
              </Text>

              {/* Plan pills */}
              {dayPlans.slice(0, 2).map((p) => (
                <View key={p.id} className="flex-row items-center gap-1.5">
                  <View
                    style={{
                      width: 8, height: 8, borderRadius: 2,
                      backgroundColor: activityAccent(p.activity as string | undefined),
                    }}
                  />
                  <Text
                    className="font-sans text-xs font-medium text-foreground flex-1"
                    numberOfLines={1}
                  >
                    {p.title || 'Plan'}
                  </Text>
                </View>
              ))}

              {/* "Add plan" — taps through to plan creation with date pre-set */}
              {dayPlans.length === 0 && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation?.();
                    router.push(`/(app)/new-plan?date=${dateStr}`);
                  }}
                  className="flex-row items-center gap-1 mt-0.5 active:opacity-60"
                  hitSlop={4}
                >
                  <Plus size={11} color="#929298" strokeWidth={2} />
                  <Text className="font-sans text-[11px] text-muted-foreground">Add plan</Text>
                </Pressable>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Single weekday row — DateDial + availability pill + plan items + "+" */
function WeekdayRow({
  day,
  dayPlans,
  availInfo,
  trip,
}: {
  day: Date;
  dayPlans: Plan[];
  availInfo: AvailInfo;
  trip?: any | null;
}) {
  const today = isToday(day);
  const dateStr = format(day, 'yyyy-MM-dd');

  return (
    <Pressable
      onPress={() => router.push(`/(app)/day/${dateStr}`)}
      className="bg-card rounded-2xl px-3 py-3 flex-row items-center gap-3 shadow-sm active:opacity-80"
      style={today ? { borderWidth: 2, borderColor: '#23744D' } : { borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}
    >
      {/* DateDial — availability ring around the day name/number (PWA parity) */}
      <DateDial
        {...getDayStatus(availInfo.count, availInfo.hasData)}
        dayName={format(day, 'EEE')}
        dayNum={format(day, 'd')}
        isToday={today}
        size={54}
      />

      {/* Center: availability pill + plan list */}
      <View className="flex-1 gap-1">
        {/* Pill + plan count */}
        <View className="flex-row items-center gap-2">
          <AvailPill {...availInfo} />
          {dayPlans.length > 0 && (
            <Text className="font-sans text-xs text-muted-foreground">
              · {dayPlans.length} plan{dayPlans.length > 1 ? 's' : ''}
            </Text>
          )}
        </View>

        {/* Trip badge for days the user is away */}
        {trip && (
          <View className="flex-row items-center gap-1.5">
            <Plane size={11} color="#23744D" strokeWidth={2} />
            <Text className="font-sans text-xs font-medium text-primary flex-1" numberOfLines={1}>
              {trip.location ? `In ${trip.location}` : 'Traveling'}
            </Text>
          </View>
        )}

        {/* Plan items */}
        {dayPlans.length > 0 ? (
          dayPlans.slice(0, 2).map((p) => (
            <View key={p.id} className="flex-row items-center gap-1.5">
              <View
                style={{
                  width: 8, height: 8, borderRadius: 4,
                  backgroundColor: activityAccent(p.activity as string | undefined),
                }}
              />
              <Text
                className="font-sans font-semibold text-foreground flex-1"
                style={{ fontSize: 13 }}
                numberOfLines={1}
              >
                {p.title || 'Untitled'}
              </Text>
              <Text className="font-sans text-[11px] text-muted-foreground tabular-nums">
                {SLOT_SHORT[p.timeSlot as string] ?? ''}
              </Text>
            </View>
          ))
        ) : !trip ? (
          <Text className="font-sans text-sm italic text-muted-foreground/60">Nothing yet</Text>
        ) : null}
      </View>

      {/* "+" button — dark circle (matches PWA inverted bg-foreground button) */}
      <Pressable
        onPress={(e) => {
          e.stopPropagation?.();
          router.push(`/(app)/new-plan?date=${dateStr}`);
        }}
        hitSlop={4}
        className="w-9 h-9 rounded-full items-center justify-center"
        style={{ backgroundColor: '#2F4F3F' }}
      >
        <Plus size={16} color="#FBF9F4" strokeWidth={2.2} />
      </Pressable>
    </Pressable>
  );
}

export interface TripPerson {
  name: string;
  avatar: string | null;
  home: string | null;
  isSelf: boolean;
}

/** Upcoming trips query — anything ending today or later.
 *  Each trip carries `people` — everyone on the trip (you, trip_participants,
 *  priority_friend_ids) with their home city, so the weekend hero can work
 *  out who is traveling and who is being visited. */
function useUpcomingTrips(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['trips', 'upcoming', userId],
    queryFn: async () => {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('trips')
        .select('id, name, location, start_date, end_date, priority_friend_ids')
        .eq('user_id', userId!)
        .gte('end_date', todayStr)
        .order('start_date', { ascending: true });
      if (error) throw error;

      const trips = (data ?? []) as any[];

      // Companions traveling with you on each trip
      const { data: participants } = trips.length
        ? await supabase
            .from('trip_participants')
            .select('trip_id, friend_user_id')
            .in('trip_id', trips.map((t) => t.id))
        : { data: [] as any[] };

      // One profile fetch for everyone involved (including yourself, so the
      // traveler/local split can use your home city too)
      const personIds = [
        ...new Set([
          userId!,
          ...((participants ?? []) as any[]).map((p) => p.friend_user_id),
          ...trips.flatMap((t) => t.priority_friend_ids ?? []),
        ]),
      ] as string[];

      const profileMap = new Map<string, TripPerson>();
      if (personIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name, first_name, last_name, avatar_url, home_address')
          .in('user_id', personIds);
        for (const p of (profiles ?? []) as any[]) {
          profileMap.set(p.user_id, {
            name: formatDisplayName({
              firstName: p.first_name,
              lastName: p.last_name,
              displayName: p.display_name,
            }),
            avatar: p.avatar_url,
            home: p.home_address ?? null,
            isSelf: p.user_id === userId,
          });
        }
      }

      for (const t of trips) {
        const ids = [
          userId!,
          ...((participants ?? []) as any[])
            .filter((p) => p.trip_id === t.id)
            .map((p) => p.friend_user_id),
          ...(t.priority_friend_ids ?? []),
        ];
        t.people = [...new Set(ids)]
          .map((id) => profileMap.get(id))
          .filter(Boolean);
      }

      // Sort: in-progress first, then upcoming by soonest start
      const now = Date.now();
      const sorted = trips.sort((a, b) => {
        const aStart = new Date(a.start_date).getTime();
        const aEnd   = new Date(a.end_date).getTime();
        const bStart = new Date(b.start_date).getTime();
        const bEnd   = new Date(b.end_date).getTime();
        const aLive  = aStart <= now && now <= aEnd;
        const bLive  = bStart <= now && now <= bEnd;
        if (aLive && !bLive) return -1;
        if (bLive && !aLive) return 1;
        return aStart - bStart;
      });
      return sorted;
    },
  });
}

/** Helper: does this trip cover any of the given days? */
function tripOverlapsDays(trip: any, days: Date[]): boolean {
  if (!trip?.start_date || !trip?.end_date) return false;
  const tripStart = new Date(trip.start_date).getTime();
  const tripEnd   = new Date(trip.end_date).getTime();
  return days.some((d) => {
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayEnd   = dayStart + 24 * 60 * 60 * 1000 - 1;
    return tripStart <= dayEnd && tripEnd >= dayStart;
  });
}

/** Countdown label for the next-trip card */
function tripCountdown(start: Date, end: Date): string {
  const now = new Date();
  if (start.getTime() <= now.getTime() && now.getTime() <= end.getTime()) {
    return 'Trip in progress';
  }
  const days = differenceInCalendarDays(start, now);
  if (days <= 0) return 'Trip in progress';
  if (days === 1) return 'Next trip tomorrow';
  if (days < 7) return `Next trip in ${days} days`;
  const weeks = Math.round(days / 7);
  return `Next trip in ${weeks} week${weeks > 1 ? 's' : ''}`;
}

/** Single next-trip card — replaces the old trips list */
function NextTripCard({ trip }: { trip: any }) {
  const start = new Date(trip.start_date);
  const end   = new Date(trip.end_date);
  const sameMonth = format(start, 'MMM') === format(end, 'MMM');
  const range = sameMonth
    ? `${format(start, 'MMM d')} – ${format(end, 'd')}`
    : `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`;
  const others: TripPerson[] = (trip.people ?? []).filter((p: TripPerson) => !p.isSelf);

  return (
    <Pressable
      onPress={() => router.push(`/(app)/trip/${trip.id}`)}
      className="bg-card rounded-2xl border border-border/30 overflow-hidden flex-row shadow-sm active:opacity-80"
    >
      <View style={{ width: 4, backgroundColor: PARADE_GREEN }} />
      <View className="flex-1 px-4 py-3 gap-1">
        {/* Countdown eyebrow */}
        <View className="flex-row items-center gap-1.5">
          <Plane size={12} color={PARADE_GREEN} strokeWidth={2} />
          <Text className="font-sans text-[11px] font-bold uppercase tracking-wider text-primary">
            {tripCountdown(start, end)}
          </Text>
        </View>

        <View className="flex-row items-center justify-between gap-2">
          <Text className="font-display text-base text-foreground flex-1" numberOfLines={1}>
            {trip.name || (trip.location ? `Trip to ${formatCityForDisplay(trip.location)}` : 'Untitled trip')}
          </Text>
          <ChevronRight size={14} color="#929298" strokeWidth={2} />
        </View>

        <View className="flex-row items-center gap-3">
          <Text className="font-sans text-xs text-muted-foreground">{range}</Text>
          {trip.location ? (
            <View className="flex-row items-center gap-1 flex-1">
              <MapPin size={11} color="#929298" strokeWidth={1.75} />
              <Text className="font-sans text-xs text-muted-foreground" numberOfLines={1}>
                {trip.location}
              </Text>
            </View>
          ) : null}
          {others.length > 0 && (
            <View className="flex-row" style={{ gap: -6 }}>
              {others.slice(0, 3).map((p, i) => (
                <Avatar
                  key={i}
                  url={p.avatar}
                  displayName={p.name}
                  size="xs"
                  className="border border-white"
                />
              ))}
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export default function PlansTab() {
  const { user } = useAuth();
  const setUserId    = usePlannerStore((s) => s.setUserId);
  const loadAllData  = usePlannerStore((s) => s.loadAllData);
  const plans        = usePlannerStore((s) => s.plans);
  const availability = usePlannerStore((s) => s.availability);
  const isLoading    = usePlannerStore((s) => s.isLoading);
  const { data: trips, refetch: refetchTrips } = useUpcomingTrips(user?.id);

  const [weekOffset, setWeekOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user?.id) {
      setUserId(user.id);
      loadAllData();
    }
  }, [user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadAllData(true), refetchTrips()]);
    setRefreshing(false);
  }, [loadAllData, refetchTrips]);

  // ── Derived date ranges ─────────────────────────────────────────────────────
  const today     = new Date();
  const weekStart = startOfWeek(addWeeks(today, weekOffset), { weekStartsOn: 1 });
  const weekEnd   = addDays(weekStart, 6);
  const days      = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekdays  = days.slice(0, 5);   // Mon–Fri
  const weekend   = [days[5], days[6]]; // Sat, Sun
  const label     = getWeekLabel(weekStart, weekEnd);

  // First upcoming free window in the displayed week → drives the CTA
  const nextFreeWindow = findNextFreeWindow(days, availability, plans);

  // Next trip card skips anything starting within the current week cycle
  // (Mon–Sun of the week in progress) — those already show in the hero and
  // weekday rows. Only trips starting after this Sunday qualify.
  const currentWeekEnd = format(
    addDays(startOfWeek(today, { weekStartsOn: 1 }), 6),
    'yyyy-MM-dd',
  );
  const nextTrip = (trips ?? []).find((t) => t.start_date > currentWeekEnd);

  // ── Upcoming plans (all future, sorted) ────────────────────────────────────
  const upcomingPlans = plans
    .filter((p) => {
      const d = p.date instanceof Date ? p.date : new Date(p.date);
      return d >= today;
    })
    .sort((a, b) => {
      const da = a.date instanceof Date ? a.date : new Date(a.date);
      const db = b.date instanceof Date ? b.date : new Date(b.date);
      return da.getTime() - db.getTime();
    });

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-10"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#23744D"
          />
        }
      >
        {/* ── Page header ─────────────────────────────────────────────── */}
        <View className="px-5 pt-4 pb-2">
          {/* "Plans & Trips" — font-display matches PWA font-display font-black */}
          <Text className="font-display text-2xl text-foreground">
            Plans &amp; Trips
          </Text>
        </View>

        {/* ── Week navigator ───────────────────────────────────────────── */}
        <View className="flex-row items-center px-4 py-1 gap-1">
          <Pressable
            onPress={() => setWeekOffset((w) => w - 1)}
            hitSlop={8}
            className="w-8 h-8 items-center justify-center rounded-lg active:opacity-60"
          >
            <ChevronLeft size={18} color="#929298" strokeWidth={2} />
          </Pressable>

          <Pressable
            onPress={() => setWeekOffset(0)}
            className="flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-1 active:opacity-70"
          >
            <CalendarDays size={15} color="#929298" strokeWidth={1.75} />
            {/* Fraunces for the date range — same size as the "Plans & Trips" header */}
            <Text className="font-display text-2xl text-foreground">{label}</Text>
          </Pressable>

          <Pressable
            onPress={() => setWeekOffset((w) => w + 1)}
            hitSlop={8}
            className="w-8 h-8 items-center justify-center rounded-lg active:opacity-60"
          >
            <ChevronRight size={18} color="#929298" strokeWidth={2} />
          </Pressable>
        </View>

        {/* "Back to this week" — only when offset !== 0 */}
        {weekOffset !== 0 && (
          <Pressable
            onPress={() => setWeekOffset(0)}
            className="flex-row items-center gap-1 px-5 pb-1 active:opacity-70"
          >
            <ArrowLeft size={12} color="#23744D" strokeWidth={2.5} />
            <Text className="font-sans text-xs font-bold text-primary">
              Back to this week
            </Text>
          </Pressable>
        )}

        <View className="gap-4 mt-2">
          {/* ── Weekend hero ──────────────────────────────────────────── */}
          <WeekendHeroCard
            days={weekend}
            plans={plans}
            trip={(trips ?? []).find((t) => tripOverlapsDays(t, weekend))}
          />

          {/* ── Weekdays section ──────────────────────────────────────── */}
          <View className="px-5 gap-2">
            {/* Section header — matches PWA ember dot + "Weekdays" label */}
            <View className="flex-row items-center px-1 mb-1">
              <View className="w-1.5 h-1.5 rounded-full bg-secondary mr-2" />
              <Text className="font-sans text-[11px] font-bold uppercase tracking-wider text-secondary">
                Weekdays
              </Text>
              <Text className="font-sans text-[11px] font-medium text-muted-foreground ml-auto">
                Mon – Fri
              </Text>
            </View>

            {weekdays.map((day) => {
              const dateStr  = format(day, 'yyyy-MM-dd');
              const dayPlans = plans.filter((p) =>
                isSameDay(p.date instanceof Date ? p.date : new Date(p.date), day),
              );
              const availInfo = getAvailInfo(day, availability);
              const dayTrip   = (trips ?? []).find((t) =>
                tripOverlapsDays(t, [day]),
              );

              return (
                <WeekdayRow
                  key={dateStr}
                  day={day}
                  trip={dayTrip}
                  dayPlans={dayPlans}
                  availInfo={availInfo}
                />
              );
            })}
          </View>

          {/* ── Availability CTA — not shown for past weeks ───────────── */}
          {!isLoading && format(weekEnd, 'yyyy-MM-dd') >= format(today, 'yyyy-MM-dd') && (
            <AvailabilityCTA nextFree={nextFreeWindow} />
          )}

          {/* ── Next trip ─────────────────────────────────────────────── */}
          <View className="px-5">
            {nextTrip ? (
              <NextTripCard trip={nextTrip} />
            ) : (
              <Pressable
                onPress={() => router.push('/(app)/new-trip')}
                className="bg-card rounded-2xl border border-dashed border-border/40 px-4 py-5 items-center gap-1 active:opacity-70"
              >
                <View className="flex-row items-center gap-1.5">
                  <Plus size={13} color="#23744D" strokeWidth={2.5} />
                  <Text className="font-sans text-sm font-semibold text-primary">
                    Plan a trip
                  </Text>
                </View>
                <Text className="font-sans text-xs text-muted-foreground/60">
                  Add one when you're traveling so friends know
                </Text>
              </Pressable>
            )}
          </View>

          {/* Empty state */}
          {!isLoading && upcomingPlans.length === 0 && (
            <View className="px-5">
              <View className="bg-card rounded-2xl border border-dashed border-border/40 px-4 py-8 items-center gap-2">
                <Text className="text-3xl">📅</Text>
                <Text className="font-sans text-sm text-muted-foreground">
                  No upcoming plans this week
                </Text>
                <Text className="font-sans text-xs text-muted-foreground/60">
                  Tap a day to get started
                </Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
