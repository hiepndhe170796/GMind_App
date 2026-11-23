import { QueryClient } from '@tanstack/react-query';
import { normalizeApiError } from './api-errors';

/** Retries only transient failures: network errors, timeouts, and 5xx responses. */
export function isRetryable(error: unknown): boolean {
  const e = normalizeApiError(error);
  return e.code === 'NETWORK_ERROR' || e.code === 'TIMEOUT' || (e.status !== undefined && e.status >= 500);
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (count, err) => count < 1 && isRetryable(err),
      },
      mutations: { retry: false },
    },
  });
}
