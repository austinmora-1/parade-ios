import { QueryClient } from '@tanstack/react-query';

/**
 * Singleton QueryClient. Lives outside the React tree so non-hook code
 * (Zustand stores, services) can read/invalidate the same cache the
 * useQuery hooks use. The root layout's QueryClientProvider uses this
 * instance — do not construct another.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});
