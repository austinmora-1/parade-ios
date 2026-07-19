/**
 * friendAvailability — the single source of truth for "which friends are
 * mutually free with me on a given date".
 *
 * Historically two surfaces computed this independently: the 7-day dashboard
 * (useFriendDashboardData) and the month-scale Open Weekends card
 * (useFriendWeekendAvailability). They agreed on the *rule* but diverged on the
 * *window* — quick-plan filtered the 7-day dashboard result, so tapping an open
 * slot on a weekend just outside 7 days ("multiple friends free" on the card)
 * showed "no friends free" in quick-plan (XPE-309). This module holds the one
 * predicate every surface calls so they can never disagree again.
 */
import { resolveEffectiveCity, isFriendInMyCity } from '@/lib/effectiveCity';
import { isSocialSlot } from '@/lib/socialSlots';
import { formatDisplayName } from '@/lib/utils';
import type { TimeSlot } from '@/types/planner';

/** DB availability column ↔ TimeSlot enum. */
export const SLOT_KEYS: { col: string; slot: TimeSlot }[] = [
  { col: 'early_morning',   slot: 'early-morning'   },
  { col: 'late_morning',    slot: 'late-morning'    },
  { col: 'early_afternoon', slot: 'early-afternoon' },
  { col: 'late_afternoon',  slot: 'late-afternoon'  },
  { col: 'evening',         slot: 'evening'         },
  { col: 'late_night',      slot: 'late-night'      },
];

export interface FriendLite {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

/** My availability for one date, normalized from either the store or a DB row. */
export interface MyDayAvail {
  slots: Record<TimeSlot, boolean>;
  locationStatus: string | null;
  tripLocation: string | null;
}

/** A friend who shares ≥1 mutual free social slot with me on a date. */
export interface MutualFreeFriend {
  friend: FriendLite;
  slots: TimeSlot[];
}

/** Build a {slot: free} map from a raw availability DB row. */
export function slotsFromRow(row: any): Record<TimeSlot, boolean> {
  const out = {} as Record<TimeSlot, boolean>;
  for (const { col, slot } of SLOT_KEYS) out[slot] = !!row?.[col];
  return out;
}

/**
 * Given my availability + friends' availability for a single date, return the
 * friends I'm mutually free with, each with the specific slots that overlap.
 * A friend counts only if: they have an availability row, we're in the same
 * effective city that day, and there's a slot where BOTH of us are free and
 * it's a realistic social window (isSocialSlot).
 */
export function computeMutualFreeFriends(params: {
  date: string;
  friendUserIds: string[];
  /** key `${userId}|${date}` → raw availability row */
  availByUserDate: Map<string, any>;
  /** userId → profile row (needs first_name/last_name/display_name/avatar_url/home_address) */
  profById: Map<string, any>;
  myAvail: MyDayAvail | null;
  homeAddress: string | null;
}): MutualFreeFriend[] {
  const { date, friendUserIds, availByUserDate, profById, myAvail, homeAddress } = params;

  // Need my own slots + a resolvable city to compute any overlap.
  if (!myAvail) return [];
  const myCity = resolveEffectiveCity({
    date,
    availability: { date, location_status: myAvail.locationStatus, trip_location: myAvail.tripLocation },
    homeAddress,
  });
  if (!myCity) return [];

  const dObj = new Date(`${date}T12:00:00`);
  const out: MutualFreeFriend[] = [];

  for (const fid of friendUserIds) {
    const avRow = availByUserDate.get(`${fid}|${date}`);
    if (!avRow) continue; // no row → can't confirm the friend is free
    const p = profById.get(fid);
    if (!p) continue;

    const sameCity = isFriendInMyCity({
      date,
      myAvailability: { date, location_status: myAvail.locationStatus ?? 'home', trip_location: myAvail.tripLocation ?? null },
      myHomeAddress: homeAddress,
      friendAvailability: { date, location_status: avRow.location_status, trip_location: avRow.trip_location },
      friendHomeAddress: p.home_address ?? null,
    });
    if (!sameCity) continue;

    const slots: TimeSlot[] = [];
    for (const { col, slot } of SLOT_KEYS) {
      if (!avRow[col]) continue;         // friend free in this slot
      if (!myAvail.slots[slot]) continue; // I'm free too
      if (!isSocialSlot(dObj, slot)) continue;
      slots.push(slot);
    }
    if (slots.length > 0) {
      out.push({
        friend: {
          userId: fid,
          name:
            formatDisplayName({
              firstName: p.first_name,
              lastName: p.last_name,
              displayName: p.display_name ?? '',
            }) || 'Friend',
          avatarUrl: p.avatar_url ?? null,
        },
        slots,
      });
    }
  }

  return out;
}
