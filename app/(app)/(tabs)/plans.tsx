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
  differenceInCalendarWeeks,
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CalendarDays,
  ArrowLeft,
  Plus,
  MapPin,
  Plane,
  Zap,
  Users,
  Share2,
  Sparkles,
} from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useFloatingTabBarHeight } from '@/components/navigation/FloatingTabBar';
import { useFriendDashboardData } from '@/hooks/useFriendDashboardData';
import { usePlannerStore } from '@/stores/plannerStore';
import { supabase } from '@/integrations/supabase/client';
import { TIME_SLOT_LABELS } from '@/types/planner';
import type { Plan, DayAvailability, TimeSlot } from '@/types/planner';
import { activityAccent } from '@/lib/activityColors';
import { TC } from '@/lib/theme';
import { TINT, PARADE_GREEN, MARIGOLD } from '@/lib/colors';
import { computeRecommendedWindows, type RecommendedWindow } from '@/lib/recommendedWindows';
import {
  DateDial,
  computeDayWheel,
  planBlocksAvailability,
  type DayWheel,
} from '@/components/plans/DateDial';
import { useAvailabilityStore } from '@/stores/availabilityStore';
import { WeekPickerModal } from '@/components/plans/WeekPickerModal';
import { Avatar } from '@/components/primitives/Avatar';
import { formatDisplayName } from '@/lib/utils';
import { citiesMatch, normalizeCity } from '@/lib/locationMatch';
import { resolveEffectiveCity } from '@/lib/effectiveCity';
import { formatCityForDisplay } from '@/lib/formatCity';
import { reconcileStaleBusyDays } from '@/lib/availabilityReconcile';

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

/** Recommended windows shown in the horizontal CTA strip on the Plans tab. */
const MAX_RECOMMENDED_CTA = 8;

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

/** Chronological slot order for sorting a day's plans morning → late night */
const SLOT_RANK: Record<string, number> = {
  'early-morning': 0, 'late-morning': 1, 'early-afternoon': 2,
  'late-afternoon': 3, 'evening': 4, 'late-night': 5,
};

function sortPlansChronologically(dayPlans: Plan[]): Plan[] {
  return [...dayPlans].sort((a, b) => {
    const ra = SLOT_RANK[a.timeSlot as string] ?? 99;
    const rb = SLOT_RANK[b.timeSlot as string] ?? 99;
    if (ra !== rb) return ra - rb;
    return (a.startTime ?? '').localeCompare(b.startTime ?? '');
  });
}

/** Recommended free-window slots in the CTA style — replaces the single
 *  "You're free…" CTA with the same ranked windows the Home dashboard
 *  surfaced, as a horizontal strip of compact cards. Falls back to the
 *  "Booked up" find-time CTA when nothing is open this week. */
