/**
 * One-time availability baseline reset.
 *
 * Historical bugs (UTC-shifted trip-deletion release, silent per-slot write
 * failures) left stale all-busy availability rows behind — days where every
 * slot is false but nothing explains it. This pass finds future all-busy
 * rows with NO source (no trip covering the date, no plan on the date, no
 * device-calendar event) and releases them, then never runs again on this
 * device (MMKV flag).
 *
 * Deliberately conservative: any day with a plan, an overlapping trip, or
 * any calendar event is left untouched, and partially-busy days are out of
 * scope (calendar-sync reconciliation and plan unblocking own those).
 */
import { addDays, format } from 'date-fns';
import { createMMKV } from 'react-native-mmkv';
import { supabase } from '@/integrations/supabase/client';
import { getCalendarBusyTitlesForDate } from '@/lib/calendarSync';
import { setDatesAvailability } from '@/lib/tripBusy';

const cache = createMMKV({ id: 'parade-availability-reconcile' });
const DONE_KEY = 'baselineResetV1';

const SLOT_COLUMNS = [
  'early_morning',
  'late_morning',
  'early_afternoon',
  'late_afternoon',
  'evening',
  'late_night',
] as const;

export async function reconcileStaleBusyDays(
  userId: string,
): Promise<{ released: number }> {
  if (cache.getBoolean(DONE_KEY)) return { released: 0 };

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const endStr   = format(addDays(new Date(), 183), 'yyyy-MM-dd');

  // 1. Future rows where ALL six slots are explicitly false
  let query = supabase
    .from('availability')
    .select('date')
    .eq('user_id', userId)
    .gte('date', todayStr)
    .lte('date', endStr);
  for (const col of SLOT_COLUMNS) query = query.eq(col, false);
  const { data: rows, error } = await query;
  if (error) {
    // Leave the flag unset so a transient failure retries next launch
    console.error('[reconcile] failed to load availability rows', error);
    return { released: 0 };
  }

  const allBusyDates = (rows ?? []).map((r: any) => r.date as string);
  if (allBusyDates.length === 0) {
    cache.set(DONE_KEY, true);
    return { released: 0 };
  }

  // 2. Skip dates covered by an existing trip
  const { data: trips } = await supabase
    .from('trips')
    .select('start_date, end_date')
    .eq('user_id', userId)
    .gte('end_date', todayStr);
  const coveredByTrip = (d: string) =>
    (trips ?? []).some((t: any) => t.start_date <= d && t.end_date >= d);

  // 3. Skip dates that have any plan
  const { data: plans } = await supabase
    .from('plans')
    .select('date')
    .eq('user_id', userId)
    .in('date', allBusyDates);
  const planDates = new Set(
    ((plans ?? []) as any[]).map((p) => String(p.date).slice(0, 10)),
  );

  const candidates = allBusyDates.filter(
    (d) => !coveredByTrip(d) && !planDates.has(d),
  );

  // 4. Skip dates with any device-calendar event (an all-day event
  //    legitimately blocks all six slots)
  const stale: string[] = [];
  for (const d of candidates) {
    const cal = await getCalendarBusyTitlesForDate(d);
    if (Object.keys(cal).length === 0) stale.push(d);
  }

  // 5. Release the orphaned days in one bulk write
  if (stale.length > 0) {
    try {
      await setDatesAvailability(userId, stale, true);
    } catch (err) {
      console.error('[reconcile] release failed', err);
      return { released: 0 }; // retry next launch
    }
  }

  cache.set(DONE_KEY, true);
  return { released: stale.length };
}

/** Clear the once-per-device flag — call on sign-out like the sync cache */
export function resetReconcileCache() {
  cache.remove(DONE_KEY);
}
