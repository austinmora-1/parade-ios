/**
 * Day detail — interactive day planner (PWA DayDetail parity).
 *
 * Sections:
 *  1. Header with prev/next day navigation
 *  2. Summary card: DateDial availability ring + 6-segment slot coverage bar
 *  3. Location: Home/Away toggle + trip location editing (away days)
 *  4. Time slots: per-slot free/busy toggle, plans inline under their slot,
 *     and a "Quick plan" fast-path on free empty slots
 *  5. Create-plan CTA
 */
import {
  ScrollView,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import {
  MapPin,
  Check,
  Plus,
  Zap,
  Home,
  Plane,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock,
  Briefcase,
} from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, isToday, addDays } from 'date-fns';
import { useState, useCallback, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePlannerStore } from '@/stores/plannerStore';
import type { TimeSlot, LocationStatus, DayAvailability } from '@/types/planner';
import { activityAccent } from '@/lib/activityColors';
import { getPlanSlotCoverage } from '@/lib/planSlotCoverage';
import { getCalendarBusyTitlesForDate } from '@/lib/calendarSync';
import { createDefaultAvailability } from '@/stores/helpers/mapAvailability';
import { formatCityForDisplay } from '@/lib/formatCity';
import { ScreenHeader } from '@/components/primitives/ScreenHeader';
import { LocationAutocomplete } from '@/components/primitives/LocationAutocomplete';
import { DateDial, computeDayWheel } from '@/components/plans/DateDial';
import { useAvailabilityStore } from '@/stores/availabilityStore';
import { TINT, PARADE_GREEN, EMBER, ELEPHANT, tint } from '@/lib/colors';

// ─── Constants ────────────────────────────────────────────────────────────────

interface SlotDef {
  col: string;      // DB availability column (underscore_case)
  slot: TimeSlot;   // kebab-case TimeSlot (plans.time_slot, store API)
  label: string;
  time: string;
}

const SLOTS: SlotDef[] = [
  { col: 'early_morning',   slot: 'early-morning',   label: 'Early morning',  time: '7–9am' },
  { col: 'late_morning',    slot: 'late-morning',    label: 'Late morning',   time: '9am–12pm' },
  { col: 'early_afternoon', slot: 'early-afternoon', label: 'Afternoon',      time: '12–3pm' },
  { col: 'late_afternoon',  slot: 'late-afternoon',  label: 'Late afternoon', time: '3–6pm' },
  { col: 'evening',         slot: 'evening',         label: 'Evening',        time: '6–10pm' },
  { col: 'late_night',      slot: 'late-night',      label: 'Late night',     time: '10pm–2am' },
];

/** Treat truthy values (true OR legacy 'free' string) as free */
function isFree(v: unknown): boolean {
  return v === true || v === 'free';
}

/** Normalize a plan's time_slot (DB may hold kebab or legacy underscore) */
function normalizeSlot(raw: string | null | undefined): string {
  return (raw ?? '').replace(/_/g, '-');
}

// ─── Data ─────────────────────────────────────────────────────────────────────

