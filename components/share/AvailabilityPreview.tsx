/**
 * AvailabilityPreview — the granularity-adaptive view of MY availability that
 * a recipient sees, rendered in-app so the sharer can preview it before sending
 * (XPE-312). The detail level tracks the chosen range, matching the reporter's
 * spec:
 *   • 1 week   → per-day DateDial wheels + the exact free time slots
 *   • 4 weeks  → open days: a week-by-week grid of day wheels (no slot detail)
 *   • 3 months → open weekends: one card per weekend with Sat/Sun wheels
 *
 * Wheels reuse computeDayWheel/DateDial so the colors and "open/mostly open/
 * booked" semantics are identical to the Plans tab.
 */
import { View, Text } from 'react-native';
import { addDays, format, startOfWeek, isSameMonth } from 'date-fns';
import { DateDial, computeDayWheel, type DayWheel } from '@/components/plans/DateDial';
import { createDefaultAvailability } from '@/stores/helpers/mapAvailability';
import { SLOT_OPTIONS, isSocialSlot } from '@/lib/socialSlots';
import { PARADE_GREEN, TINT } from '@/lib/colors';
import type { DayAvailability, TimeSlot, Plan } from '@/types/planner';
import type { DefaultAvailabilitySettings } from '@/stores/helpers/types';

export type ShareRangeView = '1w' | '1m' | '3m';

interface PreviewProps {
  view: ShareRangeView;
  availabilityMap: Record<string, DayAvailability>;
  defaultSettings: DefaultAvailabilitySettings | null;
  plans: Plan[];
}

/** Resolve one day's DayAvailability (real row, else schedule-derived default). */
function dayAvailFor(
  date: Date,
  map: Record<string, DayAvailability>,
  settings: DefaultAvailabilitySettings | null,
): DayAvailability {
  const key = format(date, 'yyyy-MM-dd');
  return map[key] ?? createDefaultAvailability(date, settings ?? undefined);
}

/** Build the DateDial wheel for a day, mirroring the Plans-tab computation. */
function wheelFor(
  date: Date,
  map: Record<string, DayAvailability>,
  settings: DefaultAvailabilitySettings | null,
  plans: Plan[],
): { wheel: DayWheel; dayAvail: DayAvailability } {
  const key = format(date, 'yyyy-MM-dd');
  const dayAvail = dayAvailFor(date, map, settings);
  const dayPlans = plans
    .filter((p) => {
      const d = p.date instanceof Date ? p.date : new Date(p.date);
      return format(d, 'yyyy-MM-dd') === key && p.blocksAvailability !== false;
    })
    .map((p) => ({ timeSlot: p.timeSlot as string, startTime: p.startTime, endTime: p.endTime }));
  const wheel = computeDayWheel({
    date,
    dayAvail,
    settings,
    dayPlans,
    // Away/travel coloring depends only on the explicit location flag here —
    // trip-day city resolution lives on the Plans tab and isn't needed for a
    // read-only availability preview.
    away: dayAvail.locationStatus === 'away',
  });
  return { wheel, dayAvail };
}

/** The free social slots for a day, in chronological order. */
function freeSocialSlots(date: Date, dayAvail: DayAvailability): TimeSlot[] {
  return SLOT_OPTIONS
    .filter((o) => dayAvail.slots[o.id] && isSocialSlot(date, o.id))
    .map((o) => o.id);
}

// ── 1 week: day rows with wheel + free-slot chips ─────────────────────────────

function WeekSlotsView({ availabilityMap, defaultSettings, plans }: Omit<PreviewProps, 'view'>) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i));
  return (
    <View className="gap-2.5">
      {days.map((day) => {
        const { wheel, dayAvail } = wheelFor(day, availabilityMap, defaultSettings, plans);
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

// ── 4 weeks: open days, a wheel grid per week ─────────────────────────────────

function OpenDaysView({ availabilityMap, defaultSettings, plans }: Omit<PreviewProps, 'view'>) {
  const today = new Date();
  const firstWeekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday
  const weeks = Array.from({ length: 4 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(firstWeekStart, w * 7 + d)),
  );
  return (
    <View className="gap-3">
      {weeks.map((week, wi) => (
        <View key={wi} className="bg-card rounded-2xl border border-border/30 p-3 gap-2 shadow-sm">
          <Text className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {format(week[0], 'MMM d')} – {format(week[6], 'MMM d')}
          </Text>
          <View className="flex-row justify-between">
            {week.map((day) => {
              const past = day < today && format(day, 'yyyy-MM-dd') !== format(today, 'yyyy-MM-dd');
              const { wheel } = wheelFor(day, availabilityMap, defaultSettings, plans);
              return (
                <View key={format(day, 'yyyy-MM-dd')} style={{ opacity: past ? 0.3 : 1 }}>
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

// ── 3 months: open weekends, one card per weekend ─────────────────────────────

function OpenWeekendsView({ availabilityMap, defaultSettings, plans }: Omit<PreviewProps, 'view'>) {
  const today = new Date();
  // This weekend's Saturday, then every following weekend for ~3 months.
  const firstSat = startOfWeek(today, { weekStartsOn: 6 }); // Sat of the current week
  const weekends = Array.from({ length: 13 }, (_, i) => {
    const sat = addDays(firstSat, i * 7);
    return { sat, sun: addDays(sat, 1) };
  }).filter((w) => w.sun >= today); // drop a weekend already fully past

  return (
    <View className="gap-2.5">
      {weekends.map(({ sat, sun }) => {
        const s = wheelFor(sat, availabilityMap, defaultSettings, plans);
        const u = wheelFor(sun, availabilityMap, defaultSettings, plans);
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
              <Text
                className="font-sans text-xs"
                style={{ color: anyFree ? PARADE_GREEN : '#929298' }}
              >
                {anyFree ? 'Open this weekend' : 'Booked'}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function AvailabilityPreview({ view, ...rest }: PreviewProps) {
  if (view === '1w') return <WeekSlotsView {...rest} />;
  if (view === '1m') return <OpenDaysView {...rest} />;
  return <OpenWeekendsView {...rest} />;
}
