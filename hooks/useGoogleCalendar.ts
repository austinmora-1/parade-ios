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

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    try {
      const { data, error } = await supabase.functions.invoke(
        'google-calendar-auth',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          // Belt-and-suspenders: tell the web /google-callback page to
          // deep-link back into the app, AND poll status from here in
          // case ASWebAuthenticationSession ignores the JS-driven
          // navigation (which happens silently on some iOS versions).
          body: { mobile: true, returnUrl: 'parade://calendar-connected?ok=1' },
        },
      );
      if (error) throw error;
      const authUrl = (data as any)?.authUrl as string | undefined;
      if (!authUrl) throw new Error('No authUrl returned');

      // Start polling for connection status every 1.5s. As soon as the
      // server confirms the token was stored, dismiss the in-app browser.
      const pollStarted = Date.now();
      let connectedDetected = false;
      pollTimer = setInterval(async () => {
        // Safety: stop polling after 3 minutes (user abandoned the flow).
        if (Date.now() - pollStarted > 3 * 60 * 1000) {
          if (pollTimer) clearInterval(pollTimer);
          return;
        }
        try {
          const { data: poll } = await supabase.functions.invoke(
            'google-calendar-events',
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          if ((poll as any)?.connected) {
            connectedDetected = true;
            if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
            // Programmatic dismissal of the in-app browser (iOS).
            try { WebBrowser.dismissBrowser(); } catch {}
            try { (WebBrowser as any).dismissAuthSession?.(); } catch {}
          }
        } catch {
          // ignore transient errors while polling
        }
      }, 1500);

      // Open Google's OAuth flow. openAuthSessionAsync still gives the
      // best UX (modal + cookie isolation) and will dismiss either via
      // the parade:// scheme or via our dismissAuthSession call above.
      await WebBrowser.openAuthSessionAsync(authUrl, 'parade://calendar-connected', {
        showInRecents: false,
      });

      // Whether the user completed or cancelled, re-check status.
      await checkConnection();
      if (connectedDetected) {
        // Already connected — surface success haptic.
        setIsConnected(true);
      }
    } catch (err: any) {
      console.error('[google-calendar] connect failed', err);
      setError(err?.message ?? 'Failed to connect');
    } finally {
      if (pollTimer) clearInterval(pollTimer);
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