function useDayData(userId: string | undefined, date: string) {
  return useQuery({
    enabled: !!userId,
    queryKey: ['day', userId, date],
    queryFn: async () => {
      const [{ data: avail }, { data: ownPlans }, { data: partRows }, { data: trips }] = await Promise.all([
        supabase
          .from('availability')
          .select('*')
          .eq('user_id', userId!)
          .eq('date', date)
          .maybeSingle(),
        supabase
          .from('plans')
          .select('id, title, time_slot, start_time, end_time, location, activity')
          .eq('user_id', userId!)
          .eq('date', date),
        supabase
          .from('plan_participants')
          .select('plan_id')
          .eq('friend_id', userId!),
        supabase
          .from('trips')
          .select('id, name, location')
          .eq('user_id', userId!)
          .lte('start_date', date)
          .gte('end_date', date),
      ]);

      // Plans the user joined (invited/imported) on this day, beyond their own
      let plans = ownPlans ?? [];
      const ownIds = new Set(plans.map((p: any) => p.id));
      const joinedIds = (partRows ?? [])
        .map((r: any) => r.plan_id)
        .filter((id: string) => !ownIds.has(id));
      if (joinedIds.length > 0) {
        const { data: joined } = await supabase
          .from('plans')
          .select('id, title, time_slot, start_time, end_time, location, activity')
          .in('id', joinedIds)
          .eq('date', date);
        plans = [...plans, ...(joined ?? [])];
      }

      return { avail, plans, trip: (trips ?? [])[0] ?? null };
    },
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Small gray chip explaining why a busy slot is blocked */
function BusySourceChip({
  icon: Icon,
  label,
}: {
  icon: typeof CalendarDays;
  label: string;
}) {
  return (
    <View
      className="flex-row items-center gap-1 rounded-full px-2 py-1"
      style={{ backgroundColor: TINT.grayFaint, maxWidth: 150 }}
    >
      <Icon size={10} color={ELEPHANT} strokeWidth={2} />
      <Text
        className="font-sans text-[10px] font-medium text-muted-foreground"
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

/** Compact plan row rendered inline under its time slot */
function SlotPlanRow({ plan }: { plan: any }) {
  return (
    <Pressable
      onPress={() => router.push(`/(app)/plan/${plan.id}`)}
      className="bg-card rounded-xl border border-border/30 overflow-hidden flex-row shadow-sm active:opacity-80"
    >
      <View style={{ width: 4, backgroundColor: activityAccent(plan.activity) }} />
      <View className="flex-1 px-3 py-2.5 flex-row items-center gap-2">
        <View className="flex-1 gap-0.5">
          <Text className="font-sans text-sm font-semibold text-foreground" numberOfLines={1}>
            {plan.title || 'Untitled plan'}
          </Text>
          {plan.location ? (
            <View className="flex-row items-center gap-1">
              <MapPin size={10} color={ELEPHANT} strokeWidth={1.75} />
              <Text className="font-sans text-[11px] text-muted-foreground" numberOfLines={1}>
                {plan.location}
              </Text>
            </View>
          ) : null}
        </View>
        <ChevronRight size={14} color={ELEPHANT} strokeWidth={2} />
      </View>
    </Pressable>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DayDetailScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const setAvailability    = usePlannerStore((s) => s.setAvailability);
  const setLocationStatus  = usePlannerStore((s) => s.setLocationStatus);
  const homeAddress        = usePlannerStore((s) => s.homeAddress);
  const setUserId          = usePlannerStore((s) => s.setUserId);
  const availabilityMap    = usePlannerStore((s) => s.availabilityMap);
  const defaultSettings    = useAvailabilityStore((s) => s.defaultSettings);

  const { data, isLoading, refetch } = useDayData(user?.id, date);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);
  const avail: any = data?.avail;
  const plans = (data?.plans ?? []) as any[];
  const dayTrip: any = data?.trip ?? null;

  // Calendar events blocking slots on this day (empty without permission)
  const [calBlockers, setCalBlockers] = useState<Partial<Record<TimeSlot, string>>>({});
  useEffect(() => {
    let cancelled = false;
    setCalBlockers({});
    if (date) {
      getCalendarBusyTitlesForDate(date).then((map) => {
        if (!cancelled) setCalBlockers(map);
      });
    }
    return () => { cancelled = true; };
  }, [date]);

  // Slots covered by a plan's actual start/end times — catches spillover
  // into slots other than the plan's primary one
  const planBlockers = new Map<string, string>();
  for (const p of plans) {
    const coverage = getPlanSlotCoverage({
      timeSlot: normalizeSlot(p.time_slot) as TimeSlot,
      startTime: p.start_time,
      endTime: p.end_time,
    });
    for (const c of coverage) {
      if (!planBlockers.has(c.slot)) planBlockers.set(c.slot, p.title || 'Plan');
    }
  }

  const parsedDate = date ? parseISO(date) : new Date();
  const today = isToday(parsedDate);

  // Plans grouped by normalized kebab-case slot
  const plansBySlot = new Map<string, any[]>();
  for (const p of plans) {
    const key = normalizeSlot(p.time_slot);
    plansBySlot.set(key, [...(plansBySlot.get(key) ?? []), p]);
  }
  const orphanPlans = plans.filter(
    (p) => !SLOTS.some((s) => s.slot === normalizeSlot(p.time_slot)),
  );

  // ── Availability slot toggling (optimistic, keyed by underscore column) ────
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());

  // ── Location state ──────────────────────────────────────────────────────────
  const [locOverride, setLocOverride] = useState<LocationStatus | null>(null);
  const [tripLoc, setTripLoc] = useState('');
  const [savingLoc, setSavingLoc] = useState(false);

  // Reset optimistic + location state when day changes
  useEffect(() => {
    setOptimistic({});
    setLocOverride(null);
  }, [date]);

  // Seed trip location from server data
  useEffect(() => {
    setTripLoc(avail?.trip_location ?? '');
  }, [avail?.trip_location, date]);

  // Ensure planner store has the userId set
  useEffect(() => {
    if (user?.id) setUserId(user.id);
  }, [user?.id]);

  const locStatus: LocationStatus =
    locOverride ?? (avail?.location_status === 'away' ? 'away' : 'home');
  const tripLocDirty = tripLoc.trim() !== (avail?.trip_location ?? '').trim();

  /** Schedule-derived defaults for this day (work hours busy, etc.) */
  const scheduleDefaultSlots = createDefaultAvailability(parsedDate, defaultSettings).slots;

  /** True if this slot is marked free (optimistic > explicit server value >
   *  store > schedule defaults). A null column in an existing row means the
   *  user never touched that slot, so it follows the default schedule —
   *  work-hour slots stay blocked unless manually toggled free. Mirrors
   *  mapAvailabilityRow / createDefaultAvailability so the Plans list and
   *  this screen always agree. */
  const slotIsFree = (slotCol: string): boolean => {
    if (slotCol in optimistic) return optimistic[slotCol];
    const v = avail?.[slotCol];
    if (v !== null && v !== undefined) return isFree(v);
    const storeDay = date ? availabilityMap[date] : undefined;
    if (storeDay) return !!storeDay.slots[normalizeSlot(slotCol) as TimeSlot];
    return !!scheduleDefaultSlots[normalizeSlot(slotCol) as TimeSlot];
  };

  /** Busy purely because of the default work schedule (no explicit toggle) */
  const isScheduleBusy = (slotCol: string): boolean => {
    if (slotCol in optimistic) return false;
    const v = avail?.[slotCol];
    if (v !== null && v !== undefined) return false;
    return !scheduleDefaultSlots[normalizeSlot(slotCol) as TimeSlot];
  };

  // No DB row → the day is schedule-derived (profile defaults)
  const isDefaultDay = !avail;

  // Standardized day wheel — same semantics as the Plans list
  const wheelAvail: DayAvailability = {
    date: parsedDate,
    slots: Object.fromEntries(
      SLOTS.map((s) => [s.slot, slotIsFree(s.col)]),
    ) as DayAvailability['slots'],
    locationStatus: 'home',
    isDefault: isDefaultDay,
  };
  const wheel = computeDayWheel({
    date: parsedDate,
    dayAvail: wheelAvail,
    settings: defaultSettings,
    dayPlans: plans.map((p) => ({ timeSlot: normalizeSlot(p.time_slot) })),
  });

  const toggleSlot = useCallback(
    async (slotDef: SlotDef) => {
      const current  = slotIsFree(slotDef.col);
      const newValue = !current;

      // Optimistic + haptic
      Haptics.selectionAsync();
      setOptimistic((prev) => ({ ...prev, [slotDef.col]: newValue }));
      setSaving((prev) => new Set(prev).add(slotDef.col));

      try {
        await setAvailability(parsedDate, slotDef.slot, newValue);
        await queryClient.invalidateQueries({ queryKey: ['day', user?.id, date] });
      } catch (err) {
        console.error('toggleSlot failed', err);
        setOptimistic((prev) => {
          const next = { ...prev };
          delete next[slotDef.col];
          return next;
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setSaving((prev) => {
          const next = new Set(prev);
          next.delete(slotDef.col);
          return next;
        });
      }
    },
    [setAvailability, parsedDate, queryClient, user?.id, date, avail, optimistic],
  );

  /** Mark all six slots free (or all busy if all currently free) */
  const toggleAllSlots = useCallback(async () => {
    const allFree = SLOTS.every((s) => slotIsFree(s.col));
    const newValue = !allFree;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const updates: Record<string, boolean> = {};
    SLOTS.forEach((s) => { updates[s.col] = newValue; });
    setOptimistic((prev) => ({ ...prev, ...updates }));

    try {
      await Promise.all(
        SLOTS.map((s) => setAvailability(parsedDate, s.slot, newValue)),
      );
      await queryClient.invalidateQueries({ queryKey: ['day', user?.id, date] });
    } catch (err) {
      console.error('toggleAllSlots failed', err);
      setOptimistic({});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [setAvailability, parsedDate, queryClient, user?.id, date, avail, optimistic]);

  /** Home ↔ Away toggle */
  const changeLocStatus = useCallback(
    async (status: LocationStatus) => {
      if (status === locStatus) return;
      Haptics.selectionAsync();
      setLocOverride(status);
      try {
        await setLocationStatus(status, parsedDate);
        await queryClient.invalidateQueries({ queryKey: ['day', user?.id, date] });
      } catch (err) {
        console.error('changeLocStatus failed', err);
        setLocOverride(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    [locStatus, setLocationStatus, parsedDate, queryClient, user?.id, date],
  );

  /** Persist the away-day trip location */
  const saveTripLocation = useCallback(async () => {
    if (!user?.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSavingLoc(true);
    try {
      const { error } = await supabase
        .from('availability')
        .upsert(
          {
            user_id: user.id,
            date,
            location_status: 'away',
            trip_location: tripLoc.trim() || null,
          } as any,
          { onConflict: 'user_id,date' },
        );
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['day', user?.id, date] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error('saveTripLocation failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSavingLoc(false);
    }
  }, [user?.id, date, tripLoc, queryClient]);

  const goToDay = (offset: number) => {
    Haptics.selectionAsync();
    router.setParams({ date: format(addDays(parsedDate, offset), 'yyyy-MM-dd') });
  };

  return (
    <SafeAreaView className="flex-1 bg-chalk" edges={['top']}>
      <ScreenHeader
        title={today ? 'Today' : format(parsedDate, 'EEEE')}
        subtitle={format(parsedDate, 'MMMM d, yyyy')}
        rightAction={
          <View className="flex-row items-center gap-1">
            <Pressable
              onPress={() => goToDay(-1)}
              hitSlop={6}
              className="w-8 h-8 rounded-full items-center justify-center active:opacity-60"
            >
              <ChevronLeft size={18} color={ELEPHANT} strokeWidth={2} />
            </Pressable>
            <Pressable
              onPress={() => goToDay(1)}
              hitSlop={6}
              className="w-8 h-8 rounded-full items-center justify-center active:opacity-60"
            >
              <ChevronRight size={18} color={ELEPHANT} strokeWidth={2} />
            </Pressable>
          </View>
        }
      />

      {isLoading ? (
        <ActivityIndicator className="mt-16" color={PARADE_GREEN} />
      ) : (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <ScrollView
          contentContainerClassName="px-5 pb-10 gap-5 pt-2"
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PARADE_GREEN} />
          }
        >
          {/* ── Day summary ──────────────────────────────────────────── */}
          <View className="bg-card rounded-2xl border border-border/30 shadow-sm px-4 py-3.5 flex-row items-center gap-3.5">
            <DateDial
              status={wheel.status}
              fill={wheel.fill}
              dayName={format(parsedDate, 'EEE')}
              dayNum={format(parsedDate, 'd')}
              isToday={today}
              size={64}
            />
            <View className="flex-1 gap-1.5">
              <View className="flex-row items-baseline gap-2">
                <Text
                  className="font-display text-base"
                  style={{ color: wheel.pill.text }}
                >
                  {wheel.label}
                </Text>
                <Text className="font-sans text-xs text-muted-foreground">
                  {wheel.free} of {wheel.total} social window{wheel.total === 1 ? '' : 's'} free
                </Text>
              </View>

              {/* Slot coverage bar — green free, ember planned, gray busy */}
              <View className="flex-row gap-1">
                {SLOTS.map((s) => {
                  const hasPlan = (plansBySlot.get(s.slot) ?? []).length > 0;
                  const free = slotIsFree(s.col);
                  const color = hasPlan
                    ? tint(EMBER, 0.7)
                    : free
                      ? tint(PARADE_GREEN, 0.7)
                      : tint(ELEPHANT, 0.2);
                  return (
                    <View
                      key={s.col}
                      className="flex-1 rounded-full"
                      style={{ height: 6, backgroundColor: color }}
                    />
                  );
                })}
              </View>
              <Text className="font-sans text-[10px] text-muted-foreground/70">
                {plans.length > 0
                  ? `${plans.length} plan${plans.length > 1 ? 's' : ''} on this day`
                  : 'No plans yet'}
                {isDefaultDay ? ' · based on your default schedule' : ''}
              </Text>
            </View>
          </View>

          {/* ── Location ─────────────────────────────────────────────── */}
          <View className="gap-2">
            <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-1">
              Location
            </Text>
            <View className="bg-card rounded-2xl border border-border/30 shadow-sm px-4 py-3.5 gap-3">
              {/* City, front and center (Fraunces) */}
              {dayTrip ? (
                <Pressable
                  onPress={() => router.push(`/(app)/trip/${dayTrip.id}`)}
                  className="flex-row items-center gap-2 active:opacity-70"
                >
                  <Text className="font-display text-2xl text-foreground flex-1" numberOfLines={1}>
                    {formatCityForDisplay(dayTrip.location) || dayTrip.name || 'On a trip'}
                  </Text>
                  <ChevronRight size={16} color={ELEPHANT} strokeWidth={2} />
                </Pressable>
              ) : locStatus === 'away' ? (
                <View className="gap-2.5">
                  <Text className="font-display text-2xl text-foreground" numberOfLines={1}>
                    {formatCityForDisplay(tripLoc) || 'Away'}
                  </Text>
                  <LocationAutocomplete
                    value={tripLoc}
                    onChange={setTripLoc}
                    placeholder="Where are you headed?"
                    types="(cities)"
                  />
                  {tripLocDirty && (
                    <Pressable
                      onPress={saveTripLocation}
                      disabled={savingLoc}
                      className="bg-primary rounded-xl items-center py-2.5 active:opacity-80"
                      style={{ opacity: savingLoc ? 0.6 : 1 }}
                    >
                      <Text className="font-sans text-sm font-semibold text-white">
                        {savingLoc ? 'Saving…' : 'Save location'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              ) : (
                <Text className="font-display text-2xl text-foreground" numberOfLines={1}>
                  {formatCityForDisplay(homeAddress) || 'Set a home city'}
                </Text>
              )}

              {/* Single status indicator — tap to switch (trips own the status) */}
              {(() => {
                const isAway = !!dayTrip || locStatus === 'away';
                const accent = isAway ? EMBER : PARADE_GREEN;
                const Icon = isAway ? Plane : Home;
                return (
                  <Pressable
                    onPress={dayTrip ? undefined : () => changeLocStatus(isAway ? 'home' : 'away')}
                    disabled={!!dayTrip}
                    className="flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1 active:opacity-70"
                    style={{ backgroundColor: tint(accent, 0.1) }}
                  >
                    <Icon size={11} color={accent} strokeWidth={2} />
                    <Text className="font-sans text-[11px] font-semibold" style={{ color: accent }}>
                      {dayTrip ? 'Away · Trip' : isAway ? 'Away' : 'Home'}
                    </Text>
                    {!dayTrip && (
                      <Text className="font-sans text-[10px] text-muted-foreground/60">
                        · tap to switch
                      </Text>
                    )}
                  </Pressable>
                );
              })()}
            </View>
          </View>

          {/* ── Time slots: availability + plans per window ──────────── */}
          <View className="gap-2">
            <View className="flex-row items-center justify-between px-1">
              <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Your day
              </Text>
              <Pressable onPress={toggleAllSlots} hitSlop={6} className="active:opacity-60">
                <Text className="font-sans text-xs font-semibold text-primary">
                  {SLOTS.every((s) => slotIsFree(s.col)) ? 'Clear all' : 'Mark all free'}
                </Text>
              </Pressable>
            </View>

            <View className="bg-card rounded-2xl border border-border/30 shadow-sm overflow-hidden">
              {SLOTS.map((slotDef, i) => {
                const free = slotIsFree(slotDef.col);
                const isSaving = saving.has(slotDef.col);
                const slotPlans = plansBySlot.get(slotDef.slot) ?? [];
                return (
                  <View key={slotDef.col}>
                    <View className="flex-row items-center px-4 py-3 gap-3">
                      {/* Free/busy toggle */}
                      <Pressable
                        onPress={() => toggleSlot(slotDef)}
                        disabled={isSaving}
                        hitSlop={8}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          borderWidth: 1.5,
                          borderColor: free ? PARADE_GREEN : TINT.grayStrong,
                          backgroundColor: free ? PARADE_GREEN : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: isSaving ? 0.5 : 1,
                        }}
                      >
                        {free && <Check size={14} color="#FFFFFF" strokeWidth={2.5} />}
                      </Pressable>

                      <Pressable
                        onPress={() => toggleSlot(slotDef)}
                        disabled={isSaving}
                        className="flex-1"
                      >
                        <Text className="font-sans text-sm text-foreground font-medium">
                          {slotDef.label}
                        </Text>
                        <Text className="font-sans text-[11px] text-muted-foreground mt-0.5">
                          {slotDef.time}
                        </Text>
                      </Pressable>

                      {/* Right side: quick plan on free empty slots, status otherwise */}
                      {free && slotPlans.length === 0 ? (
                        <Pressable
                          onPress={() =>
                            router.push(`/(app)/quick-plan?date=${date}&slot=${slotDef.slot}`)
                          }
                          hitSlop={6}
                          className="flex-row items-center gap-1 rounded-full px-2.5 py-1.5 active:opacity-70"
                          style={{ backgroundColor: TINT.primarySubtle }}
                        >
                          <Zap size={11} color={PARADE_GREEN} strokeWidth={2.25} />
                          <Text
                            className="font-sans text-[11px] font-semibold"
                            style={{ color: PARADE_GREEN }}
                          >
                            Quick plan
                          </Text>
                        </Pressable>
                      ) : !free && slotPlans.length === 0 ? (
                        // Explain the block: plan spillover > calendar > work schedule > manual
                        planBlockers.has(slotDef.slot) ? (
                          <BusySourceChip icon={Clock} label={planBlockers.get(slotDef.slot)!} />
                        ) : calBlockers[slotDef.slot] ? (
                          <BusySourceChip icon={CalendarDays} label={calBlockers[slotDef.slot]!} />
                        ) : isScheduleBusy(slotDef.col) ? (
                          <BusySourceChip icon={Briefcase} label="Work hours" />
                        ) : (
                          <Text className="font-sans text-xs text-muted-foreground/40">
                            Busy
                          </Text>
                        )
                      ) : null}
                    </View>

                    {/* Plans inside this window */}
                    {slotPlans.length > 0 && (
                      <View className="pl-12 pr-4 pb-3 gap-2">
                        {slotPlans.map((p) => (
                          <SlotPlanRow key={p.id} plan={p} />
                        ))}
                      </View>
                    )}

                    {i < SLOTS.length - 1 && <View className="h-px bg-border/30 mx-4" />}
                  </View>
                );
              })}
            </View>
          </View>

          {/* ── Plans without a recognized time slot ─────────────────── */}
          {orphanPlans.length > 0 && (
            <View className="gap-2">
              <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-1">
                Sometime that day
              </Text>
              {orphanPlans.map((p) => (
                <SlotPlanRow key={p.id} plan={p} />
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
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
