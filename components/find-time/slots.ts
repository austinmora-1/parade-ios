/**
 * Pure slot helpers/constants for the find-time wizard.
 */
import { format } from 'date-fns';
import { SLOT_START_HOUR } from '@/lib/socialSlots';
import type { TimeSlot } from '@/types/planner';

export const OVERLAP_DAYS = 182; // ~6 months

export const SLOT_COLS: { col: string; slot: TimeSlot }[] = [
  { col: 'early_morning', slot: 'early-morning' },
  { col: 'late_morning', slot: 'late-morning' },
  { col: 'early_afternoon', slot: 'early-afternoon' },
  { col: 'late_afternoon', slot: 'late-afternoon' },
  { col: 'evening', slot: 'evening' },
  { col: 'late-night' as any, slot: 'late-night' },
];
// note: late_night column name uses underscore
SLOT_COLS[5].col = 'late_night';

export interface GroupSlot {
  date: string;       // yyyy-MM-dd
  slot: TimeSlot;
  freeFriendIds: string[];
}

export const slotKey = (s: { date: string; slot: TimeSlot }) => `${s.date}|${s.slot}`;

export interface MonthGroup {
  key: string;
  label: string;
  days: { date: string; slots: TimeSlot[] }[];
  dayCount: number;
}

// Group overlap slots into month → day → slots for the collapsible tree
export function groupSlotsByMonth(groupSlots: GroupSlot[]): MonthGroup[] {
  const byMonth = new Map<string, Map<string, TimeSlot[]>>();
  for (const gs of groupSlots) {
    const mKey = gs.date.slice(0, 7); // yyyy-MM
    if (!byMonth.has(mKey)) byMonth.set(mKey, new Map());
    const days = byMonth.get(mKey)!;
    if (!days.has(gs.date)) days.set(gs.date, []);
    days.get(gs.date)!.push(gs.slot);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mKey, daysMap]) => {
      const days = [...daysMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, slots]) => ({
          date,
          slots: slots.sort((x, y) => SLOT_START_HOUR[x] - SLOT_START_HOUR[y]),
        }));
      return {
        key: mKey,
        label: format(new Date(`${mKey}-01T12:00:00`), 'MMMM yyyy'),
        days,
        dayCount: days.length,
      };
    });
}
