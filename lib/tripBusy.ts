/**
 * Trip availability — bulk writes that block / unblock all 6 time slots
 * across every day a trip covers.
 *
 * Used by:
 *   - new-trip.tsx after trip insert → mark days busy ("away")
 *   - trip/[tripId].tsx after trip delete → mark days free
 *
 * After unblocking (delete path), the caller should ideally also re-trigger
 * calendar sync so any underlying calendar events re-mark their slots busy.
 */
import type { TimeSlot } from '@/types/planner';

const ALL_SLOTS: TimeSlot[] = [
  'early-morning',
  'late-morning',
  'early-afternoon',
  'late-afternoon',
  'evening',
  'late-night',
];

export async function setTripAvailability(
  setAvailability: (date: Date, slot: TimeSlot, available: boolean) => Promise<void>,
  startDate: Date,
  endDate: Date,
  /** false = mark busy (away); true = release */
  available: boolean,
): Promise<{ daysAffected: number; slotsWritten: number }> {
  const writes: Promise<void>[] = [];
  const cursor = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate(),
  );
  const last = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate(),
  );
  let days = 0;

  while (cursor.getTime() <= last.getTime()) {
    const date = new Date(cursor);
    for (const slot of ALL_SLOTS) {
      writes.push(setAvailability(date, slot, available));
    }
    cursor.setDate(cursor.getDate() + 1);
    days++;
  }

  await Promise.all(writes);
  return { daysAffected: days, slotsWritten: writes.length };
}
