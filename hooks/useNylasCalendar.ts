/**
 * useNylasCalendar (iOS) — connects Apple/iCloud (and optionally Google)
 * Calendar via the existing Nylas edge functions.
 *
 * Flow mirrors useGoogleCalendar: POST nylas-auth → open authUrl in
 * WebBrowser → web /nylas-callback exchanges code → we re-check status.
 */
import { useState, useEffect, useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { CalendarSyncResult } from '@/hooks/useGoogleCalendar';

WebBrowser.maybeCompleteAuthSession();

export type NylasProvider = 'icloud' | 'google';

export function useNylasCalendar() {
  const { session } = useAuth();
  const [isConnected, setIsConnected]       = useState(false);
  const [isLoading, setIsLoading]           = useState(true);
  const [isSyncing, setIsSyncing]           = useState(false);
  const [isConnecting, setIsConnecting]     = useState(false);
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
      const { data, error } = await supabase.functions.invoke('nylas-status', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (error) throw error;
      setIsConnected(!!(data as any)?.connected);
      setError((data as any)?.error ?? null);
    } catch (err: any) {
      console.error('[nylas] checkConnection failed', err);
      setError(err?.message ?? 'Failed to check connection');
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { checkConnection(); }, [checkConnection]);

  const connect = useCallback(
    async (provider: NylasProvider = 'icloud') => {
      if (!accessToken) return;
      setIsConnecting(true);
      setError(null);
      try {
        const { data, error } = await supabase.functions.invoke('nylas-auth', {
          headers: { Authorization: `Bearer ${accessToken}` },
          // mobile:true tells nylas-callback to 302 to parade:// instead of
          // ${origin}/settings — closing the in-app browser cleanly.
          body: { provider, mobile: true, returnUrl: 'parade://calendar-connected?ok=1' },
        });
        if (error) throw error;
        const authUrl = (data as any)?.authUrl as string | undefined;
        if (!authUrl) throw new Error('No authUrl returned');

        await WebBrowser.openAuthSessionAsync(authUrl, 'parade://calendar-connected', {
          showInRecents: false,
        });
        await checkConnection();
      } catch (err: any) {
        console.error('[nylas] connect failed', err);
        setError(err?.message ?? 'Failed to connect');
      } finally {
        setIsConnecting(false);
      }
    },
    [accessToken, checkConnection],
  );

  const disconnect = useCallback(async () => {
    if (!accessToken) return;
    try {
      const { error } = await supabase.functions.invoke('nylas-disconnect', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (error) throw error;
      setIsConnected(false);
      setLastSyncResult(null);
      setLastSyncedAt(null);
      setError(null);
    } catch (err: any) {
      console.error('[nylas] disconnect failed', err);
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
      const { data, error } = await supabase.functions.invoke('nylas-sync', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (error) throw error;

      if (!(data as any)?.synced && ((data as any)?.message ?? '').includes('reconnect')) {
        setIsConnected(false);
        const message = (data as any).message;
        setError(message);
        return { synced: false, message };
      }

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
      console.error('[nylas] sync failed', err);
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
