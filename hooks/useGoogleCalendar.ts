/**
 * useGoogleCalendar (iOS) — mirrors the PWA hook but uses
 * expo-web-browser.openAuthSessionAsync for the OAuth round-trip.
 *
 * Flow:
 *   1. POST /functions/v1/google-calendar-auth → returns Google authUrl
 *   2. Open authUrl in an in-app browser. After Google redirects to the
 *      web app's /google-callback, the web exchanges the code via
 *      google-calendar-callback and saves tokens.
 *   3. User dismisses the auth sheet (or it returns automatically).
 *   4. We re-check connection status to flip UI to "Connected".
 */
import { useState, useEffect, useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

WebBrowser.maybeCompleteAuthSession();

export interface CalendarSyncResult {
  synced: boolean;
  eventsProcessed?: number;
  datesUpdated?: number;
  message?: string;
}

export function useGoogleCalendar() {
  const { session } = useAuth();
  const [isConnected, setIsConnected]   = useState(false);
  const [isLoading, setIsLoading]       = useState(true);
  const [isSyncing, setIsSyncing]       = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<CalendarSyncResult | null>(null);
  const [lastSyncedAt, setLastSyncedAt]     = useState<string | null>(null);
  const [error, setError]                   = useState<string | null>(null);

  const accessToken = session?.access_token;

  const checkConnection = useCallback(async () => {
    if (!accessToken) {
      setIsLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke(
        'google-calendar-events',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (error) throw error;
      setIsConnected(!!data?.connected);
    } catch (err: any) {
      console.error('[google-calendar] checkConnection failed', err);
      setError(err?.message ?? 'Failed to check connection');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { checkConnection(); }, [checkConnection]);

  const connect = useCallback(async () => {
    if (!accessToken) return;
    setIsConnecting(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        'google-calendar-auth',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (error) throw error;
      const authUrl = (data as any)?.authUrl as string | undefined;
      if (!authUrl) throw new Error('No authUrl returned');

      // Open Google's OAuth flow in-app. The web /google-callback page
      // handles the token exchange; we dismiss when the user returns.
      await WebBrowser.openAuthSessionAsync(authUrl, 'parade://calendar-connected', {
        showInRecents: false,
      });

      // Whether the user completed or dismissed, re-check status.
      await checkConnection();
    } catch (err: any) {
      console.error('[google-calendar] connect failed', err);
      setError(err?.message ?? 'Failed to connect');
    } finally {
      setIsConnecting(false);
    }
  }, [accessToken, checkConnection]);

  const disconnect = useCallback(async () => {
    if (!accessToken) return;
    try {
      const { error } = await supabase.functions.invoke(
        'google-calendar-disconnect',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (error) throw error;
      setIsConnected(false);
      setLastSyncResult(null);
      setLastSyncedAt(null);
    } catch (err: any) {
      console.error('[google-calendar] disconnect failed', err);
      setError(err?.message ?? 'Failed to disconnect');
    }
  }, [accessToken]);

  const syncCalendar = useCallback(async (): Promise<CalendarSyncResult> => {
    if (!accessToken || !isConnected) {
      return { synced: false, message: 'Not connected' };
    }
    setIsSyncing(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        'google-calendar-sync',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        },
      );
      if (error) throw error;
      const result: CalendarSyncResult = {
        synced:          !!(data as any)?.synced,
        eventsProcessed: (data as any)?.eventsProcessed,
        datesUpdated:    (data as any)?.datesUpdated,
        message:         (data as any)?.message,
      };
      setLastSyncResult(result);
      if (result.synced) setLastSyncedAt(new Date().toISOString());
      return result;
    } catch (err: any) {
      console.error('[google-calendar] sync failed', err);
      const message = err?.message ?? 'Failed to sync';
      setError(message);
      return { synced: false, message };
    } finally {
      setIsSyncing(false);
    }
  }, [accessToken, isConnected]);

  return {
    isConnected,
    isLoading,
    isSyncing,
    isConnecting,
    error,
    lastSyncResult,
    lastSyncedAt,
    connect,
    disconnect,
    syncCalendar,
    recheckConnection: checkConnection,
  };
}
