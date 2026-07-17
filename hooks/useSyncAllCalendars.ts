/**
 * useSyncAllCalendars — one-tap "sync everything" orchestrator for the
 * Plans header (XPE-291). Runs every connected calendar source in
 * parallel via Promise.allSettled:
 *   - Device (EventKit) via syncCalendarBusyTimes — only when calendar
 *     permission is already granted (never prompts)
 *   - Google via useGoogleCalendar().syncCalendar() when connected
 *   - Apple/iCloud (Nylas) via useNylasCalendar().syncCalendar() when
 *     connected
 *
 * Note: mounting this hook fires the provider hooks' connection checks —
 * acceptable per the locked spec.
 */
import { useCallback, useEffect, useState } from 'react';
import * as Calendar from 'expo-calendar';
import { usePlannerStore } from '@/stores/plannerStore';
import { syncCalendarBusyTimes } from '@/lib/calendarSync';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { useNylasCalendar } from '@/hooks/useNylasCalendar';

export interface SyncAllOutcome {
  /** True when at least one calendar source was attempted */
  attempted: boolean;
  /** First failure message when any attempted source failed, else null */
  error: string | null;
}

export function useSyncAllCalendars() {
  const google = useGoogleCalendar();
  const nylas  = useNylasCalendar();

  const [isSyncing, setIsSyncing]               = useState(false);
  const [lastError, setLastError]               = useState<string | null>(null);
  const [devicePermission, setDevicePermission] = useState(false);

  // Cheap permission check (never prompts) so anySourceAvailable is
  // meaningful before the first syncAll call.
  useEffect(() => {
    Calendar.getCalendarPermissionsAsync()
      .then(({ granted }) => setDevicePermission(granted))
      .catch(() => {});
  }, []);

  const syncAll = useCallback(async (): Promise<SyncAllOutcome> => {
    setIsSyncing(true);
    setLastError(null);
    try {
      // Re-check device permission at call time (cheap, never prompts)
      let deviceGranted = false;
      try {
        const { granted } = await Calendar.getCalendarPermissionsAsync();
        deviceGranted = granted;
      } catch {
        deviceGranted = false;
      }
      setDevicePermission(deviceGranted);

      const attempts: Promise<void>[] = [];

      if (deviceGranted) {
        attempts.push(
          // Rely on lib/calendarSync's default sync window
          syncCalendarBusyTimes(usePlannerStore.getState().setAvailability).then(() => {}),
        );
      }
      if (google.isConnected) {
        attempts.push(
          google.syncCalendar().then((r) => {
            if (!r.synced) throw new Error(r.message ?? 'Google Calendar sync failed');
          }),
        );
      }
      if (nylas.isConnected) {
        attempts.push(
          nylas.syncCalendar().then((r) => {
            if (!r.synced) throw new Error(r.message ?? 'Apple Calendar sync failed');
          }),
        );
      }

      if (attempts.length === 0) {
        return { attempted: false, error: null };
      }

      const results = await Promise.allSettled(attempts);
      const firstFailure = results.find(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      const error = firstFailure
        ? (firstFailure.reason?.message ?? 'Calendar sync failed')
        : null;
      setLastError(error);
      return { attempted: true, error };
    } finally {
      setIsSyncing(false);
    }
  }, [google.isConnected, google.syncCalendar, nylas.isConnected, nylas.syncCalendar]);

  const anySourceAvailable =
    devicePermission || google.isConnected || nylas.isConnected;

  return { syncAll, isSyncing, anySourceAvailable, lastError };
}
