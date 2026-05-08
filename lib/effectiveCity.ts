/**
 * Shared rules for resolving a person's "effective city" on a given date,
 * and for deciding whether two people are co-located today.
 *
 * Used by every dashboard surface that filters or labels friends as
 * "around today" so the rules stay identical everywhere.
 */
import { format } from "date-fns";
import {
  citiesMatch,
  getEffectiveCity,
  normalizeCity,
} from "@/lib/locationMatch";

export interface AvailabilityRow {
  date?: string | Date | null;
  location_status?: string | null;
  trip_location?: string | null;
}

export interface ProfileLike {
  home_address?: string | null;
}

/** Format a Date or yyyy-MM-dd string into yyyy-MM-dd. */
function toDateKey(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return format(d, "yyyy-MM-dd");
}

/**
 * Resolve a person's effective city for a given date.
 *
 * Rules (applied in order):
 *  1. If the availability row for that date says `away` and has a
 *     `trip_location`, use that trip location.
 *  2. Otherwise fall back to their `home_address`.
 *  3. Returns "" when nothing can be resolved.
 */
export function resolveEffectiveCity(params: {
  date: Date | string;
  availability?: AvailabilityRow | AvailabilityRow[] | null;
  homeAddress?: string | null;
}): string {
  const { date, availability, homeAddress } = params;
  const dateKey = toDateKey(date);

  let row: AvailabilityRow | undefined;
  if (Array.isArray(availability)) {
    row = availability.find(
      (a) => a?.date != null && toDateKey(a.date as Date | string) === dateKey,
    );
  } else if (availability) {
    row = availability;
  }

  return getEffectiveCity(
    row?.location_status || "home",
    row?.trip_location || null,
    homeAddress || null,
  );
}

/**
 * Decide whether a friend should be treated as co-located with the
 * current user on a given date. Returns false whenever either side's
 * city cannot be resolved — we never assume "available" without
 * confirmation.
 */
export function isFriendInMyCity(params: {
  date: Date | string;
  myAvailability?: AvailabilityRow | AvailabilityRow[] | null;
  myHomeAddress?: string | null;
  friendAvailability?: AvailabilityRow | AvailabilityRow[] | null;
  friendHomeAddress?: string | null;
}): boolean {
  const myCity = resolveEffectiveCity({
    date: params.date,
    availability: params.myAvailability,
    homeAddress: params.myHomeAddress,
  });
  const friendCity = resolveEffectiveCity({
    date: params.date,
    availability: params.friendAvailability,
    homeAddress: params.friendHomeAddress,
  });
  if (!myCity || !friendCity) return false;
  return citiesMatch(myCity, friendCity);
}

// Re-exports so callers only need this module.
export { citiesMatch, normalizeCity };
