import { DayAvailability, TimeSlot, LocationStatus, VibeType } from '@/types/planner';
import { format } from 'date-fns';
import type { DefaultAvailabilitySettings } from './types';

/** Map time slots to hour ranges */
export const TIME_SLOT_HOURS: Record<TimeSlot, { start: number; end: number }> = {
  'early-morning': { start: 6, end: 9 },
  'late-morning': { start: 9, end: 12 },
  'early-afternoon': { start: 12, end: 15 },
  'late-afternoon': { start: 15, end: 18 },
  'evening': { start: 18, end: 22 },
  'late-night': { start: 22, end: 26 },
};

const SLOT_COLUMN_MAP: Record<string, string> = {
  'early-morning': 'slot_location_early_morning',
  'late-morning': 'slot_location_late_morning',
  'early-afternoon': 'slot_location_early_afternoon',
  'late-afternoon': 'slot_location_late_afternoon',
  'evening': 'slot_location_evening',
  'late-night': 'slot_location_late_night',
};

export const createDefaultAvailability = (date: Date, settings?: DefaultAvailabilitySettings | null): DayAvailability => {
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getDay()];
  const isWorkDay = settings?.workDays?.includes(dayOfWeek) ?? false;
  const defaultFree = settings?.defaultStatus !== 'unavailable';

  const slots: Record<TimeSlot, boolean> = {
    'early-morning': defaultFree,
    'late-morning': defaultFree,
    'early-afternoon': defaultFree,
    'late-afternoon': defaultFree,
    'evening': defaultFree,
    'late-night': defaultFree,
  };

  if (isWorkDay && settings) {
    const workStart = settings.workStartHour;
    const workEnd = settings.workEndHour;
    for (const [slot, hours] of Object.entries(TIME_SLOT_HOURS)) {
      if (hours.start < workEnd && hours.end > workStart) {
        slots[slot as TimeSlot] = false;
      }
    }
  }

  return { date, slots, locationStatus: 'home' };
};

/** Convert a raw availability DB row to a DayAvailability model */
export const mapAvailabilityRow = (row: any, date: Date): DayAvailability => {
  const slotLocs: Record<string, string | null> = {};
  let hasSlotLocs = false;
  for (const [slot, col] of Object.entries(SLOT_COLUMN_MAP)) {
    const val = row[col] as string | null;
    if (val !== undefined) {
      slotLocs[slot] = val;
      if (val) hasSlotLocs = true;
    }
  }
  return {
    date,
    slots: {
      'early-morning':   row.early_morning   ?? true,
      'late-morning':    row.late_morning    ?? true,
      'early-afternoon': row.early_afternoon ?? true,
      'late-afternoon':  row.late_afternoon  ?? true,
      'evening':         row.evening         ?? true,
      'late-night':      row.late_night      ?? true,
    },
    locationStatus: (row.location_status as LocationStatus) || 'home',
    tripLocation:   row.trip_location || undefined,
    vibe:           row.vibe as VibeType | null || null,
    ...(hasSlotLocs ? { slotLocations: slotLocs } : {}),
  };
};

/** Build a date-string-keyed map from an availability array */
export const buildAvailabilityMap = (availability: DayAvailability[]): Record<string, DayAvailability> => {
  const map: Record<string, DayAvailability> = {};
  for (const a of availability) {
    map[format(a.date, 'yyyy-MM-dd')] = a;
  }
  return map;
};
