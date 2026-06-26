/**
 * Trip availability — bulk writes that block / unblock all 6 time slots
 * across every day a trip covers.
 *
 * Used by:
 *   - new-trip.tsx after trip insert → mark days busy ("away")
 *   - trip/[tripId].tsx after trip delete → mark days free
 *
 * After unblocking (delete path), the caller should ideally also re-trigger
 * calendar sync so any underlying calendar events re-mark their slots busy.
 */
import { addDays, format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAvailabilityStore } from '@/stores/availabilityStore';
import { createDefaultAvailability } from '@/stores/helpers/mapAvailability';
import type { TimeSlot } from '@/types/planner';

const ALL_SLOTS: TimeSlot[] = [
  'early-morning',
  'late-morning',
  'early-afternoon',
  'late-afternoon',
  'evening',
  'late-night',
];

/**
 * Parse a trip date safely as LOCAL midnight. `new Date('yyyy-MM-dd')`
 * parses as UTC midnight, which lands on the *previous* local day in
 * negative-offset timezones — that off-by-one made trip deletion release
 * the wrong day range and strand the trip's last day as busy.
 */
export function toLocalDate(d: string | Date): Date {
  if (d instanceof Date) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return parseISO(d); // date-fns parses 'yyyy-MM-dd' as local midnight
}

/**
 * Reliable bulk block/release of whole days: one upsert covering every
 * given date (all 6 slots), throwing on failure so callers can react —
 * unlike the per-slot path, which fans out 6×days writes through a store
 * method that swallows errors. Also mirrors the result into the
 * availability store so the Plans tab updates without a refetch.
 */
export async function setDatesAvailability(
  userId: string,
  dates: string[], // yyyy-MM-dd
  /** false = mark busy (away); true = release */
  available: boolean,
): Promise<{ daysAffected: number }> {
  if (dates.length === 0) return { daysAffected: 0 };

  const rows = dates.map((date) => {
    const row: Record<string, unknown> = { user_id: userId, date };
    for (const slot of ALL_SLOTS) row[slot.replace('-', '_')] = available;
    return row;
  });

  const { error } = await supabase
    .from('availability')
    .upsert(rows as any, { onConflict: 'user_id,date' });
  if (error) throw error;

  // Mirror into the local store (Plans tab, day detail fallbacks)
  const state = useAvailabilityStore.getState();
  const newMap = { ...state.availabilityMap };
  for (const dateStr of dates) {
    const slots = Object.fromEntries(ALL_SLOTS.map((s) => [s, available])) as Record<TimeSlot, boolean>;
    const existing = newMap[dateStr];
    if (existing) {
      newMap[dateStr] = { ...existing, slots, isDefault: false };
    } else {
      const entry = createDefaultAvailability(parseISO(dateStr), state.defaultSettings);
      entry.slots = slots;
      entry.isDefault = false;
      newMap[dateStr] = entry;
    }
  }
  const dateSet = new Set(dates);
  const replaced = state.availability.map((a) => {
    const key = format(a.date, 'yyyy-MM-dd');
    return dateSet.has(key) ? newMap[key] : a;
  });
  const replacedKeys = new Set(replaced.map((a) => format(a.date, 'yyyy-MM-dd')));
  const appended = dates.filter((d) => !replacedKeys.has(d)).map((d) => newMap[d]);
  useAvailabilityStore.setState({
    availability: [...replaced, ...appended],
    availabilityMap: newMap,
  });

  return { daysAffected: dates.length };
}

/**
 * Mark a trip's days as a LOCATION CHANGE only — sets location_status +
 * trip_location without touching any slot columns, so the trip never blocks
 * availability. Pass `location: null, away: false` to clear (trip deleted).
 */
