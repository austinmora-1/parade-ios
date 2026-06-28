/**
 * Plan overlap detection (XPE-252/253). Parade is slot-based (availability and
 * plans live in 6 fixed time slots), so "overlap" means two active plans share
 * a time slot on the same day — not just a precise clock-time intersection.
 * (A 6pm dinner and a 9pm flight are both "evening"; the user wants the heads-up.)
 * Computed client-side from the planner store — no schema or edge function.
 *
 *   findOverlappingPlans — does a target date+window share a slot with an
 *                          existing active plan? (powers the create-time warning)
 *   freeSlotsOnDate      — which slots on a date are free? (powers "move it to…")
 */
import type { Plan, TimeSlot } from '@/types/planner';
import {
  SLOT_ORDER,
  SLOT_BOUNDS,
  getPlanSlotCoverage,
  parseTimeToHour,
  hourToTimeString,
  fmtHour,
} from '@/lib/planSlotCoverage';

export interface OverlapTarget {
  date: Date;
  timeSlot: TimeSlot;
  startTime?: string | null;
  endTime?: string | null;
}

interface PlanLike {
  timeSlot: TimeSlot;
  startTime?: string | null;
  endTime?: string | null;
}

// Plans that actually hold time. A cancelled plan no longer blocks the slot.
const ACTIVE_STATUSES: ReadonlySet<string> = new Set([
  'confirmed',
  'tentative',
  'proposed',
]);

/** Local y-m-d key so two Dates compare by calendar day, not instant. */
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** The set of time slots a plan occupies (uses explicit times if present, else
 *  the stored slot). Reuses getPlanSlotCoverage so partial spans count too. */
function coveredSlots(p: PlanLike): Set<TimeSlot> {
  const cov = getPlanSlotCoverage({
    timeSlot: p.timeSlot,
    startTime: p.startTime ?? null,
    endTime: p.endTime ?? null,
  });
  return new Set(cov.map((c) => c.slot));
}

/** Active plans on the same calendar day that share a slot with the target. */
export function findOverlappingPlans(
  target: OverlapTarget,
  plans: Plan[],
  excludeId?: string,
): Plan[] {
  const key = dateKey(target.date);
  const targetSlots = coveredSlots(target);
  return plans.filter((p) => {
    if (p.id === excludeId || !ACTIVE_STATUSES.has(p.status)) return false;
    if (dateKey(p.date) !== key) return false;
    for (const slot of coveredSlots(p)) if (targetSlots.has(slot)) return true;
    return false;
  });
}

/** Time slots on `date` with no active plan — candidates to move a plan into. */
export function freeSlotsOnDate(
  date: Date,
  plans: Plan[],
  excludeIds: string[] = [],
): TimeSlot[] {
  const key = dateKey(date);
  const taken = new Set<TimeSlot>();
  for (const p of plans) {
    if (excludeIds.includes(p.id) || !ACTIVE_STATUSES.has(p.status)) continue;
    if (dateKey(p.date) !== key) continue;
    for (const slot of coveredSlots(p)) taken.add(slot);
  }
  return SLOT_ORDER.filter((slot) => !taken.has(slot));
}

/** Default clock-time window ("HH:mm") for a slot — used when moving a plan. */
export function slotWindowTimes(slot: TimeSlot): { startTime: string; endTime: string } {
  const { startHr, endHr } = SLOT_BOUNDS[slot];
  return { startTime: hourToTimeString(startHr), endTime: hourToTimeString(endHr) };
}

/** "3-5pm"-style label for a plan's (or target's) window. */
export function planWindowLabel(p: PlanLike): string {
  const s = parseTimeToHour(p.startTime ?? null);
  const e = parseTimeToHour(p.endTime ?? null);
  if (s != null && e != null) {
    return `${fmtHour(s)}–${fmtHour(e < s ? e + 24 : e)}`;
  }
  const b = SLOT_BOUNDS[p.timeSlot];
  return `${fmtHour(b.startHr)}–${fmtHour(b.endHr)}`;
}
