/**
 * useCalendarAutoSync — runs `syncCalendarBusyTimes` automatically when the
 * app comes to the foreground, provided:
 *   1. Calendar permission has been granted
 *   2. plannerStore has a userId set
 *   3. At least 5 minutes have passed since the last successful sync
 *      (avoids over-syncing on rapid foreground/background toggles)
 *
 * Mount once in the authenticated stack ((app)/_layout.tsx).
 */
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Calendar from 'expo-calendar';
import { usePlannerStore } from '@/stores/plannerStore';
import {
  syncCalendarBusyTimes,
  getLastSyncTime,
} from '@/lib/calendarSync';

const MIN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useCalendarAutoSync() {
  const setAvailability = usePlannerStore((s) => s.setAvailability);
  const userId          = usePlannerStore((s) => s.userId);
  const isRunning       = useRef(false);

  useEffect(() => {
    if (!userId) return;

    const runIfDue = async () => {
      if (isRunning.current) return;

      // Quick permission check (cheap, doesn't prompt)
      const { status } = await Calendar.getCalendarPermissionsAsync();
      if (status !== 'granted') return;

      const last = getLastSyncTime();
      if (last && Date.now() - last.getTime() < MIN_INTERVAL_MS) return;

      isRunning.current = true;
      try {
        await syncCalendarBusyTimes(setAvailability);
      } catch (err) {
        console.warn('[calendar-auto-sync] failed:', err);
      } finally {
        isRunning.current = false;
      }
    };

    // Run once on mount (typical: app opened from cold start)
    runIfDue();

    // Re-run when app returns to foreground
    const handle = (next: AppStateStatus) => {
      if (next === 'active') runIfDue();
    };
    const sub = AppState.addEventListener('change', handle);

    return () => sub.remove();
  }, [userId, setAvailability]);
}
