/**
 * Pure group-overlap computation for the find-time wizard.
 *
 * Strict co-located overlap over the next ~6 months: a slot only shows if
 * I'm free AND every selected friend is free AND we're all in the same city
 * that day. Operates on pre-fetched availability / profile / trip rows.
 */
import { format, addDays } from 'date-fns';
import { isSocialSlot } from '@/lib/socialSlots';
import { resolveEffectiveCity, citiesMatch, normalizeCity } from '@/lib/effectiveCity';
import { OVERLAP_DAYS, SLOT_COLS, type GroupSlot } from '@/components/find-time/slots';

interface ComputeArgs {
  userId: string;
  selectedArr: string[];
  homeAddress: string | null;
  avail: any[] | null;
  profs: any[] | null;
  trips: any[] | null;
}

export function computeGroupSlots({
  userId, selectedArr, homeAddress, avail, profs, trips,
}: ComputeArgs): GroupSlot[] {
  const rowByUserDate = new Map<string, any>();
  for (const r of (avail ?? [])) rowByUserDate.set(`${r.user_id}|${r.date}`, r);
  const homeByUser = new Map<string, string | null>();
  for (const p of (profs ?? [])) homeByUser.set(p.user_id, p.home_address ?? null);
  const tripsByUser = new Map<string, { start: string; end: string; location: string | null }[]>();
  for (const t of (trips ?? [])) {
    const arr = tripsByUser.get(t.user_id) ?? [];
    arr.push({ start: t.start_date, end: t.end_date, location: t.location });
    tripsByUser.set(t.user_id, arr);
  }
  const myHome = homeByUser.get(userId) ?? homeAddress ?? null;

  const tripFor = (uid: string, dateStr: string) =>
    (tripsByUser.get(uid) ?? []).find((t) => t.start <= dateStr && dateStr <= t.end) ?? null;

  // Effective city: a covering trip's destination wins; else availability
  // (away→trip_location) / home_address.
  const cityFor = (uid: string, dateStr: string): string => {
    const trip = tripFor(uid, dateStr);
    if (trip?.location) return normalizeCity(trip.location);
    const row = rowByUserDate.get(`${uid}|${dateStr}`);
    return resolveEffectiveCity({
      date: dateStr,
      availability: row
        ? { date: dateStr, location_status: row.location_status, trip_location: row.trip_location }
        : null,
      homeAddress: homeByUser.get(uid) ?? (uid === userId ? myHome : null),
    });
  };

  // Free: on a trip → available at the destination (the trip-busy flags
  // describe home, not the destination). Otherwise default-free unless an
  // explicit row marks the slot busy.
  const freeFor = (uid: string, dateStr: string, col: string): boolean => {
    if (tripFor(uid, dateStr)) return true;
    const row = rowByUserDate.get(`${uid}|${dateStr}`);
    return row ? !!row[col] : true;
  };

  const results: GroupSlot[] = [];
  for (let i = 0; i < OVERLAP_DAYS; i++) {
    const dateStr = format(addDays(new Date(), i), 'yyyy-MM-dd');
    const dObj = new Date(`${dateStr}T12:00:00`);

    if (selectedArr.length > 0) {
      const myCity = cityFor(userId, dateStr);
      if (!myCity) continue;
      const coLocated = selectedArr.every((fid) => {
        const fc = cityFor(fid, dateStr);
        return !!fc && citiesMatch(myCity, fc);
      });
      if (!coLocated) continue;
    }

    for (const { col, slot } of SLOT_COLS) {
      if (!isSocialSlot(dObj, slot)) continue;
      if (!freeFor(userId, dateStr, col)) continue;
      const allFree = selectedArr.every((fid) => freeFor(fid, dateStr, col));
      if (selectedArr.length > 0 && !allFree) continue;
      results.push({ date: dateStr, slot, freeFriendIds: [...selectedArr] });
    }
  }
  // Return the full ~6-month set — the calendar grid colors every month, so
  // capping here would hide later months (the old ranked-list cap of 30 was
  // exhausted within the current month).
  return results;
}
