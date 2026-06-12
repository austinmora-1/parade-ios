/**
 * One-time availability baseline reset.
 *
 * Historical bugs (UTC-shifted trip-deletion release, silent per-slot write
 * failures, calendar-sync rows outliving their events) left stale busy
 * slots behind. This pass walks the user's availability rows from the
 * start of the current week through +183 days and releases every busy
 * slot with NO attributable source:
 *   - not covered by a blocking plan (via getPlanSlotCoverage, so plans
 *     with explicit start/end times keep their spillover slots)
 *   - not covered by a device calendar event
 *   - not on a day covered by an existing trip (trip days are left as-is —
 *     trips still write away-blocks for friends' views)
 *
 * Runs once per device (MMKV flag, set only after a successful pass so
 * transient failures retry next launch).
 */
import { addDays, format, startOfWeek } from 'date-fns';
import { createMMKV } from 'react-native-mmkv';
import { supabase } from '@/integrations/supabase/client';
import { getCalendarBusySlotKeys } from '@/lib/calendarSync';
import { getPlanSlotCoverage } from '@/lib/planSlotCoverage';
import { toLocalDate } from '@/lib/tripBusy';
import type { TimeSlot } from '@/types/planner';

const cache = createMMKV({ id: 'parade-availability-reconcile' });
// v2: per-slot release (v1 only handled fully-busy future days)
const DONE_KEY = 'baselineResetV2';

const SLOT_COLS: Array<[col: string, slot: TimeSlot]> = [
  ['early_morning',   'early-morning'],
  ['late_morning',    'late-morning'],
  ['early_afternoon', 'early-afternoon'],
  ['late_afternoon',  'late-afternoon'],
  ['evening',         'evening'],
  ['late_night',      'late-night'],
];

const BLOCKING_STATUSES = new Set(['confirmed', 'tentative', 'proposed']);
const LOOKAHEAD_DAYS = 183;

export async function reconcileStaleBusyDays(
  userId: string,
): Promise<{ released: number }> {
  if (cache.getBoolean(DONE_KEY)) return { released: 0 };

  const start = startOfWeek(new Date(), { weekStartsOn: 1 });
  const startStr = format(start, 'yyyy-MM-dd');
  const endStr   = format(addDays(start, LOOKAHEAD_DAYS), 'yyyy-MM-dd');

  const [rowsRes, plansRes, tripsRes] = await Promise.all([
    supabase
      .from('availability')
      .select('date, early_morning, late_morning, early_afternoon, late_afternoon, evening, late_night')
      .eq('user_id', userId)
      .gte('date', startStr)
      .lte('date', endStr),
    supabase
      .from('plans')
      .select('date, time_slot, start_time, end_time, status')
      .eq('user_id', userId)
      .gte('date', startStr)
      .lte('date', endStr),
    supabase
      .from('trips')
      .select('start_date, end_date')
      .eq('user_id', userId)
      .gte('end_date', startStr),
  ]);

  if (rowsRes.error || plansRes.error || tripsRes.error) {
    // Leave the flag unset so a transient failure retries next launch
    console.error('[reconcile] failed to load source data', rowsRes.error || plansRes.error || tripsRes.error);
    return { released: 0 };
  }

  // Busy keys justified by blocking plans
  const planBusy = new Set<string>();
  for (const p of (plansRes.data ?? []) as any[]) {
    if (p.status && !BLOCKING_STATUSES.has(p.status)) continue;
    const dateStr = String(p.date).slice(0, 10);
    const coverage = getPlanSlotCoverage({
      timeSlot: String(p.time_slot ?? '').replace(/_/g, '-') as TimeSlot,
      startTime: p.start_time,
      endTime: p.end_time,
    });
    for (const c of coverage) planBusy.add(`${dateStr}:${c.slot}`);
  }

  // Days covered by a live trip — leave their blocks alone
  const tripDays = new Set<string>();
  for (const t of (tripsRes.data ?? []) as any[]) {
    const last = toLocalDate(t.end_date);
    for (let d = toLocalDate(t.start_date); d.getTime() <= last.getTime(); d = addDays(d, 1)) {
      tripDays.add(format(d, 'yyyy-MM-dd'));
    }
  }

  // Busy keys justified by device calendar events (empty without permission)
  const calendarBusy = await getCalendarBusySlotKeys(start, addDays(start, LOOKAHEAD_DAYS));

  const updates: Record<string, unknown>[] = [];
  let released = 0;
  for (const row of (rowsRes.data ?? []) as any[]) {
    if (tripDays.has(row.date)) continue;
    const upd: Record<string, unknown> = {};
    for (const [col, slot] of SLOT_COLS) {
      if (row[col] !== false) continue; // only explicit busy values
      const key = `${row.date}:${slot}`;
      if (!planBusy.has(key) && !calendarBusy.has(key)) {
        upd[col] = true;
        released++;
      }
    }
    if (Object.keys(upd).length > 0) {
      updates.push({ user_id: userId, date: row.date, ...upd });
    }
  }

  if (updates.length > 0) {
    const { error } = await supabase
      .from('availability')
      .upsert(updates as any, { onConflict: 'user_id,date' });
    if (error) {
      console.error('[reconcile] release failed', error);
      return { released: 0 }; // retry next launch
    }
  }

  cache.set(DONE_KEY, true);
  return { released };
}

/** Clear the once-per-device flag — call on sign-out like the sync cache */
export function resetReconcileCache() {
  cache.remove(DONE_KEY);
}
