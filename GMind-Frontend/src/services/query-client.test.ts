import { describe, expect, it } from 'vitest';
import { createQueryClient, isRetryable } from './query-client';

const axiosLike = (opts: { status?: number; code?: string; response?: boolean } = {}) => ({
  isAxiosError: true,
  code: opts.code,
  response: opts.response === false ? undefined : opts.status ? { status: opts.status, data: {} } : undefined,
});

describe('isRetryable', () => {
  it('retries network errors, timeouts and 5xx', () => {
    expect(isRetryable(axiosLike({ response: false }))).toBe(true);           // no response → NETWORK_ERROR
    expect(isRetryable(axiosLike({ code: 'ECONNABORTED', status: 408 }))).toBe(true); // TIMEOUT
    expect(isRetryable(axiosLike({ status: 500 }))).toBe(true);
    expect(isRetryable(axiosLike({ status: 503 }))).toBe(true);
  });
  it('does not retry client errors or non-axios failures', () => {
    expect(isRetryable(axiosLike({ status: 400 }))).toBe(false);
    expect(isRetryable(axiosLike({ status: 403 }))).toBe(false);
    expect(isRetryable(new Error('boom'))).toBe(false);
  });
});

describe('createQueryClient', () => {
  it('applies the configured defaults', () => {
    const client = createQueryClient();
    const q = client.getDefaultOptions().queries!;
    expect(q.staleTime).toBe(30_000);
    expect(q.gcTime).toBe(5 * 60_000);
    expect(q.refetchOnWindowFocus).toBe(true);
    expect(client.getDefaultOptions().mutations?.retry).toBe(false);
  });
  it('retries a retryable failure at most once', () => {
    const client = createQueryClient();
    const retry = client.getDefaultOptions().queries!.retry as (count: number, err: unknown) => boolean;
    const retryable = axiosLike({ status: 500 });
    expect(retry(0, retryable)).toBe(true);
    expect(retry(1, retryable)).toBe(false);
    expect(retry(0, axiosLike({ status: 404 }))).toBe(false);
  });
});
