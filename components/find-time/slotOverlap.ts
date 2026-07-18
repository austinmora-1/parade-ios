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
import { tripAwaySlotsForDay } from '@/lib/tripTimes';
import { OVERLAP_DAYS, SLOT_COLS, type GroupSlot } from '@/components/find-time/slots';
import type { TimeSlot } from '@/types/planner';

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
  const tripsByUser = new Map<
    string,
    { start_date: string; end_date: string; location: string | null; arrival_time: string | null; departure_time: string | null }[]
  >();
  for (const t of (trips ?? [])) {
    const arr = tripsByUser.get(t.user_id) ?? [];
    arr.push({
      start_date: t.start_date,
      end_date: t.end_date,
      location: t.location,
      arrival_time: t.arrival_time ?? null,
      departure_time: t.departure_time ?? null,
    });
    tripsByUser.set(t.user_id, arr);
  }
  const myHome = homeByUser.get(userId) ?? homeAddress ?? null;

  const tripFor = (uid: string, dateStr: string) =>
    (tripsByUser.get(uid) ?? []).find((t) => t.start_date <= dateStr && dateStr <= t.end_date) ?? null;

  // On a travel day (trip start/end with a time set) only some slots are at
  // the destination — the rest are still at the origin. 'all' = whole day.
  const awayAt = (uid: string, dateStr: string, slot: TimeSlot): boolean | null => {
    const trip = tripFor(uid, dateStr);
    if (!trip) return null;
    const away = tripAwaySlotsForDay(trip, dateStr);
    if (away === 'all' || away == null) return away === 'all';
    return away.includes(slot);
  };

  // Effective city, per slot: a covering trip's destination wins for the
  // slots you're actually there; travel-day slots before arrival / after
  // departure fall back to availability (away→trip_location) / home_address.
  const cityFor = (uid: string, dateStr: string, slot?: TimeSlot): string => {
    const trip = tripFor(uid, dateStr);
    const atDestination =
      trip?.location != null &&
      (slot == null
        ? tripAwaySlotsForDay(trip, dateStr) === 'all'
        : awayAt(uid, dateStr, slot) === true);
    if (trip?.location && atDestination) return normalizeCity(trip.location);
    const row = rowByUserDate.get(`${uid}|${dateStr}`);
    // A travel day's origin-side slots shouldn't inherit the day-level
    // away/trip_location row (it describes the destination) — resolve from
    // home instead.
    const originSide = trip != null && slot != null && awayAt(uid, dateStr, slot) === false;
    return resolveEffectiveCity({
      date: dateStr,
      availability: !originSide && row
        ? { date: dateStr, location_status: row.location_status, trip_location: row.trip_location }
        : null,
      homeAddress: homeByUser.get(uid) ?? (uid === userId ? myHome : null),
    });
  };

  // Free: at the destination → available (the trip-busy flags describe home,
  // not the destination). Origin-side slots of a travel day use the normal
  // availability row. Otherwise default-free unless a row marks the slot busy.
  const freeFor = (uid: string, dateStr: string, col: string, slot: TimeSlot): boolean => {
    if (awayAt(uid, dateStr, slot) === true) return true;
    const row = rowByUserDate.get(`${uid}|${dateStr}`);
    return row ? !!row[col] : true;
  };

  const results: GroupSlot[] = [];
  for (let i = 0; i < OVERLAP_DAYS; i++) {
    const dateStr = format(addDays(new Date(), i), 'yyyy-MM-dd');
    const dObj = new Date(`${dateStr}T12:00:00`);

    for (const { col, slot } of SLOT_COLS) {
      if (!isSocialSlot(dObj, slot)) continue;
      // Co-location is checked per slot so a travel day can match friends at
      // the origin in the morning and the destination in the evening.
      if (selectedArr.length > 0) {
        const myCity = cityFor(userId, dateStr, slot);
        if (!myCity) continue;
        const coLocated = selectedArr.every((fid) => {
          const fc = cityFor(fid, dateStr, slot);
          return !!fc && citiesMatch(myCity, fc);
        });
        if (!coLocated) continue;
      }
      if (!freeFor(userId, dateStr, col, slot)) continue;
      const allFree = selectedArr.every((fid) => freeFor(fid, dateStr, col, slot));
      if (selectedArr.length > 0 && !allFree) continue;
      results.push({ date: dateStr, slot, freeFriendIds: [...selectedArr] });
    }
  }
  // Return the full ~6-month set — the calendar grid colors every month, so
  // capping here would hide later months (the old ranked-list cap of 30 was
  // exhausted within the current month).
  return results;
}
