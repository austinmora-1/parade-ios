/**
 * AvailabilityPreview — the granularity-adaptive view of MY availability that
 * a recipient sees, rendered in-app so the sharer can preview it before sending
 * (XPE-312). The detail level tracks the span of the chosen range:
 *   • ≤ 1 week   → 'slots'   : per-day DateDial wheels + the exact free slots
 *   • ≤ 1 month  → 'days'    : week-by-week grid of day wheels (no slot detail)
 *   • longer     → 'weekends': one card per weekend with Sat/Sun wheels
 *
 * Range-driven (start/end) so it serves both the presets and a custom date
 * range. Wheels reuse computeDayWheel/DateDial so colors and "open/mostly open/
 * booked" semantics are identical to the Plans tab.
 */
import { View, Text } from 'react-native';
import {
  addDays,
  format,
  startOfWeek,
  isSameMonth,
  differenceInCalendarDays,
  isSaturday,
} from 'date-fns';
import { DateDial, computeDayWheel, type DayWheel } from '@/components/plans/DateDial';
import { createDefaultAvailability } from '@/stores/helpers/mapAvailability';
import { SLOT_OPTIONS, isSocialSlot } from '@/lib/socialSlots';
import { PARADE_GREEN, TINT } from '@/lib/colors';
import type { DayAvailability, TimeSlot, Plan } from '@/types/planner';
import type { DefaultAvailabilitySettings } from '@/stores/helpers/types';

export type ShareGrain = 'slots' | 'days' | 'weekends';

/**
 * Pick the sharing granularity from a span length (inclusive day count), per
 * the XPE-312 spec: a week shares time slots, up to a month shares open days,
 * anything longer shares open weekends.
 */
export function grainForSpan(days: number): ShareGrain {
  if (days <= 7) return 'slots';
  if (days <= 31) return 'days';
  return 'weekends';
}

export const GRAIN_HINT: Record<ShareGrain, string> = {
  slots: 'time slots',
  days: 'open days',
  weekends: 'open weekends',
};

interface PreviewProps {
  grain: ShareGrain;
  /** Inclusive range. */
  start: Date;
  end: Date;
  availabilityMap: Record<string, DayAvailability>;
  defaultSettings: DefaultAvailabilitySettings | null;
  plans: Plan[];
}
type Ctx = Pick<PreviewProps, 'availabilityMap' | 'defaultSettings' | 'plans'>;

/** Midnight-anchored day list for an inclusive range (capped for safety). */
function eachDay(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= last && out.length < 400) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** Build the DateDial wheel for a day, mirroring the Plans-tab computation. */
function wheelFor(date: Date, ctx: Ctx): { wheel: DayWheel; dayAvail: DayAvailability } {
  const key = format(date, 'yyyy-MM-dd');
  const dayAvail =
    ctx.availabilityMap[key] ?? createDefaultAvailability(date, ctx.defaultSettings ?? undefined);
  const dayPlans = ctx.plans
    .filter((p) => {
      const d = p.date instanceof Date ? p.date : new Date(p.date);
      return format(d, 'yyyy-MM-dd') === key && p.blocksAvailability !== false;
    })
    .map((p) => ({ timeSlot: p.timeSlot as string, startTime: p.startTime, endTime: p.endTime }));
  const wheel = computeDayWheel({
    date,
    dayAvail,
    settings: ctx.defaultSettings,
    dayPlans,
    // Away/travel coloring uses only the explicit location flag here — trip-day
    // city resolution lives on the Plans tab and isn't needed for a read-only
    // availability preview.
    away: dayAvail.locationStatus === 'away',
  });
  return { wheel, dayAvail };
}

/** The free social slots for a day, chronological. */
function freeSocialSlots(date: Date, dayAvail: DayAvailability): TimeSlot[] {
  return SLOT_OPTIONS.filter((o) => dayAvail.slots[o.id] && isSocialSlot(date, o.id)).map((o) => o.id);
}

// ── slots: day rows with wheel + free-slot chips ──────────────────────────────

