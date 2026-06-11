/**
 * Calendar sync — pulls events from iOS Calendar (via expo-calendar /
 * EventKit) for the next 14 days, maps them to Parade time slots, and
 * marks those slots as busy in the user's availability.
 *
 * Phase 4 reconciliation:
 *   - Cache the set of "yyyy-MM-dd:slot" keys we wrote last sync in MMKV
 *   - On next sync, compute the new set
 *   - Keys present last sync but missing this sync → mark FREE (event removed)
 *   - Keys present this sync but missing last sync → mark BUSY (new event)
 *   - Keys present both → no-op (idempotent)
 *
 * This means removing a meeting from Calendar releases the slot
 * automatically on the next sync. User's manual free/busy edits to
 * slots NOT touched by the calendar are preserved.
 */
import * as Calendar from 'expo-calendar';
import { addDays, format, parseISO } from 'date-fns';
import { createMMKV } from 'react-native-mmkv';
import type { TimeSlot } from '@/types/planner';

// ─── Slot definitions ────────────────────────────────────────────────────────

const SLOT_HOURS: Record<TimeSlot, [number, number]> = {
  'early-morning':   [7, 9],
  'late-morning':    [9, 12],
  'early-afternoon': [12, 15],
  'late-afternoon':  [15, 18],
  'evening':         [18, 22],
  'late-night':      [22, 26],
};
const ALL_SLOTS = Object.keys(SLOT_HOURS) as TimeSlot[];

// ─── MMKV cache for reconciliation ───────────────────────────────────────────

const cache = createMMKV({ id: 'parade-calendar-sync' });
const LAST_KEYS_KEY = 'lastSyncedSlotKeys'; // JSON-encoded array
const LAST_SYNC_AT  = 'lastSyncAt';         // ISO timestamp

function loadLastKeys(): Set<string> {
  const raw = cache.getString(LAST_KEYS_KEY);
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveLastKeys(keys: Set<string>) {
  cache.set(LAST_KEYS_KEY, JSON.stringify([...keys]));
  cache.set(LAST_SYNC_AT, new Date().toISOString());
}

export function getLastSyncTime(): Date | null {
  const iso = cache.getString(LAST_SYNC_AT);
  return iso ? new Date(iso) : null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hourFloat(d: Date): number {
  return d.getHours() + d.getMinutes() / 60;
}

function slotsForRange(startHour: number, endHour: number): TimeSlot[] {
  const result: TimeSlot[] = [];
  for (const slot of ALL_SLOTS) {
    const [s, e] = SLOT_HOURS[slot];
    if (startHour < e && endHour > s) result.push(slot);
  }
  return result;
}

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

function eventToSlotKeys(event: Calendar.Event): string[] {
  const start = new Date(event.startDate);
  const end   = new Date(event.endDate);

  if (event.allDay) {
    const days = eachDay(start, end);
    return days.flatMap((d) => ALL_SLOTS.map((s) => `${d}:${s}`));
  }

  const startDate = format(start, 'yyyy-MM-dd');
  const endDate   = format(end,   'yyyy-MM-dd');

  if (startDate === endDate) {
    return slotsForRange(hourFloat(start), hourFloat(end)).map((s) => `${startDate}:${s}`);
  }

  // Multi-day timed event
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
  /** Total events fetched from calendar */
  eventsCount:  number;
  /** Net new slot keys marked busy this sync */
  slotsAdded:   number;
  /** Slot keys cleared because their source event disappeared */
  slotsRemoved: number;
  /** Distinct days touched (added OR removed) */
  daysAffected: number;
}

/**
 * Pull events from device calendars for the next `daysAhead` days, mark
 * overlapping Parade slots as busy, and reconcile against the previous
 * sync's slot key set so removed events release their slots.
 */
export async function syncCalendarBusyTimes(
  setAvailability: (date: Date, slot: TimeSlot, available: boolean) => Promise<void>,
  daysAhead: number = 14,
): Promise<SyncResult> {
  // 1. Calendars
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  if (calendars.length === 0) {
    saveLastKeys(new Set());
    return { eventsCount: 0, slotsAdded: 0, slotsRemoved: 0, daysAffected: 0 };
  }
  const calendarIds = calendars.map((c) => c.id);

  // 2. Fetch events in the window
  const startWindow = new Date();
  startWindow.setHours(0, 0, 0, 0);
  const endWindow = addDays(startWindow, daysAhead);

  const events = await Calendar.getEventsAsync(calendarIds, startWindow, endWindow);

  // 3. Compute new slot keys
  const newKeys = new Set<string>();
  for (const ev of events) {
    eventToSlotKeys(ev).forEach((k) => newKeys.add(k));
  }

  // 4. Diff against last sync
  const lastKeys = loadLastKeys();
  const toMarkBusy: string[] = [];
  const toMarkFree: string[] = [];
  for (const k of newKeys) {
    if (!lastKeys.has(k)) toMarkBusy.push(k);
  }
  for (const k of lastKeys) {
    if (!newKeys.has(k)) toMarkFree.push(k);
  }

  // 5. Persist writes in parallel
  const daysAffected = new Set<string>();
  const writes: Promise<void>[] = [];

  for (const key of toMarkBusy) {
    const [dateStr, slot] = key.split(':');
    daysAffected.add(dateStr);
    writes.push(setAvailability(parseISO(dateStr), slot as TimeSlot, false));
  }
  for (const key of toMarkFree) {
    const [dateStr, slot] = key.split(':');
    daysAffected.add(dateStr);
    writes.push(setAvailability(parseISO(dateStr), slot as TimeSlot, true));
  }

  await Promise.all(writes);

  // 6. Save the new set for next reconciliation
  saveLastKeys(newKeys);

  return {
    eventsCount:  events.length,
    slotsAdded:   toMarkBusy.length,
    slotsRemoved: toMarkFree.length,
    daysAffected: daysAffected.size,
  };
}

/** Clear cached sync state — call on sign-out so a new user starts fresh */
export function resetCalendarSyncCache() {
  cache.remove(LAST_KEYS_KEY);
  cache.remove(LAST_SYNC_AT);
}

/**
 * Which calendar event (if any) blocks each slot on a given day — used by
 * the day detail screen to explain busy slots that have no Parade plan.
 * Returns an empty map when calendar permission isn't granted.
 */
export async function getCalendarBusyTitlesForDate(
  dateStr: string,
): Promise<Partial<Record<TimeSlot, string>>> {
  try {
    const perm = await Calendar.getCalendarPermissionsAsync();
    if (!perm.granted) return {};

    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    if (calendars.length === 0) return {};

    const dayStart = parseISO(`${dateStr}T00:00:00`);
    const dayEnd   = parseISO(`${dateStr}T23:59:59`);
    const events = await Calendar.getEventsAsync(
      calendars.map((c) => c.id),
      dayStart,
      dayEnd,
    );

    const out: Partial<Record<TimeSlot, string>> = {};
    for (const ev of events) {
      for (const key of eventToSlotKeys(ev)) {
        const [d, slot] = key.split(':');
        if (d !== dateStr) continue;
        if (!out[slot as TimeSlot]) out[slot as TimeSlot] = ev.title || 'Calendar event';
      }
    }
    return out;
  } catch {
    return {};
  }
}