export async function setTripLocationRange(
  userId: string,
  startDate: string | Date,
  endDate: string | Date,
  location: string | null,
  away: boolean,
  /**
   * When these availability rows belong to an app-managed trip, pass its id.
   * The DB trigger `auto_create_trip_from_availability` treats a non-null
   * `trip_id` as "the app owns this trip's lifecycle" and skips its auto
   * create/cleanup logic — without this, editing a trip's dates clears the
   * old range to "home", which makes the trigger DELETE the trip mid-edit.
   * Leave null for manual availability edits (lets the trigger materialise
   * trips from away-runs as before).
   */
  tripId: string | null = null,
): Promise<{ daysAffected: number }> {
  const start = toLocalDate(startDate);
  const last  = toLocalDate(endDate);
  const dates: string[] = [];
  for (let d = start; d.getTime() <= last.getTime(); d = addDays(d, 1)) {
    dates.push(format(d, 'yyyy-MM-dd'));
  }
  if (dates.length === 0) return { daysAffected: 0 };

  const rows = dates.map((date) => ({
    user_id: userId,
    date,
    location_status: away ? 'away' : 'home',
    trip_location: away ? location : null,
    trip_id: tripId,
  }));

  const { error } = await supabase
    .from('availability')
    .upsert(rows as any, { onConflict: 'user_id,date' });
  if (error) throw error;

  // Mirror location (not slots) into the local store
  const state = useAvailabilityStore.getState();
  const newMap = { ...state.availabilityMap };
  for (const dateStr of dates) {
    const existing = newMap[dateStr] ?? createDefaultAvailability(parseISO(dateStr), state.defaultSettings);
    newMap[dateStr] = {
      ...existing,
      locationStatus: away ? 'away' : 'home',
      tripLocation: away ? (location ?? undefined) : undefined,
    };
  }
  const dateSet = new Set(dates);
  const replaced = state.availability.map((a) => {
    const key = format(a.date, 'yyyy-MM-dd');
    return dateSet.has(key) ? newMap[key] : a;
  });
  const replacedKeys = new Set(replaced.map((a) => format(a.date, 'yyyy-MM-dd')));
  const appended = dates.filter((d) => !replacedKeys.has(d)).map((d) => newMap[d]);
  useAvailabilityStore.setState({
    availability: [...replaced, ...appended],
    availabilityMap: newMap,
  });

  return { daysAffected: dates.length };
}

/** Bulk block/release for a trip's full date range (inclusive). */
export async function setTripAvailabilityBulk(
  userId: string,
  startDate: string | Date,
  endDate: string | Date,
  /** false = mark busy (away); true = release */
  available: boolean,
): Promise<{ daysAffected: number }> {
  const start = toLocalDate(startDate);
  const last  = toLocalDate(endDate);
  const dates: string[] = [];
  for (let d = start; d.getTime() <= last.getTime(); d = addDays(d, 1)) {
    dates.push(format(d, 'yyyy-MM-dd'));
  }
  return setDatesAvailability(userId, dates, available);
}

/**
 * @deprecated Prefer setTripAvailabilityBulk — this per-slot fan-out runs
 * 6×days writes through a store method that swallows errors, so partial
 * failures strand blocked days silently. Kept for go-somewhere.tsx until
 * that flow migrates.
 */
export async function setTripAvailability(
  setAvailability: (date: Date, slot: TimeSlot, available: boolean) => Promise<void>,
  startDate: Date,
  endDate: Date,
  /** false = mark busy (away); true = release */
  available: boolean,
): Promise<{ daysAffected: number; slotsWritten: number }> {
  const writes: Promise<void>[] = [];
  const cursor = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate(),
  );
  const last = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate(),
  );
  let days = 0;

  while (cursor.getTime() <= last.getTime()) {
    const date = new Date(cursor);
    for (const slot of ALL_SLOTS) {
      writes.push(setAvailability(date, slot, available));
    }
    cursor.setDate(cursor.getDate() + 1);
    days++;
  }

  await Promise.all(writes);
  return { daysAffected: days, slotsWritten: writes.length };
}
