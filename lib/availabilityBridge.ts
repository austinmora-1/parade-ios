/**
 * availabilityBridge — mirror the user's upcoming free social slots into the
 * shared App Group so the iMessage extension's "Share availability" composer
 * can pre-fill the user's REAL availability (the extension has no network and
 * can't query Supabase itself).
 *
 * Source of truth is the availability store's computed map (DB rows + schedule
 * defaults). We push the next 14 days, keeping only free *social* slots (the
 * same rule the dashboard uses), so the extension shows what's actually
 * worth proposing. Non-secret — it's the same data a share link exposes.
 *
 * iOS-only in effect; the native module is a no-op elsewhere.
 */
import { addDays, format } from 'date-fns';
import { setAppGroupAvailability, type AppGroupAvailabilityDay } from '@/modules/app-group-session';
import { isSocialSlot } from '@/lib/socialSlots';
import type { DayAvailability, TimeSlot } from '@/types/planner';

const SLOTS: TimeSlot[] = [
  'early-morning',
  'late-morning',
  'early-afternoon',
  'late-afternoon',
  'evening',
  'late-night',
];

// Covers the extension's longest share range (2 months ≈ 60 days), plus a
// little slack so the calendar's trailing week is fully populated.
const HORIZON_DAYS = 63;

/**
 * Derive the next `HORIZON_DAYS` of free social slots from the availability map
 * and push them to the App Group. Best-effort: never throws into callers.
 */
export function syncAvailabilityToAppGroup(
  availabilityMap: Record<string, DayAvailability>,
): void {
  try {
    const out: AppGroupAvailabilityDay[] = [];
    const today = new Date();
    for (let i = 0; i < HORIZON_DAYS; i++) {
      const date = addDays(today, i);
      const dateStr = format(date, 'yyyy-MM-dd');
      const day = availabilityMap[dateStr];
      if (!day) continue;
      const free = SLOTS.filter((s) => day.slots[s] && isSocialSlot(date, s));
      if (free.length > 0) out.push({ d: dateStr, slots: free });
    }
    setAppGroupAvailability(out);
  } catch (err) {
    console.warn('[availabilityBridge] failed to sync availability to App Group:', err);
  }
}
