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

/**
 * Picker copy for the six slots — sentence-case label + en-dash range.
 * (TIME_SLOT_LABELS in types/planner.ts uses Title Case + plain hyphen and
 * serves display contexts; keep the two distinct.)
 */
export const SLOT_OPTIONS: { id: TimeSlot; label: string; range: string }[] = [
  { id: 'early-morning',   label: 'Early morning',   range: '7–9am' },
  { id: 'late-morning',    label: 'Late morning',    range: '9am–12pm' },
  { id: 'early-afternoon', label: 'Early afternoon', range: '12–3pm' },
  { id: 'late-afternoon',  label: 'Late afternoon',  range: '3–6pm' },
  { id: 'evening',         label: 'Evening',         range: '6–10pm' },
  { id: 'late-night',      label: 'Late night',      range: '10pm–2am' },
];

/** Sentence-case label per slot, derived from SLOT_OPTIONS. */
export const SLOT_LABEL: Record<TimeSlot, string> = Object.fromEntries(
  SLOT_OPTIONS.map((s) => [s.id, s.label]),
) as Record<TimeSlot, string>;

/** Hour each slot begins — used for sorting. */
export const SLOT_START_HOUR: Record<TimeSlot, number> = {
  'early-morning':   7,
  'late-morning':    9,
  'early-afternoon': 12,
  'late-afternoon':  15,
  'evening':         18,
  'late-night':      22,
};

/** Hour each slot ends (26 = 2am next day for late-night). */
export const SLOT_END_HOUR: Record<TimeSlot, number> = {
  'early-morning':   9,
  'late-morning':    12,
  'early-afternoon': 15,
  'late-afternoon':  18,
  'evening':         22,
  'late-night':      26,
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
