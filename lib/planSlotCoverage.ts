import { TimeSlot } from '@/types/planner';

/**
 * Per-slot coverage analysis for plans. A plan with explicit start/end
 * times can fully or partially cover each fixed time slot. Partial slots
 * still have free sub-windows that we can recommend at lower priority.
 */

export const SLOT_BOUNDS: Record<TimeSlot, { startHr: number; endHr: number }> = {
  'early-morning':   { startHr: 6,  endHr: 9 },
  'late-morning':    { startHr: 9,  endHr: 12 },
  'early-afternoon': { startHr: 12, endHr: 15 },
  'late-afternoon':  { startHr: 15, endHr: 18 },
  'evening':         { startHr: 18, endHr: 22 },
  'late-night':      { startHr: 22, endHr: 26 },
};

export const SLOT_ORDER: TimeSlot[] = [
  'early-morning',
  'late-morning',
  'early-afternoon',
  'late-afternoon',
  'evening',
  'late-night',
];

export type SlotKind = 'busy' | 'partial';

export interface SlotCoverage {
  kind: SlotKind;
  /** Free hour ranges remaining inside this slot. Empty when fully busy. */
  freeRanges: Array<[number, number]>;
}

interface PlanLike {
  timeSlot: TimeSlot;
  startTime?: string | null; // "HH:mm[:ss]"
  endTime?: string | null;
}

/** Parse "HH:mm" / "HH:mm:ss" → decimal hours. Returns null if invalid. */
function parseHourMinute(s: string | null | undefined): number | null {
  if (!s) return null;
  const parts = s.split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1] || '0');
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h + m / 60;
}

/** Subtract a busy interval [bs, be] from a free slot [ss, se]. */
function subtract(
  ss: number,
  se: number,
  bs: number,
  be: number,
): Array<[number, number]> {
  // No overlap
  if (be <= ss || bs >= se) return [[ss, se]];
  const out: Array<[number, number]> = [];
  if (bs > ss) out.push([ss, bs]);
  if (be < se) out.push([be, se]);
  return out;
}

/**
 * Returns coverage for every slot a plan touches. Plans without explicit
 * start/end times fall back to fully covering their stored time_slot.
 */
export function getPlanSlotCoverage(plan: PlanLike): Array<{ slot: TimeSlot } & SlotCoverage> {
  const startH = parseHourMinute(plan.startTime ?? null);
  const endHRaw = parseHourMinute(plan.endTime ?? null);

  if (startH == null || endHRaw == null) {
    return [{ slot: plan.timeSlot, kind: 'busy', freeRanges: [] }];
  }

  // Handle midnight crossover: if end <= start, treat end as next-day extension.
  let endH = endHRaw;
  if (endH <= startH) endH += 24;

  const out: Array<{ slot: TimeSlot } & SlotCoverage> = [];
  for (const slot of SLOT_ORDER) {
    const { startHr: ss, endHr: se } = SLOT_BOUNDS[slot];
    if (endH <= ss || startH >= se) continue; // no overlap

    const fullyCovers = startH <= ss && endH >= se;
    if (fullyCovers) {
      out.push({ slot, kind: 'busy', freeRanges: [] });
      continue;
    }

    const free = subtract(ss, se, Math.max(startH, ss), Math.min(endH, se));
    out.push({ slot, kind: 'partial', freeRanges: free });
  }
  return out;
}

/** Combine per-slot coverages from multiple plans on the same date. */
export function mergeCoverages(
  coverages: Array<Array<{ slot: TimeSlot } & SlotCoverage>>,
): Map<TimeSlot, SlotCoverage> {
  const map = new Map<TimeSlot, SlotCoverage>();
  for (const cov of coverages) {
    for (const c of cov) {
      const existing = map.get(c.slot);
      if (!existing) {
        map.set(c.slot, { kind: c.kind, freeRanges: c.freeRanges.map((r) => [...r] as [number, number]) });
        continue;
      }
      if (existing.kind === 'busy') continue; // already fully busy
      if (c.kind === 'busy') {
        map.set(c.slot, { kind: 'busy', freeRanges: [] });
        continue;
      }
      // Both partial — intersect free ranges
      const intersected = intersectRanges(existing.freeRanges, c.freeRanges);
      if (intersected.length === 0) {
        map.set(c.slot, { kind: 'busy', freeRanges: [] });
      } else {
        map.set(c.slot, { kind: 'partial', freeRanges: intersected });
      }
    }
  }
  return map;
}

function intersectRanges(
  a: Array<[number, number]>,
  b: Array<[number, number]>,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [as, ae] of a) {
    for (const [bs, be] of b) {
      const s = Math.max(as, bs);
      const e = Math.min(ae, be);
      if (e > s) out.push([s, e]);
    }
  }
  return out;
}

/** Format a [startHr, endHr] range as "3-5pm" / "11am-1pm". */
export function formatRange([startHr, endHr]: [number, number]): string {
  return `${fmtHour(startHr)}\u2013${fmtHour(endHr)}`;
}

export function fmtHour(hr: number): string {
  const h24 = ((hr % 24) + 24) % 24;
  const isHalf = Math.abs(h24 - Math.floor(h24)) > 0.01;
  const baseHr = Math.floor(h24);
  if (h24 === 0) return '12am';
  if (h24 < 12) return isHalf ? `${baseHr}:30am` : `${baseHr}am`;
  if (h24 === 12) return isHalf ? '12:30pm' : '12pm';
  const h12 = baseHr - 12;
  return isHalf ? `${h12}:30pm` : `${h12}pm`;
}

/** Total free hours across all sub-ranges. */
export function freeHours(ranges: Array<[number, number]>): number {
  return ranges.reduce((sum, [s, e]) => sum + (e - s), 0);
}
