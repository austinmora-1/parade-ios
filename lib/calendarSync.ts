/**
 * Calendar sync — pulls events from the iOS Calendar (via expo-calendar /
 * EventKit) for the next 14 days, maps them to Parade time slots, and marks
 * those slots as busy in the user's availability.
 *
 * Phase 3 Block 1 v1:
 *   - Manual sync only (triggered from Settings → Calendar → "Sync now")
 *   - Marks overlapping slots as busy (false). Does NOT auto-clear slots
 *     that no longer have events — user needs to manually mark free if they
 *     removed a meeting from their calendar.
 *   - Returns a summary { eventsCount, slotsMarked } for the caller to show.
 */
import * as Calendar from 'expo-calendar';
import { addDays, format, parseISO } from 'date-fns';
import type { TimeSlot } from '@/types/planner';

// ─── Slot definitions ────────────────────────────────────────────────────────

/** Hour ranges (24h, local time) for each Parade time slot */
const SLOT_HOURS: Record<TimeSlot, [number, number]> = {
  'early-morning':   [6, 9],
  'late-morning':    [9, 12],
  'early-afternoon': [12, 15],
  'late-afternoon':  [15, 18],
  'evening':         [18, 22],
  'late-night':      [22, 24], // clamp at midnight for sync purposes
};
const ALL_SLOTS = Object.keys(SLOT_HOURS) as TimeSlot[];

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Float hour-of-day with fractional minutes (e.g. 14:30 → 14.5) */
function hourFloat(d: Date): number {
  return d.getHours() + d.getMinutes() / 60;
}

/** Given a date range fully within a single day, return overlapping slots. */
function slotsForRange(startHour: number, endHour: number): TimeSlot[] {
  const result: TimeSlot[] = [];
  for (const slot of ALL_SLOTS) {
    const [slotStart, slotEnd] = SLOT_HOURS[slot];
    // Half-open intervals: event [start, end) overlaps slot [slotStart, slotEnd)
    if (startHour < slotEnd && endHour > slotStart) {
      result.push(slot);
    }
  }
  return result;
}

/** Iterate every yyyy-MM-dd from start (inclusive) to end (inclusive) */
function eachDay(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last   = new Date(end.getFullYear(),   end.getMonth(),   end.getDate());
  while (cursor.getTime() <= last.getTime()) {
    dates.push(format(cursor, 'yyyy-MM-dd'));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/**
 * Compute the set of "yyyy-MM-dd:slot" keys an event covers, accounting for
 * all-day events and multi-day events.
 */
function eventToSlotKeys(event: Calendar.Event): string[] {
  const start = new Date(event.startDate);
  const end   = new Date(event.endDate);

  // All-day events block every slot on every day they cover
  if (event.allDay) {
    const days = eachDay(start, end);
    return days.flatMap((d) => ALL_SLOTS.map((s) => `${d}:${s}`));
  }

  const startDate = format(start, 'yyyy-MM-dd');
  const endDate   = format(end,   'yyyy-MM-dd');

  // Same-day event: simple overlap computation
  if (startDate === endDate) {
    const slots = slotsForRange(hourFloat(start), hourFloat(end));
    return slots.map((s) => `${startDate}:${s}`);
  }

  // Multi-day event: first day from event start to midnight, middle days all
  // slots, last day from midnight to event end
  const keys: string[] = [];
  const days = eachDay(start, end);
  days.forEach((dateStr, idx) => {
    if (idx === 0) {
      slotsForRange(hourFloat(start), 24).forEach((s) => keys.push(`${dateStr}:${s}`));
    } else if (idx === days.length - 1) {
      slotsForRange(0, hourFloat(end)).forEach((s) => keys.push(`${dateStr}:${s}`));
    } else {
      ALL_SLOTS.forEach((s) => keys.push(`${dateStr}:${s}`));
    }
  });
  return keys;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface SyncResult {
  eventsCount:  number;
  slotsMarked:  number;
  daysAffected: number;
}

/**
 * Pull events from device calendar(s) for the next 14 days and mark
 * overlapping Parade slots as busy.
 *
 * @param setAvailability — usually `usePlannerStore.getState().setAvailability`
 */
export async function syncCalendarBusyTimes(
  setAvailability: (date: Date, slot: TimeSlot, available: boolean) => Promise<void>,
  daysAhead: number = 14,
): Promise<SyncResult> {
  // 1. Get user's calendars
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  if (calendars.length === 0) {
    return { eventsCount: 0, slotsMarked: 0, daysAffected: 0 };
  }
  const calendarIds = calendars.map((c) => c.id);

  // 2. Fetch events in the window
  const startWindow = new Date();
  startWindow.setHours(0, 0, 0, 0);
  const endWindow = addDays(startWindow, daysAhead);

  const events = await Calendar.getEventsAsync(calendarIds, startWindow, endWindow);

  // 3. Build dedup'd set of slot keys
  const slotKeys = new Set<string>();
  for (const ev of events) {
    eventToSlotKeys(ev).forEach((k) => slotKeys.add(k));
  }

  if (slotKeys.size === 0) {
    return { eventsCount: events.length, slotsMarked: 0, daysAffected: 0 };
  }

  // 4. Persist each unique (date, slot) pair as busy
  const writes: Promise<void>[] = [];
  const daysAffected = new Set<string>();
  for (const key of slotKeys) {
    const [dateStr, slot] = key.split(':');
    daysAffected.add(dateStr);
    writes.push(setAvailability(parseISO(dateStr), slot as TimeSlot, false));
  }

  // Parallel writes — store's upsert handles concurrency per (user_id, date)
  await Promise.all(writes);

  return {
    eventsCount:  events.length,
    slotsMarked:  slotKeys.size,
    daysAffected: daysAffected.size,
  };
}
