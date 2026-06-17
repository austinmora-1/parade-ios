/**
 * useAuth — auth context, provider, and hook.
 * Ported from PWA AuthProvider; window.* replaced with Expo equivalents.
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import type { User, Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from '@/integrations/supabase/client';
import { syncSessionToAppGroup } from '@/lib/sessionBridge';

const AUTH_INIT_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Auth initialization timed out')), ms)
    ),
  ]);
}

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authError: string | null;
  retryAuth: () => void;
  signIn: (email: string, password: string) => ReturnType<typeof supabase.auth.signInWithPassword>;
  signUp: (email: string, password: string, displayName?: string) => ReturnType<typeof supabase.auth.signUp>;
  signOut: () => Promise<{ error: Error | null }>;
  resetPassword: (email: string) => ReturnType<typeof supabase.auth.resetPasswordForEmail>;
  updatePassword: (newPassword: string) => ReturnType<typeof supabase.auth.updateUser>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  const retryAuth = useCallback(() => {
    setAuthError(null);
    setLoading(true);
    setRetryTick((n) => n + 1);
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setAuthError(null);
      setLoading(false);
      // Phase B: mirror identity into the App Group for the iMessage extension
      // (fires on INITIAL_SESSION / SIGNED_IN / TOKEN_REFRESHED / SIGNED_OUT).
      void syncSessionToAppGroup(newSession);
    });

    withTimeout(supabase.auth.getSession(), AUTH_INIT_TIMEOUT_MS)
      .then(({ data: { session: s } }) => {
        setSession((prev) => prev ?? s);
        setUser((prev) => prev ?? (s?.user ?? null));
        setAuthError(null);
      })
      .catch((err) => {
        console.error('[Auth] init failed:', err);
        setAuthError(err?.message || 'Sign-in service took too long to respond.');
      })
      .finally(() => setLoading(false));

    return () => subscription.unsubscribe();
  }, [retryTick]);

  const signIn = useCallback(
    (email: string, password: string) =>
      supabase.auth.signInWithPassword({ email, password }),
    []
  );

  const signUp = useCallback(
    (email: string, password: string, displayName?: string) =>
      supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: Linking.createURL('/'),
          data: displayName ? { display_name: displayName } : undefined,
        },
      }),
    []
  );

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    setSession(null);
    setUser(null);
    // Clear per-user caches so the next sign-in starts fresh
    try {
      const { resetCalendarSyncCache } = await import('@/lib/calendarSync');
      resetCalendarSyncCache();
      const { resetReconcileCache } = await import('@/lib/availabilityReconcile');
      resetReconcileCache();
    } catch {}
    return { error };
  }, []);

  const resetPassword = useCallback(
    (email: string) =>
      supabase.auth.resetPasswordForEmail(email, {
        redirectTo: Linking.createURL('reset-password'),
      }),
    []
  );

  const updatePassword = useCallback(
    (newPassword: string) => supabase.auth.updateUser({ password: newPassword }),
    []
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        authError,
        retryAuth,
        signIn,
        signUp,
        signOut,
        resetPassword,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() must be used inside <AuthProvider>');
  return ctx;
}