function SlotsView({ start, end, ...ctx }: { start: Date; end: Date } & Ctx) {
  return (
    <View className="gap-2.5">
      {eachDay(start, end).map((day) => {
        const { wheel, dayAvail } = wheelFor(day, ctx);
        const free = freeSocialSlots(day, dayAvail);
        return (
          <View
            key={format(day, 'yyyy-MM-dd')}
            className="bg-card rounded-2xl border border-border/30 p-3 flex-row items-center gap-3 shadow-sm"
          >
            <DateDial
              status={wheel.status}
              fill={wheel.fill}
              arcColor={wheel.arcColor}
              dayName={format(day, 'EEE')}
              dayNum={format(day, 'd')}
              size={48}
            />
            <View className="flex-1 min-w-0 gap-1.5">
              <Text className="font-sans text-sm font-semibold text-foreground">{wheel.label}</Text>
              {free.length > 0 ? (
                <View className="flex-row flex-wrap gap-1.5">
                  {free.map((slot) => {
                    const meta = SLOT_OPTIONS.find((o) => o.id === slot)!;
                    return (
                      <View
                        key={slot}
                        className="rounded-lg px-2 py-1"
                        style={{ backgroundColor: TINT.primarySubtle }}
                      >
                        <Text className="font-sans text-[11px] font-medium text-primary">{meta.label}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text className="font-sans text-xs text-muted-foreground">No free time</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── days: open days, a wheel grid per week ────────────────────────────────────

function DaysView({ start, end, ...ctx }: { start: Date; end: Date } & Ctx) {
  const firstWeekStart = startOfWeek(start, { weekStartsOn: 1 }); // Monday
  const weekCount = Math.ceil((differenceInCalendarDays(end, firstWeekStart) + 1) / 7);
  const weeks = Array.from({ length: Math.max(1, weekCount) }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(firstWeekStart, w * 7 + d)),
  );
  const startKey = format(start, 'yyyy-MM-dd');
  const endKey = format(end, 'yyyy-MM-dd');
  return (
    <View className="gap-3">
      {weeks.map((week, wi) => (
        <View key={wi} className="bg-card rounded-2xl border border-border/30 p-3 gap-2 shadow-sm">
          <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {format(week[0], 'MMM d')} – {format(week[6], 'MMM d')}
          </Text>
          <View className="flex-row justify-between">
            {week.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const outside = key < startKey || key > endKey;
              const { wheel } = wheelFor(day, ctx);
              return (
                <View key={key} style={{ opacity: outside ? 0.28 : 1 }}>
                  <DateDial
                    status={wheel.status}
                    fill={wheel.fill}
                    arcColor={wheel.arcColor}
                    dayName={format(day, 'EEEEE')}
                    dayNum={format(day, 'd')}
                    size={34}
                  />
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

// ── weekends: one card per weekend ────────────────────────────────────────────

function WeekendsView({ start, end, ...ctx }: { start: Date; end: Date } & Ctx) {
  // First Saturday on or before the start, then every following weekend that
  // still intersects [start, end].
  const firstSat = startOfWeek(start, { weekStartsOn: 6 });
  const weekends: { sat: Date; sun: Date }[] = [];
  for (let i = 0; i < 60; i++) {
    const sat = addDays(firstSat, i * 7);
    const sun = addDays(sat, 1);
    if (sat > end) break;
    if (sun >= start) weekends.push({ sat, sun });
  }
  return (
    <View className="gap-2.5">
      {weekends.map(({ sat, sun }) => {
        const s = wheelFor(sat, ctx);
        const u = wheelFor(sun, ctx);
        const anyFree = s.wheel.free > 0 || u.wheel.free > 0;
        return (
          <View
            key={format(sat, 'yyyy-MM-dd')}
            className="bg-card rounded-2xl border border-border/30 p-3 flex-row items-center gap-3 shadow-sm"
            style={anyFree ? { borderColor: TINT.primaryBorder } : undefined}
          >
            <View className="flex-row gap-2">
              {[{ d: sat, w: s.wheel }, { d: sun, w: u.wheel }].map(({ d, w }) => (
                <DateDial
                  key={format(d, 'yyyy-MM-dd')}
                  status={w.status}
                  fill={w.fill}
                  arcColor={w.arcColor}
                  dayName={format(d, 'EEE')}
                  dayNum={format(d, 'd')}
                  size={44}
                />
              ))}
            </View>
            <View className="flex-1 min-w-0">
              <Text className="font-sans text-sm font-semibold text-foreground">
                {isSameMonth(sat, sun)
                  ? `${format(sat, 'MMM d')}–${format(sun, 'd')}`
                  : `${format(sat, 'MMM d')} – ${format(sun, 'MMM d')}`}
              </Text>
              <Text className="font-sans text-xs" style={{ color: anyFree ? PARADE_GREEN : '#929298' }}>
                {anyFree ? 'Open this weekend' : 'Booked'}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function AvailabilityPreview({ grain, start, end, ...ctx }: PreviewProps) {
  if (grain === 'slots') return <SlotsView start={start} end={end} {...ctx} />;
  if (grain === 'days') return <DaysView start={start} end={end} {...ctx} />;
  return <WeekendsView start={start} end={end} {...ctx} />;
}
