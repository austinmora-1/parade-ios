/**
 * Recommended free windows — the ranked list of open social slots surfaced
 * as "Recommended". One window per available SOCIAL slot (evenings +
 * weekends), ranked by friend overlap, then soonest date, then earliest slot.
 *
 * Single source of truth shared by the dashboard FreeWindowCard and the
 * Plans-tab Recommended CTA. Pure (no hooks) so callers control the day range
 * and memoization.
 */
import { format } from 'date-fns';
import { isSocialSlot, slotRangeLabel, SLOT_START_HOUR } from '@/lib/socialSlots';
import type { DayAvailability, TimeSlot } from '@/types/planner';
import type { FriendVibe } from '@/hooks/useFriendDashboardData';

const SLOT_ORDER: TimeSlot[] = [
  'early-morning', 'late-morning', 'early-afternoon',
  'late-afternoon', 'evening', 'late-night',
];

export interface RecommendedWindow {
  date: Date;
  dateStr: string;
  slot: TimeSlot;
  /** ≤2-hour window range, e.g. "6–8pm". */
  timeRange: string;
  overlappingFriendIds: string[];
}

export function computeRecommendedWindows(
  days: Date[],
  availability: DayAvailability[],
  friendData: FriendVibe[] | undefined,
  max: number,
): RecommendedWindow[] {
  const results: RecommendedWindow[] = [];

  for (const d of days) {
    const dateStr = format(d, 'yyyy-MM-dd');
    const dayAvail = availability.find(
      (a) => format(a.date, 'yyyy-MM-dd') === dateStr,
    );
    if (!dayAvail) continue;

    const freeSlots = (Object.entries(dayAvail.slots) as [TimeSlot, boolean][])
      .filter(([slot, isFree]) => isFree && isSocialSlot(d, slot))
      .map(([slot]) => slot)
      .sort((a, b) => SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b));

    if (freeSlots.length === 0) continue;

    for (const slot of freeSlots) {
      // Slot-level overlap so the count reflects this exact window
      const overlappingFriendIds = (friendData ?? [])
        .filter((f) => f.overlapSlots.some(
          (o) => o.date === dateStr && o.slot === slot,
        ))
        .map((f) => f.userId);

      results.push({
        date: d,
        dateStr,
        slot,
        timeRange: slotRangeLabel(slot),
        overlappingFriendIds,
      });
    }
  }

  // Sort: most friend overlap first, then soonest date, then earliest slot.
  results.sort(
    (a, b) =>
      b.overlappingFriendIds.length - a.overlappingFriendIds.length ||
      a.date.getTime() - b.date.getTime() ||
      SLOT_START_HOUR[a.slot] - SLOT_START_HOUR[b.slot],
  );
  return results.slice(0, max);
}
