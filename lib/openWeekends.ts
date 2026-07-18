/**
 * openWeekends — the weekend-level rollup the codebase lacks (everything else
 * is per-slot). Collapses each Sat+Sun's social slots into one WeekendSummary
 * for the "Open weekends" browse view (reframe of XPE-274).
 *
 * Own availability comes from availabilityStore's availabilityMap (±183d, with
 * NULL/default slots already resolved to booleans + plan/calendar blocks
 * written through). Friend overlap comes from useFriendWeekendAvailability.
 * Pure — no hooks, no fetching.
 */
import { format } from 'date-fns';
import type { DayAvailability, Plan, TimeSlot } from '@/types/planner';
import { SLOT_OPTIONS } from '@/lib/socialSlots';
import { combinedAwaySlots } from '@/lib/tripTimes';
import type { FriendLite, FriendsByDate } from '@/hooks/useFriendWeekendAvailability';

export type WeekendState = 'open' | 'partial' | 'booked' | 'away';

export interface WeekendSlot {
  date: string; // yyyy-MM-dd (the specific Sat or Sun)
  slot: TimeSlot;
}

export interface WeekendSummary {
  key: string; // the Saturday's yyyy-MM-dd
  saturday: string;
  sunday: string;
  monthLabel: string; // "July 2026"
  state: WeekendState;
  openSlots: WeekendSlot[];
  bookedTitles: string[];
  awayLocation: string | null;
  friends: FriendLite[];
}

interface TripLike {
  start_date: string;
  end_date: string;
  location?: string | null;
  name?: string | null;
  arrival_time?: string | null;
  departure_time?: string | null;
}

const ALL_SLOTS: TimeSlot[] = SLOT_OPTIONS.map((o) => o.id);
const ACTIVE_STATUSES: ReadonlySet<string> = new Set(['confirmed', 'tentative', 'proposed']);

function localKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseLocal(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

/** Upcoming weekends starting from `from` (inclusive): the next `count` Sat/Sun pairs. */
export function listWeekends(from: Date, count: number): { saturday: string; sunday: string }[] {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  // advance to the nearest upcoming Saturday (6 = Sat); if already past Sat into
  // Sunday, still include this weekend's Saturday-as-anchor by stepping back one.
  const dow = d.getDay();
  if (dow === 0) d.setDate(d.getDate() - 1); // Sunday → this weekend's Saturday
  else d.setDate(d.getDate() + ((6 - dow + 7) % 7)); // → next/this Saturday

  const out: { saturday: string; sunday: string }[] = [];
  for (let i = 0; i < count; i++) {
    const sat = new Date(d);
    sat.setDate(d.getDate() + i * 7);
    const sun = new Date(sat);
    sun.setDate(sat.getDate() + 1);
    out.push({ saturday: localKey(sat), sunday: localKey(sun) });
  }
  return out;
}

/** All Sat+Sun dates flattened — feed to useFriendWeekendAvailability. */
export function weekendDatesFlat(weekends: { saturday: string; sunday: string }[]): string[] {
  return weekends.flatMap((w) => [w.saturday, w.sunday]);
}

export function computeOpenWeekends(params: {
  weekends: { saturday: string; sunday: string }[];
  availabilityMap: Record<string, DayAvailability>;
  plans: Plan[];
  trips: TripLike[];
  friendsByDate: FriendsByDate;
}): WeekendSummary[] {
  const { weekends, availabilityMap, plans, trips, friendsByDate } = params;

  // Index active plan titles by local date key.
  const planTitlesByDate: Record<string, string[]> = {};
  for (const p of plans) {
    if (!ACTIVE_STATUSES.has(p.status)) continue;
    const k = localKey(p.date);
    (planTitlesByDate[k] ||= []).push(p.title || 'Plan');
  }

  return weekends.map(({ saturday, sunday }) => {
    const days = [saturday, sunday];

    // Away, slot-level: trip arrival/departure times make the trip's first/
    // last day only PARTIALLY away (a Sunday-9pm arrival shouldn't kill the
    // whole weekend). Middle days, untimed travel days, and day-level
    // locationStatus='away' rows still count as fully away.
    const overlappingTrips = trips.filter(
      (t) => t.start_date <= sunday && t.end_date >= saturday,
    );
    const overlappingTrip = overlappingTrips[0] ?? null;
    const awayByDay: Record<string, TimeSlot[] | 'all' | null> = {};
    for (const d of days) {
      const fromTrips = combinedAwaySlots(overlappingTrips, d);
      awayByDay[d] =
        fromTrips === 'all' || availabilityMap[d]?.locationStatus === 'away'
          ? 'all'
          : fromTrips;
    }
    const anyAway = days.some((d) => {
      const a = awayByDay[d];
      return a === 'all' || (a != null && a.length > 0);
    });
    const awayLocation = anyAway
      ? overlappingTrip?.location ||
        overlappingTrip?.name ||
        availabilityMap[saturday]?.tripLocation ||
        availabilityMap[sunday]?.tripLocation ||
        null
      : null;

    // Open social slots across Sat+Sun (map already reflects plan/calendar blocks;
    // a missing day defaults to free, matching the store's default semantics).
    // Away slots are subtracted per-day.
    const openSlots: WeekendSlot[] = [];
    for (const date of days) {
      const away = awayByDay[date];
      if (away === 'all') continue;
      const awaySet = new Set(away ?? []);
      const slots = availabilityMap[date]?.slots;
      for (const slot of ALL_SLOTS) {
        if (awaySet.has(slot)) continue;
        const free = slots ? slots[slot] !== false : true;
        if (free) openSlots.push({ date, slot });
      }
    }

    const bookedTitles = [
      ...(planTitlesByDate[saturday] ?? []),
      ...(planTitlesByDate[sunday] ?? []),
    ];

    const total = ALL_SLOTS.length * 2;
    let state: WeekendState;
    if (anyAway && openSlots.length === 0) state = 'away';
    else if (openSlots.length >= total) state = 'open';
    else if (openSlots.length > 0) state = 'partial';
    else state = 'booked';

    // Friends free either day, deduped.
    const friendMap = new Map<string, FriendLite>();
    for (const date of days) {
      for (const f of friendsByDate[date] ?? []) {
        if (!friendMap.has(f.userId)) friendMap.set(f.userId, f);
      }
    }

    return {
      key: saturday,
      saturday,
      sunday,
      monthLabel: format(parseLocal(saturday), 'MMMM yyyy'),
      state,
      openSlots,
      bookedTitles,
      awayLocation,
      friends: Array.from(friendMap.values()),
    };
  });
}
