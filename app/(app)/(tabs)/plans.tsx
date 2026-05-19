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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useCallback, useState, useEffect } from 'react';
import {
  format,
  startOfWeek,
  addDays,
  addWeeks,
  isToday,
  isSameDay,
  isSameMonth,
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  ArrowLeft,
  Plus,
  Clock,
  MapPin,
  Plane,
} from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';
import { supabase } from '@/integrations/supabase/client';
import { TIME_SLOT_LABELS } from '@/types/planner';
import type { Plan, DayAvailability, TimeSlot } from '@/types/planner';

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

/** Activity → left-border accent color (matches PWA activity palette) */
const ACTIVITY_COLOR: Record<string, string> = {
  drinks: '#D46549', food: '#D46549', coffee: '#C47030', brunch: '#D46549',
  'happy-hour': '#D46549', hike: '#9CB094', run: '#9CB094', gym: '#9CB094',
  sports: '#9CB094', movie: '#7744BB', concert: '#6E9BC2', game: '#7744BB',
  travel: '#23744D', beach: '#23744D', park: '#23744D', meetup: '#23744D',
};
const DEFAULT_ACCENT = '#23744D';
function activityAccent(activity?: string): string {
  return ACTIVITY_COLOR[activity ?? ''] ?? DEFAULT_ACCENT;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekLabel(start: Date, end: Date): string {
  if (isSameMonth(start, end)) return `${format(start, 'MMM d')}–${format(end, 'd')}`;
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`;
}

function planDayLabel(date: Date): string {
  if (isToday(date)) return 'Today';
  return format(date, 'EEE, MMM d');
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
    label = 'Booked'; bg = 'rgba(212,101,73,0.12)'; textColor = '#D46549';
  } else if (count <= 2) {
    label = 'Some time'; bg = 'rgba(180,83,9,0.10)'; textColor = '#92400E';
  } else if (count <= 4) {
    label = 'Mostly open'; bg = 'rgba(35,116,77,0.10)'; textColor = '#23744D';
  } else {
    label = 'Open'; bg = 'rgba(35,116,77,0.20)'; textColor = '#1A5C3A';
  }

  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: textColor }}>
        {label}
      </Text>
    </View>
  );
}

/** Weekend hero — white card with Fraunces day numbers + plan pills,
 *  with an inline trip banner when a trip overlaps Sat/Sun. */
function WeekendHeroCard({
  days,
  plans,
  trip,
}: {
  days: Date[];
  plans: Plan[];
  trip?: any | null;
}) {
  return (
    <View
      className="bg-white rounded-2xl border border-primary/20 p-4 gap-3 mx-5 shadow-sm"
    >
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
              className="flex-1 bg-chalk rounded-xl p-2.5 gap-1.5 active:opacity-80"
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
                  color: isToday(day) ? '#23744D' : '#2F4F3F',
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
      className="bg-white rounded-2xl px-3 py-3 flex-row items-center gap-3 shadow-sm active:opacity-80"
      style={today ? { borderWidth: 2, borderColor: '#23744D' } : { borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}
    >
      {/* DateDial — matches PWA font-display day name + number */}
      <View className="w-11 items-center gap-0">
        <Text
          style={{ fontFamily: 'Fraunces_900Black', fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', color: today ? '#23744D' : '#929298' }}
        >
          {format(day, 'EEE')}
        </Text>
        <Text
          style={{ fontFamily: 'Fraunces_900Black', fontSize: 22, lineHeight: 26, color: today ? '#23744D' : '#2F4F3F' }}
        >
          {format(day, 'd')}
        </Text>
      </View>

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
        <Plus size={16} color="#F8F0E0" strokeWidth={2.2} />
      </Pressable>
    </Pressable>
  );
}

/** Upcoming trips query — anything ending today or later */
function useUpcomingTrips(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['trips', 'upcoming', userId],
    queryFn: async () => {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('trips')
        .select('id, name, location, start_date, end_date')
        .eq('user_id', userId!)
        .gte('end_date', todayStr)
        .order('start_date', { ascending: true });
      if (error) throw error;

      // Sort: in-progress first, then upcoming by soonest start
      const now = Date.now();
      const sorted = ((data ?? []) as any[]).sort((a, b) => {
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

/** Trip card row */
function TripCard({ trip }: { trip: any }) {
  const start = new Date(trip.start_date);
  const end   = new Date(trip.end_date);
  const sameMonth = format(start, 'MMM') === format(end, 'MMM');
  const range = sameMonth
    ? `${format(start, 'MMM d')} – ${format(end, 'd')}`
    : `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`;
  const inProgress =
    start.getTime() <= Date.now() && Date.now() <= end.getTime();

  return (
    <Pressable
      onPress={() => router.push(`/(app)/trip/${trip.id}`)}
      className="bg-white rounded-2xl border border-border/30 overflow-hidden flex-row shadow-sm active:opacity-80"
    >
      <View style={{ width: 4, backgroundColor: '#23744D' }} />
      <View className="flex-1 px-4 py-3 gap-0.5">
        <View className="flex-row items-start justify-between gap-2">
          <View className="flex-row items-center gap-1.5 flex-1">
            <Plane size={12} color="#23744D" strokeWidth={2} />
            <Text
              className="font-display text-sm text-foreground flex-1"
              numberOfLines={1}
            >
              {trip.name || 'Untitled trip'}
            </Text>
          </View>
          <Text className="font-sans text-xs text-muted-foreground">{range}</Text>
        </View>
        {trip.location && (
          <View className="flex-row items-center gap-1 mt-0.5">
            <MapPin size={11} color="#929298" strokeWidth={1.75} />
            <Text
              className="font-sans text-xs text-muted-foreground"
              numberOfLines={1}
            >
              {trip.location}
            </Text>
          </View>
        )}
        {inProgress && (
          <View className="bg-primary/15 rounded-full px-2 py-0.5 self-start mt-1">
            <Text className="font-sans text-[10px] font-semibold text-primary uppercase tracking-wider">
              In progress
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

/** Plan card for "All Upcoming" section — left-border accent strip */
function UpcomingPlanCard({ plan }: { plan: Plan }) {
  const planDate = plan.date instanceof Date ? plan.date : new Date(plan.date);
  const accentColor = activityAccent(plan.activity as string | undefined);
  const slotLabel = TIME_SLOT_LABELS[plan.timeSlot as TimeSlot]?.time ?? '';
  const locationStr =
    typeof plan.location === 'string'
      ? plan.location
      : (plan.location as any)?.name ?? '';

  return (
    <Pressable
      onPress={() => router.push(`/(app)/plan/${plan.id}`)}
      className="bg-white rounded-2xl border border-border/30 overflow-hidden flex-row shadow-sm active:opacity-80"
    >
      {/* Left accent bar */}
      <View style={{ width: 4, backgroundColor: accentColor }} />

      {/* Content */}
      <View className="flex-1 px-4 py-3 gap-1">
        <View className="flex-row items-start justify-between gap-2">
          <Text
            className="font-display text-sm text-evergreen flex-1"
            numberOfLines={1}
          >
            {plan.title || 'Untitled plan'}
          </Text>
          <Text className="font-sans text-xs text-muted-foreground">
            {planDayLabel(planDate)}
          </Text>
        </View>

        {(slotLabel || locationStr) ? (
          <View className="flex-row items-center gap-3">
            {slotLabel ? (
              <View className="flex-row items-center gap-1">
                <Clock size={11} color="#929298" strokeWidth={1.75} />
                <Text className="font-sans text-xs text-muted-foreground">{slotLabel}</Text>
              </View>
            ) : null}
            {locationStr ? (
              <View className="flex-row items-center gap-1 flex-1">
                <MapPin size={11} color="#929298" strokeWidth={1.75} />
                <Text className="font-sans text-xs text-muted-foreground" numberOfLines={1}>
                  {locationStr}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
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
            {/* Fraunces for the date range — matches PWA font-display font-bold */}
            <Text className="font-display text-base text-foreground">{label}</Text>
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

          {/* ── All upcoming plans ────────────────────────────────────── */}
          {!isLoading && upcomingPlans.length > 0 && (
            <View className="px-5 gap-2">
              <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-1">
                All Upcoming
              </Text>
              {upcomingPlans.map((plan) => (
                <UpcomingPlanCard key={plan.id} plan={plan} />
              ))}
            </View>
          )}

          {/* ── Trips section ─────────────────────────────────────────── */}
          <View className="px-5 gap-2">
            <View className="flex-row items-center justify-between px-1">
              <View className="flex-row items-center gap-1.5">
                <Plane size={12} color="#23744D" strokeWidth={2} />
                <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Trips
                </Text>
              </View>
              <Pressable
                onPress={() => router.push('/(app)/new-trip')}
                hitSlop={6}
                className="flex-row items-center gap-1 active:opacity-60"
              >
                <Plus size={12} color="#23744D" strokeWidth={2.5} />
                <Text className="font-sans text-xs font-semibold text-primary">
                  New trip
                </Text>
              </Pressable>
            </View>

            {(trips ?? []).length > 0 ? (
              (trips ?? []).map((trip) => <TripCard key={trip.id} trip={trip} />)
            ) : (
              <View className="bg-white rounded-2xl border border-dashed border-border/40 px-4 py-5 items-center gap-1">
                <Text className="font-sans text-sm text-muted-foreground">
                  No upcoming trips
                </Text>
                <Text className="font-sans text-xs text-muted-foreground/60">
                  Add one when you're traveling so friends know
                </Text>
              </View>
            )}
          </View>

          {/* Empty state */}
          {!isLoading && upcomingPlans.length === 0 && (
            <View className="px-5">
              <View className="bg-white rounded-2xl border border-dashed border-border/40 px-4 py-8 items-center gap-2">
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