function RecommendedCTA({ windows }: { windows: RecommendedWindow[] }) {
  // No open social windows this week — point at find-time instead
  if (windows.length === 0) {
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

  return (
    <View className="gap-2">
      {/* Section eyebrow — matches the dashboard "Recommended" header */}
      <View className="flex-row items-center gap-1.5 px-5">
        <Sparkles size={12} color={PARADE_GREEN} strokeWidth={2} />
        <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Recommended
        </Text>
      </View>

      {/* Horizontal strip of compact CTA cards */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2.5 px-5 pb-1"
      >
        {windows.map((w) => {
          const slotMeta = TIME_SLOT_LABELS[w.slot];
          const overlap = w.overlappingFriendIds.length;
          return (
            <Pressable
              key={`${w.dateStr}-${w.slot}`}
              onPress={() => router.push(`/(app)/quick-plan?date=${w.dateStr}&slot=${w.slot}`)}
              className="rounded-2xl px-3.5 py-3 gap-2 active:opacity-80"
              style={{ width: 176, backgroundColor: TINT.primarySubtle, borderWidth: 1, borderColor: TINT.primaryBorder }}
            >
              {/* Icon + day eyebrow */}
              <View className="flex-row items-center gap-2">
                <View
                  className="w-7 h-7 rounded-full items-center justify-center"
                  style={{ backgroundColor: PARADE_GREEN }}
                >
                  <Zap size={13} color="#FFFFFF" strokeWidth={2.25} />
                </View>
                <Text
                  className="font-sans text-[11px] uppercase tracking-wide text-muted-foreground"
                  numberOfLines={1}
                >
                  {casualDayLabel(w.date)}
                </Text>
              </View>

              {/* Slot headline + meta */}
              <View>
                <Text
                  className="font-display text-[15px]"
                  style={{ color: PARADE_GREEN }}
                  numberOfLines={1}
                >
                  {slotMeta.label}
                </Text>
                <Text
                  className="font-sans text-[11px] text-muted-foreground mt-0.5"
                  numberOfLines={1}
                >
                  {overlap > 0 ? `${slotMeta.time} · ${overlap} free` : slotMeta.time}
                </Text>
              </View>

              {/* Quick plan chip */}
              <View className="bg-primary rounded-full px-2.5 py-1 self-start">
                <Text className="font-sans text-[11px] font-semibold text-white">Quick plan</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** "Ben" / "Ben & Jules" / "Ben, Jules & Erin" from first names */
function nameList(names: string[]): string {
  const firsts = names.map((n) => n.split(' ')[0]).filter(Boolean);
  if (firsts.length === 0) return '';
  if (firsts.length === 1) return firsts[0];
  return `${firsts.slice(0, -1).join(', ')} & ${firsts[firsts.length - 1]}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Availability summary pill — driven by the standardized day wheel */
function WheelPill({ wheel }: { wheel: DayWheel }) {
  return (
    <View style={{ backgroundColor: wheel.pill.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: wheel.pill.text }}>
        {wheel.label}
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
          const dayPlans = sortPlansChronologically(
            plans.filter((p) =>
              isSameDay(p.date instanceof Date ? p.date : new Date(p.date), day),
            ),
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

              {/* "Add plan" — quick-plan with date pre-set, picker filtered
                  to friends free that day */}
              {dayPlans.length === 0 && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation?.();
                    router.push(`/(app)/quick-plan?date=${dateStr}`);
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

/** Today card — today's plans in detail + friends free to hang today */
function TodayCard({
  todayPlans,
  friendsFreeCount,
}: {
  todayPlans: Plan[];
  friendsFreeCount: number;
}) {
  const todayDate = new Date();
  const dateStr = format(todayDate, 'yyyy-MM-dd');

  return (
    <Pressable
      onPress={() => router.push(`/(app)/day/${dateStr}`)}
      className="mx-5 bg-card rounded-2xl border border-border/30 shadow-sm px-4 py-3.5 gap-2.5 active:opacity-90"
    >
      {/* Header */}
      <View className="flex-row items-center gap-2">
        <View className="w-1.5 h-1.5 rounded-full bg-primary" />
        <Text className="font-sans text-[11px] font-bold uppercase tracking-wider text-primary">
          Today
        </Text>
        <Text className="font-sans text-[11px] text-muted-foreground">
          {format(todayDate, 'EEEE, MMM d')}
        </Text>
        <ChevronRight size={12} color="#929298" strokeWidth={2} style={{ marginLeft: 'auto' }} />
      </View>

      {/* Today's plans, with details */}
      {todayPlans.length > 0 ? (
        <View className="gap-2">
          {todayPlans.map((p) => {
            const slotMeta = TIME_SLOT_LABELS[p.timeSlot as TimeSlot];
            const locationStr =
              typeof p.location === 'string' ? p.location : (p.location as any)?.name ?? '';
            return (
              <Pressable
                key={p.id}
                onPress={() => router.push(`/(app)/plan/${p.id}`)}
                className="flex-row items-center gap-2.5 active:opacity-70"
              >
                <View
                  style={{
                    width: 8, height: 8, borderRadius: 4,
                    backgroundColor: activityAccent(p.activity as string | undefined),
                  }}
                />
                <View className="flex-1">
                  <Text className="font-sans text-sm font-semibold text-foreground" numberOfLines={1}>
                    {p.title || 'Untitled plan'}
                  </Text>
                  <Text className="font-sans text-[11px] text-muted-foreground" numberOfLines={1}>
                    {slotMeta ? `${slotMeta.label} · ${slotMeta.time}` : ''}
                    {locationStr ? `${slotMeta ? ' · ' : ''}${locationStr}` : ''}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text className="font-sans text-sm italic text-muted-foreground/60">
          Nothing planned today
        </Text>
      )}

      {/* Friends free today */}
      <Pressable
        onPress={() => router.push('/(app)/find-time')}
        className="flex-row items-center gap-2 rounded-xl px-3 py-2.5 active:opacity-70"
        style={{ backgroundColor: TINT.primaryFaint }}
      >
        <Users size={14} color={PARADE_GREEN} strokeWidth={2} />
        <Text className="font-sans text-xs font-semibold flex-1" style={{ color: PARADE_GREEN }}>
          {friendsFreeCount > 0
            ? `${friendsFreeCount} friend${friendsFreeCount > 1 ? 's' : ''} free to hang today`
            : 'No friends free today yet'}
        </Text>
        <ChevronRight size={13} color={PARADE_GREEN} strokeWidth={2} />
      </Pressable>
    </Pressable>
  );
}

/** Week-at-a-glance — 7 mini availability dials, taps through to each day */
function WeekSummaryCard({
  dayInfos,
}: {
  dayInfos: Array<{ day: Date; dateStr: string; wheel: DayWheel }>;
}) {
  const openCount = dayInfos.filter((d) => d.wheel.status === 'open').length;
  const someCount = dayInfos.filter((d) => d.wheel.status === 'some').length;
  const offCount  = dayInfos.filter((d) => d.wheel.status === 'unavailable').length;

  const parts: string[] = [];
  if (openCount) parts.push(`${openCount} open`);
  if (someCount) parts.push(`${someCount} some time`);
  if (offCount)  parts.push(`${offCount} off`);

  return (
    <View className="mx-5 bg-card rounded-2xl border border-border/30 shadow-sm px-4 py-3 gap-2.5">
      <View className="flex-row items-center justify-between">
        <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Week at a glance
        </Text>
        <Text className="font-sans text-[11px] text-muted-foreground">
          {parts.join(' · ')}
        </Text>
      </View>

      <View className="flex-row justify-between">
        {dayInfos.map(({ day, dateStr, wheel }) => (
          <Pressable
            key={dateStr}
            onPress={() => router.push(`/(app)/day/${dateStr}`)}
            className="items-center gap-1 active:opacity-60"
          >
            <Text
              className="font-sans text-[9px] font-semibold uppercase tracking-wide"
              style={{ color: isToday(day) ? PARADE_GREEN : '#929298' }}
            >
              {format(day, 'EEEEE')}
            </Text>
            <DateDial
              status={wheel.status}
              fill={wheel.fill}
              arcColor={wheel.arcColor}
              dayName=""
              dayNum={format(day, 'd')}
              isToday={isToday(day)}
              size={34}
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Single weekday row — DateDial + availability pill + plan items + "+" */
function WeekdayRow({
  day,
  dayPlans,
  wheel,
  trip,
}: {
  day: Date;
  dayPlans: Plan[];
  wheel: DayWheel;
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
      {/* DateDial — standardized wheel: green full = all social slots open,
          yellow arc = portion taken, dotted gray = not available / booked */}
      <DateDial
        status={wheel.status}
        fill={wheel.fill}
        arcColor={wheel.arcColor}
        dayName={format(day, 'EEE')}
        dayNum={format(day, 'd')}
        isToday={today}
        size={54}
      />

      {/* Center: availability pill + plan list */}
      <View className="flex-1 gap-1">
        {/* Pill + plan count */}
        <View className="flex-row items-center gap-2">
          <WheelPill wheel={wheel} />
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

      {/* "+" button — dark circle (matches PWA inverted bg-foreground button).
          Routes to quick-plan with date pre-set, picker filtered to friends
          free that day */}
      <Pressable
        onPress={(e) => {
          e.stopPropagation?.();
          router.push(`/(app)/quick-plan?date=${dateStr}`);
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
function NextTripCard({ trip, eyebrow }: { trip: any; eyebrow: string }) {
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
            {eyebrow}
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
  const tabBarHeight = useFloatingTabBarHeight();
  const { user } = useAuth();
  const setUserId    = usePlannerStore((s) => s.setUserId);
  const loadAllData  = usePlannerStore((s) => s.loadAllData);
  const plans           = usePlannerStore((s) => s.plans);
  const availability    = usePlannerStore((s) => s.availability);
  const isLoading       = usePlannerStore((s) => s.isLoading);
  const defaultSettings = useAvailabilityStore((s) => s.defaultSettings);
  const homeAddress     = useAvailabilityStore((s) => s.homeAddress);
  const { data: trips, refetch: refetchTrips } = useUpcomingTrips(user?.id);

  const [weekOffset, setWeekOffset] = useState(0);
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const [weekdaysOpen, setWeekdaysOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { data: friendData } = useFriendDashboardData();

  useEffect(() => {
    if (user?.id) {
      setUserId(user.id);
      loadAllData();
      // One-time baseline reset: release stale all-busy days left behind by
      // old trip-deletion bugs (no trip / plan / calendar event explains them)
      reconcileStaleBusyDays(user.id)
        .then(({ released }) => {
          if (released > 0) loadAllData(true);
        })
        .catch(() => {});
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
  const weekend   = [days[5], days[6]]; // Sat, Sun
  const label     = getWeekLabel(weekStart, weekEnd);

  // Recommended open social windows for the displayed week (today-or-future
  // days only), ranked by friend overlap → drives the Recommended CTA.
  // Fully-past weeks have no upcoming windows by definition — hide the CTA.
  const weekIsPast = format(weekEnd, 'yyyy-MM-dd') < format(today, 'yyyy-MM-dd');
  const recommendedTodayStr = format(today, 'yyyy-MM-dd');
  const recommendedWindows = weekIsPast
    ? []
    : computeRecommendedWindows(
        days.filter((d) => format(d, 'yyyy-MM-dd') >= recommendedTodayStr),
        availability,
        friendData,
        MAX_RECOMMENDED_CTA,
      );

  // ── Week-relative trip lookahead ────────────────────────────────────────────
  // The next-trip card is relative to the *selected* week: trips inside the
  // selected week already show in the hero/weekday rows, so the card surfaces
  // the first trip starting after that week's Sunday, plus a count of trips
  // sitting between today and the selected week.
  const todayStr        = format(today, 'yyyy-MM-dd');
  const selWeekStartStr = format(weekStart, 'yyyy-MM-dd');
  const selWeekEndStr   = format(weekEnd, 'yyyy-MM-dd');

  const tripsBetween = (trips ?? []).filter(
    (t) => t.start_date > todayStr && t.start_date < selWeekStartStr,
  );
  const nextTrip = (trips ?? []).find((t) => t.start_date > selWeekEndStr);

  const nextTripEyebrow = nextTrip
    ? weekOffset === 0
      ? tripCountdown(new Date(nextTrip.start_date), new Date(nextTrip.end_date))
      : (() => {
          const weeksAfter = differenceInCalendarWeeks(
            new Date(nextTrip.start_date),
            weekStart,
            { weekStartsOn: 1 },
          );
          return weeksAfter <= 1
            ? 'Trip the week after this'
            : `Trip ${weeksAfter} weeks after this week`;
        })()
    : '';

  // ── Per-day wheel info for the displayed week (summary + weekday rows) ─────
  const dayInfos = days.map((day) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const dayPlans = sortPlansChronologically(
      plans.filter((p) =>
        isSameDay(p.date instanceof Date ? p.date : new Date(p.date), day),
      ),
    );
    const dayTrip = (trips ?? []).find((t) => tripOverlapsDays(t, [day]));
    const dayAvail = availability.find((a) => format(a.date, 'yyyy-MM-dd') === dateStr);
    // Am I away from my home city this day? A covering trip wins, else the
    // availability row's away→trip_location, else home.
    const homeCity = homeAddress ? normalizeCity(homeAddress) : '';
    const dayCity = dayTrip?.location
      ? normalizeCity(dayTrip.location)
      : resolveEffectiveCity({
          date: dateStr,
          availability: dayAvail
            ? { date: dateStr, location_status: dayAvail.locationStatus, trip_location: dayAvail.tripLocation }
            : null,
          homeAddress,
        });
    const away = !!homeCity && !!dayCity && !citiesMatch(dayCity, homeCity);
    const wheel = computeDayWheel({
      date: day,
      dayAvail,
      settings: defaultSettings,
      // Only plans that actually take a slot count against the wheel
      dayPlans: dayPlans
        .filter(planBlocksAvailability)
        .map((p) => ({ timeSlot: p.timeSlot as string, startTime: p.startTime, endTime: p.endTime })),
      away,
    });
    return { day, dateStr, dayPlans, dayTrip, wheel };
  });
  const weekdayInfos = dayInfos.slice(0, 5); // Mon–Fri

  // ── Today section data ──────────────────────────────────────────────────────
  const todayPlans = sortPlansChronologically(
    plans.filter((p) =>
      isSameDay(p.date instanceof Date ? p.date : new Date(p.date), today),
    ),
  );
  const friendsFreeToday = (friendData ?? []).filter((f) =>
    f.overlapSlots.some((o) => o.date === todayStr),
  ).length;

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
        contentContainerStyle={{ paddingBottom: tabBarHeight }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#23744D"
          />
        }
      >
        {/* ── Page header ─────────────────────────────────────────────── */}
        <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
          {/* "Plans & Trips" — font-display matches PWA font-display font-black */}
          <Text className="font-display text-2xl text-foreground">
            Plans &amp; Trips
          </Text>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => router.push('/(app)/trips')}
              hitSlop={8}
              className="flex-row items-center gap-1 rounded-full bg-card border border-border/30 px-3 h-9 active:opacity-70"
            >
              <Plane size={14} color={PARADE_GREEN} strokeWidth={2} />
              <Text className="font-sans text-[13px] font-semibold text-primary">Trips</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/(app)/share-availability')}
              hitSlop={8}
              className="w-9 h-9 rounded-full items-center justify-center bg-card border border-border/30 active:opacity-70"
            >
              <Share2 size={16} color={PARADE_GREEN} strokeWidth={2} />
            </Pressable>
          </View>
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
            onPress={() => setWeekPickerOpen(true)}
            className="flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-1 active:opacity-70"
          >
            <CalendarDays size={15} color="#929298" strokeWidth={1.75} />
            {/* Fraunces for the date range — slightly under the page title size */}
            <Text className="font-display text-xl text-foreground">{label}</Text>
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

          {/* ── Today ─────────────────────────────────────────────────── */}
          <TodayCard todayPlans={todayPlans} friendsFreeCount={friendsFreeToday} />

          {/* ── Week at a glance ──────────────────────────────────────── */}
          <WeekSummaryCard dayInfos={dayInfos} />

          {/* ── Weekdays section (collapsible, default collapsed) ──────── */}
          <View className="px-5 gap-2">
            <Pressable
              onPress={() => setWeekdaysOpen((v) => !v)}
              className="flex-row items-center px-1 mb-1 active:opacity-70"
            >
              <View className="w-1.5 h-1.5 rounded-full bg-secondary mr-2" />
              <Text className="font-sans text-[11px] font-bold uppercase tracking-wider text-secondary">
                Weekdays
              </Text>
              <View className="flex-row items-center gap-1 ml-auto">
                <Text className="font-sans text-[11px] font-medium text-muted-foreground">
                  Mon – Fri
                </Text>
                {weekdaysOpen ? (
                  <ChevronDown size={14} color="#929298" strokeWidth={2} />
                ) : (
                  <ChevronRight size={14} color="#929298" strokeWidth={2} />
                )}
              </View>
            </Pressable>

            {weekdaysOpen &&
              weekdayInfos.map(({ day, dateStr, dayPlans, dayTrip, wheel }) => (
                <WeekdayRow
                  key={dateStr}
                  day={day}
                  trip={dayTrip}
                  dayPlans={dayPlans}
                  wheel={wheel}
                />
              ))}
          </View>

          {/* ── Recommended CTA — not shown for past weeks ────────────── */}
          {!isLoading && !weekIsPast && <RecommendedCTA windows={recommendedWindows} />}

          {/* ── Next trip (relative to the selected week) ─────────────── */}
          <View className="px-5 gap-2">
            {/* Trips sitting between today and the selected week */}
            {weekOffset > 0 && tripsBetween.length > 0 && (
              <View className="flex-row items-center gap-1.5 px-1">
                <Plane size={11} color="#929298" strokeWidth={1.75} />
                <Text className="font-sans text-xs text-muted-foreground">
                  {tripsBetween.length} trip{tripsBetween.length > 1 ? 's' : ''} planned
                  between today and {format(weekStart, 'MMM d')}
                </Text>
              </View>
            )}

            {nextTrip ? (
              <NextTripCard trip={nextTrip} eyebrow={nextTripEyebrow} />
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

      {/* Week picker — jump to any week from a month calendar */}
      <WeekPickerModal
        visible={weekPickerOpen}
        onClose={() => setWeekPickerOpen(false)}
        selectedWeekStart={weekStart}
        onSelectWeek={(ws) => {
          setWeekOffset(
            differenceInCalendarWeeks(ws, startOfWeek(new Date(), { weekStartsOn: 1 }), {
              weekStartsOn: 1,
            }),
          );
          setWeekPickerOpen(false);
        }}
      />
    </SafeAreaView>
  );
}
