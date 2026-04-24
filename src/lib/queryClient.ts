import { QueryClient } from '@tanstack/react-query';

/**
 * AAC use is calm, not real-time. Skip focus-refetching so an iPad tap away
 * doesn't churn; keep data fresh for 30s so a mutation + immediate re-read
 * hits cache.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
