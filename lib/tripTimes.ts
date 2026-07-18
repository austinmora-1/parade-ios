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
import { parseTimeToHour } from '@/lib/planSlotCoverage';

export interface TripTimesLike {
  start_date: string; // yyyy-MM-dd
  end_date: string;   // yyyy-MM-dd
  arrival_time?: string | null;   // HH:mm[:ss]
  departure_time?: string | null; // HH:mm[:ss]
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
 * "Leaving ~11:00 AM". Null on non-travel days (or when outside the trip).
 */
export function tripDayTravelLabel(trip: TripTimesLike, dateStr: string): string | null {
  const kind = tripDayKind(trip, dateStr);
  const arrive = formatTripTime(trip.arrival_time);
  const depart = formatTripTime(trip.departure_time);
  switch (kind) {
    case 'arrival':
      return arrive ? `Arriving ~${arrive}` : null;
    case 'departure':
      return depart ? `Leaving ~${depart}` : null;
    case 'arrival-departure':
      return arrive && depart ? `There ${arrive} – ${depart}` : null;
    default:
      return null;
  }
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
