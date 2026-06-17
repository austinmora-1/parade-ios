/**
 * app-group-session — Phase B session bridge (JS side).
 *
 * Mirrors the signed-in user's *non-secret* identity (userId, shareCode,
 * displayName) into the shared App Group `group.app.parade.ios` so the native
 * iMessage extension can build code-bearing universal links for the bubbles it
 * inserts. No Supabase tokens are ever written here — see the Swift module and
 * `lib/sessionBridge.ts`.
 *
 * iOS-only. On any other platform the calls are safe no-ops so callers don't
 * need to guard.
 */
import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

export interface AppGroupSession {
  userId: string;
  shareCode?: string;
  displayName?: string;
}

interface AppGroupSessionNativeModule {
  setSession(userId: string, shareCode: string | null, displayName: string | null): void;
  clearSession(): void;
  getSession(): AppGroupSession | null;
}

// `requireNativeModule` throws if the native module isn't linked (e.g. running
// in Expo Go or on Android). Resolve it lazily and tolerate its absence so a
// missing bridge degrades to generic links rather than crashing auth.
let native: AppGroupSessionNativeModule | null = null;
if (Platform.OS === 'ios') {
  try {
    native = requireNativeModule<AppGroupSessionNativeModule>('AppGroupSession');
  } catch {
    native = null;
  }
}

export function setAppGroupSession(session: AppGroupSession): void {
  native?.setSession(session.userId, session.shareCode ?? null, session.displayName ?? null);
}

export function clearAppGroupSession(): void {
  native?.clearSession();
}

export function getAppGroupSession(): AppGroupSession | null {
  return native?.getSession() ?? null;
}
