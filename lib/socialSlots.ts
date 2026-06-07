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
import type { TimeSlot } from '@/types/planner';

/** Hour each slot begins, used to render a 2-hour window. */
export const SLOT_START_HOUR: Record<TimeSlot, number> = {
  'early-morning':   6,
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
 * Format a 2-hour window starting at the slot's start hour.
 * e.g. 'evening' (18) → "6–8pm", 'late-night' (22) → "10pm–12am".
 */
export function twoHourWindowLabel(slot: TimeSlot): string {
  const start = SLOT_START_HOUR[slot];
  const end = start + 2;
  const fmt = (h: number) => {
    const hh = h % 24;
    const period = hh < 12 || hh === 24 ? 'am' : 'pm';
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return { h12, period };
  };
  const s = fmt(start);
  const e = fmt(end);
  return s.period === e.period
    ? `${s.h12}–${e.h12}${e.period}`
    : `${s.h12}${s.period}–${e.h12}${e.period}`;
}
