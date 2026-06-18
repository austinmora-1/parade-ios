import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { captureError } from '@/integrations/telemetry';

/**
 * Singleton QueryClient. Lives outside the React tree so non-hook code
 * (Zustand stores, services) can read/invalidate the same cache the
 * useQuery hooks use. The root layout's QueryClientProvider uses this
 * instance — do not construct another.
 *
 * Every query/mutation failure flows through the cache-level onError into the
 * single Sentry sink, so we get production visibility without per-call handling.
 */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) =>
      captureError(error, { kind: 'query', queryKey: query.queryKey }),
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) =>
      captureError(error, { kind: 'mutation', mutationKey: mutation.options.mutationKey }),
  }),
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});
