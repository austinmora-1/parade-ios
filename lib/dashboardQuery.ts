import { supabase } from '@/integrations/supabase/client';
import { queryClient } from './queryClient';
import { setCachedDashboard } from './dashboardCache';

/**
 * The get_dashboard_data RPC as a React Query query. This is the single
 * fetch path for dashboard state: plannerStore awaits fetchDashboard() and a
 * cache subscriber pushes results into the domain stores, so anything that
 * invalidates ['dashboard'] (see invalidatePlanData) refreshes both the
 * React Query hooks AND the Zustand facade.
 */
export const dashboardKey = (userId: string) => ['dashboard', userId] as const;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    }),
  ]);
}

/** Raw RPC fetch with retry + timeout. Write-through to the MMKV cold-start cache. */
async function fetchDashboardRpc(userId: string): Promise<unknown> {
  let lastError: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await withTimeout(
      Promise.resolve(supabase.rpc('get_dashboard_data' as any, {
        p_user_id: userId,
        p_plan_cursor: null,
      })),
      8000,
      'Dashboard data request'
    );
    const { data, error } = response as { data: any; error: any };
    if (!error) {
      setCachedDashboard(userId, data).catch(() => {});
      return data;
    }
    lastError = error;
    console.warn(`get_dashboard_data attempt ${attempt + 1} failed:`, error.message);
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw lastError instanceof Error ? lastError : new Error(lastError?.message || 'get_dashboard_data failed');
}

/**
 * Fetch (or reuse) the dashboard through the React Query cache. Within
 * staleTime this is a no-network cache read; force bypasses freshness.
 * An invalidated query always refetches regardless of staleTime.
 */
export function fetchDashboard(userId: string, opts?: { force?: boolean }): Promise<unknown> {
  return queryClient.fetchQuery({
    queryKey: dashboardKey(userId),
    queryFn: () => fetchDashboardRpc(userId),
    retry: 0, // fetchDashboardRpc retries internally
    staleTime: opts?.force ? 0 : 120_000,
  });
}

/**
 * Central invalidation for anything that mutates plans (or their
 * participants/proposals). Call after the DB write succeeds. Marks the
 * dashboard query stale — the plannerStore cache subscriber picks up the
 * refetch — and refreshes the per-plan screen queries.
 */
export function invalidatePlanData(planId?: string): Promise<void> {
  const invalidations = [
    // refetchType 'all': the dashboard query has no useQuery observers (stores
    // consume it via the query-cache subscriber), so a plain invalidate would
    // only mark it stale. Forcing the refetch is what pushes fresh data into
    // the Zustand facade after a mutation.
    queryClient.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'all' }),
    queryClient.invalidateQueries({ queryKey: ['day'] }),
    queryClient.invalidateQueries({ queryKey: ['open-invites'] }),
  ];
  if (planId) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: ['plan', planId] }),
      queryClient.invalidateQueries({ queryKey: ['plan-proposal', planId] }),
      queryClient.invalidateQueries({ queryKey: ['plan-change-request', planId] }),
      queryClient.invalidateQueries({ queryKey: ['plan-join-requests', planId] }),
    );
  }
  return Promise.all(invalidations).then(() => {});
}
