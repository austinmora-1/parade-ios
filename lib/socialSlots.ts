/**
 * Shared "social time" rules for the dashboard.
 *
 * A slot counts as social if it's realistically a hang-out window:
 *   - Any slot on a weekend (Sat/Sun), or
 *   - Evenings on a weekday (evening / late-night).
 *
 * Used by both "Who's around this week" (overlap counting) and
 * "Recommended" (window suggestions) so they agree on what's worth surfacing.
 */
import { TIME_SLOT_LABELS, type TimeSlot } from '@/types/planner';

/** Hour each slot begins — used for sorting. */
export const SLOT_START_HOUR: Record<TimeSlot, number> = {
  'early-morning':   7,
  'late-morning':    9,
  'early-afternoon': 12,
  'late-afternoon':  15,
  'evening':         18,
  'late-night':      22,
};

/** Evenings any day, or any slot on weekends. */
export function isSocialSlot(date: Date, slot: TimeSlot): boolean {
  const dow = date.getDay(); // 0 = Sun, 6 = Sat
  const isWeekend = dow === 0 || dow === 6;
  if (isWeekend) return true;
  return slot === 'evening' || slot === 'late-night';
}

/**
 * Canonical time range for a slot, e.g. 'evening' → "6-10pm".
 * Single source of truth = TIME_SLOT_LABELS.
 */
export function slotRangeLabel(slot: TimeSlot): string {
  return TIME_SLOT_LABELS[slot].time;
}
