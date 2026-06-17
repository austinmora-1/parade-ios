/**
 * sessionBridge — Phase B glue between Supabase auth and the App Group.
 *
 * Whenever the auth state changes we mirror the signed-in user's *non-secret*
 * identity (user id + profile share_code + display name) into the shared App
 * Group so the iMessage extension can build code-bearing universal links. On
 * sign-out we clear it. See modules/app-group-session.
 *
 * Wired from hooks/useAuth.tsx onAuthStateChange.
 */
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import {
  setAppGroupSession,
  clearAppGroupSession,
} from '@/modules/app-group-session';

/**
 * Push the current session's identity to the App Group (or clear it when
 * signed out). Best-effort: any failure is logged and swallowed so it can
 * never block the auth flow.
 */
export async function syncSessionToAppGroup(session: Session | null): Promise<void> {
  try {
    const userId = session?.user?.id;
    if (!userId) {
      clearAppGroupSession();
      return;
    }

    // The bubble links need the user's share_code; it lives on the profile,
    // not the session. display_name personalizes future bubble copy.
    const { data } = await supabase
      .from('profiles')
      .select('share_code, display_name')
      .eq('user_id', userId)
      .maybeSingle();

    setAppGroupSession({
      userId,
      shareCode: (data as { share_code?: string | null } | null)?.share_code ?? undefined,
      displayName: (data as { display_name?: string | null } | null)?.display_name ?? undefined,
    });
  } catch (err) {
    console.warn('[sessionBridge] failed to sync session to App Group:', err);
  }
}
