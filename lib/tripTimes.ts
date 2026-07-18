/**
 * Trip arrival/departure time helpers (XPE-285 / XPE-275).
 *
 * Trips optionally carry `arrival_time` (when you get to the destination on
 * start_date) and `departure_time` (when you leave it on end_date), both
 * "HH:mm[:ss]" strings. NULL means all-day — the legacy behavior and the
 * default for new trips. A day where one of those times applies is a
 * *travel day*: the user is only partially away, traveling between
 * locations, rather than at the destination the whole day.
 */
import { parseTimeToHour, SLOT_BOUNDS, SLOT_ORDER } from '@/lib/planSlotCoverage';
import { formatCityForDisplay } from '@/lib/formatCity';
import { normalizeCity } from '@/lib/locationMatch';
import type { TimeSlot } from '@/types/planner';

export interface TripTimesLike {
  start_date: string; // yyyy-MM-dd
  end_date: string;   // yyyy-MM-dd
  arrival_time?: string | null;   // HH:mm[:ss]
  departure_time?: string | null; // HH:mm[:ss]
  location?: string | null;
  name?: string | null;
}

/** Fractional hour (e.g. 15.5) → "3:30 PM". */
export function formatHour12(hour: number): string {
  const norm = ((hour % 24) + 24) % 24;
  const whole = Math.floor(norm);
  const minutes = Math.round((norm - whole) * 60);
  const period = whole < 12 ? 'AM' : 'PM';
  const h12 = whole % 12 === 0 ? 12 : whole % 12;
  return `${h12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/** "HH:mm[:ss]" → "3:00 PM". Null/invalid input → null. */
export function formatTripTime(time: string | null | undefined): string | null {
  const h = parseTimeToHour(time ?? null);
  return h == null ? null : formatHour12(h);
}

/** How a trip occupies a given day, considering its arrival/departure times. */
export type TripDayKind =
  /** First day, arrival_time set — traveling to the destination. */
  | 'arrival'
  /** Last day, departure_time set — traveling back. */
  | 'departure'
  /** Single-day trip with both times — away only between them. */
  | 'arrival-departure'
  /** Fully at the destination all day. */
  | 'full';

/** Classify `dateStr` (yyyy-MM-dd) within the trip. Null if outside it. */
export function tripDayKind(trip: TripTimesLike, dateStr: string): TripDayKind | null {
  if (dateStr < trip.start_date || dateStr > trip.end_date) return null;
  const arrives = dateStr === trip.start_date && !!trip.arrival_time;
  const departs = dateStr === trip.end_date && !!trip.departure_time;
  if (arrives && departs) return 'arrival-departure';
  if (arrives) return 'arrival';
  if (departs) return 'departure';
  return 'full';
}

/** True when the user is only partially away on this day (traveling). */
export function isTravelDay(trip: TripTimesLike, dateStr: string): boolean {
  const kind = tripDayKind(trip, dateStr);
  return kind === 'arrival' || kind === 'departure' || kind === 'arrival-departure';
}

/**
 * Short label for a travel day, e.g. "Arriving ~3:00 PM" or
 * "Leaving ~11:00 AM". Pass `locationLabel` to weave the destination in
 * ("Arriving in Lisbon ~3:00 PM"). Null on non-travel days (or outside the
 * trip entirely).
 */
export function tripDayTravelLabel(
  trip: TripTimesLike,
  dateStr: string,
  locationLabel?: string | null,
): string | null {
  const kind = tripDayKind(trip, dateStr);
  const arrive = formatTripTime(trip.arrival_time);
  const depart = formatTripTime(trip.departure_time);
  const loc = locationLabel?.trim() || null;
  switch (kind) {
    case 'arrival':
      return arrive ? `Arriving${loc ? ` in ${loc}` : ''} ~${arrive}` : null;
    case 'departure':
      return depart ? `Leaving${loc ? ` ${loc}` : ''} ~${depart}` : null;
    case 'arrival-departure':
      return arrive && depart ? `${loc ? `In ${loc} ` : 'There '}${arrive} – ${depart}` : null;
    default:
      return null;
  }
}

/**
 * Which of the 6 time slots count as AWAY (at the destination) for a given
 * trip day. This is the availability-math core for travel days:
 *   - middle days, and travel days without a time set → 'all'
 *   - arrival day: slots that end after the arrival time
 *   - departure day: slots that start before the departure time
 *   - single-day trip: slots overlapping the [arrival, departure] window
 * A slot that straddles the travel time counts as away — you're in transit
 * during it, not reliably free at either end.
 * Returns null when the date is outside the trip.
 */
export function tripAwaySlotsForDay(
  trip: TripTimesLike,
  dateStr: string,
): TimeSlot[] | 'all' | null {
  if (dateStr < trip.start_date || dateStr > trip.end_date) return null;
  const arrH = dateStr === trip.start_date ? parseTimeToHour(trip.arrival_time ?? null) : null;
  const depH = dateStr === trip.end_date ? parseTimeToHour(trip.departure_time ?? null) : null;
  if (arrH == null && depH == null) return 'all';
  return SLOT_ORDER.filter((slot) => {
    const { startHr, endHr } = SLOT_BOUNDS[slot];
    if (arrH != null && endHr <= arrH) return false;  // over before you arrive
    if (depH != null && startHr >= depH) return false; // starts after you've left
    return true;
  });
}

/** Union of away slots across several trips covering the same day. */
export function combinedAwaySlots(
  trips: TripTimesLike[],
  dateStr: string,
): TimeSlot[] | 'all' | null {
  let acc: Set<TimeSlot> | null = null;
  for (const trip of trips) {
    const slots = tripAwaySlotsForDay(trip, dateStr);
    if (slots == null) continue;
    if (slots === 'all') return 'all';
    if (!acc) acc = new Set();
    for (const s of slots) acc.add(s);
  }
  const found = acc;
  return found ? SLOT_ORDER.filter((s) => found.has(s)) : null;
}

/** Travel-day presentation: direction (origin → destination) + time. */
export interface TravelDayView {
  kind: 'arrival' | 'departure' | 'round';
  /** e.g. "New York → Lisbon · ~3:00 PM" (round trips get a time range). */
  label: string;
  awaySlots: TimeSlot[] | 'all';
}

/**
 * View for a trip's start/end day — EVERY trip's first and last day is a
 * travel day for display purposes, timed or not (untimed ones just omit the
 * time). `homeLocation` is the user's home address / city (raw — formatted
 * here). Returns null on middle days or outside the trip.
 */
export function tripTravelDayView(
  trip: TripTimesLike,
  dateStr: string,
  homeLocation?: string | null,
): TravelDayView | null {
  if (dateStr < trip.start_date || dateStr > trip.end_date) return null;
  const isStart = dateStr === trip.start_date;
  const isEnd = dateStr === trip.end_date;
  if (!isStart && !isEnd) return null;

  const home = (homeLocation && formatCityForDisplay(homeLocation)) || 'Home';
  const dest =
    (trip.location && formatCityForDisplay(trip.location)) || trip.location || trip.name || 'Away';
  const arrive = formatTripTime(trip.arrival_time);
  const depart = formatTripTime(trip.departure_time);
  const awaySlots = tripAwaySlotsForDay(trip, dateStr) ?? 'all';

  // Same-city "visit" — a direction arrow between identical cities reads
  // wrong; fall back to the plain time label.
  if (normalizeCity(home) && normalizeCity(home) === normalizeCity(dest)) {
    const fallback =
      tripDayTravelLabel(trip, dateStr, dest) ?? (isStart && isEnd ? dest : `In ${dest}`);
    return { kind: isStart && isEnd ? 'round' : isStart ? 'arrival' : 'departure', label: fallback, awaySlots };
  }

  if (isStart && isEnd) {
    const times = arrive && depart ? ` · ${arrive} – ${depart}` : arrive ? ` · from ~${arrive}` : depart ? ` · until ~${depart}` : '';
    return { kind: 'round', label: `${home} → ${dest}${times}`, awaySlots };
  }
  if (isStart) {
    return {
      kind: 'arrival',
      label: `${home} → ${dest}${arrive ? ` · ~${arrive}` : ''}`,
      awaySlots,
    };
  }
  return {
    kind: 'departure',
    label: `${dest} → ${home}${depart ? ` · ~${depart}` : ''}`,
    awaySlots,
  };
}

/**
 * "Arrives 3:00 PM · Departs 11:00 AM" summary for a whole trip, or null
 * when neither time is set (all-day trip).
 */
export function tripTimesSummary(trip: Pick<TripTimesLike, 'arrival_time' | 'departure_time'>): string | null {
  const arrive = formatTripTime(trip.arrival_time);
  const depart = formatTripTime(trip.departure_time);
  if (!arrive && !depart) return null;
  const parts: string[] = [];
  if (arrive) parts.push(`Arrives ${arrive}`);
  if (depart) parts.push(`Departs ${depart}`);
  return parts.join(' · ');
}
