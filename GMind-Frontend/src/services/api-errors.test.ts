import { describe, expect, it } from 'vitest';
import { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { normalizeApiError } from './api-errors';

function axiosErrorWithResponse(status: number, data: unknown, code?: string): AxiosError {
  const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
  const response = {
    status,
    statusText: '',
    data,
    headers: {},
    config,
  } as AxiosResponse;
  return new AxiosError('Request failed', code, config, {}, response);
}

describe('normalizeApiError', () => {
  it('maps a network error without response to NETWORK_ERROR with Vietnamese message', () => {
    const error = new AxiosError('Network Error', 'ERR_NETWORK');
    const result = normalizeApiError(error);
    expect(result.code).toBe('NETWORK_ERROR');
    expect(result.status).toBeUndefined();
    expect(result.message).toContain('Không thể kết nối máy chủ');
  });

  it('maps ECONNABORTED to TIMEOUT', () => {
    const error = new AxiosError('timeout of 30000ms exceeded', 'ECONNABORTED');
    const result = normalizeApiError(error);
    expect(result.code).toBe('TIMEOUT');
    expect(result.message).toContain('Máy chủ phản hồi quá chậm');
  });

  it('maps a 503 proxy body with code API_UNAVAILABLE to API_UNAVAILABLE', () => {
    const error = axiosErrorWithResponse(503, {
      success: false,
      code: 'API_UNAVAILABLE',
      message: 'proxy message',
    });
    const result = normalizeApiError(error);
    expect(result.code).toBe('API_UNAVAILABLE');
    expect(result.status).toBe(503);
    expect(result.message).toContain('GMind.API');
  });

  it('maps a plain 503 Unhealthy body to SERVICE_UNAVAILABLE', () => {
    const error = axiosErrorWithResponse(503, 'Unhealthy');
    const result = normalizeApiError(error);
    expect(result.code).toBe('SERVICE_UNAVAILABLE');
    expect(result.status).toBe(503);
    expect(result.message).toContain('chưa sẵn sàng');
  });

  it('preserves backend envelope message, code, errors and status on 401', () => {
    const error = axiosErrorWithResponse(401, {
      success: false,
      code: 'INVALID_CREDENTIALS',
      message: 'Email hoặc mật khẩu không đúng.',
      errors: ['err-1', 'err-2'],
    });
    const result = normalizeApiError(error);
    expect(result.code).toBe('INVALID_CREDENTIALS');
    expect(result.status).toBe(401);
    expect(result.message).toBe('Email hoặc mật khẩu không đúng.');
    expect(result.errors).toEqual(['err-1', 'err-2']);
  });

  it('maps a 500 HTML error page to a generic message instead of raw HTML', () => {
    const html = '<html><body><h1>Server Error stack trace secret</h1></body></html>';
    const error = axiosErrorWithResponse(500, html);
    const result = normalizeApiError(error);
    expect(result.status).toBe(500);
    expect(result.message).not.toContain('<html>');
    expect(result.message).not.toContain('stack trace');
    expect(result.message).toContain('Vui lòng thử lại');
  });

  it('maps a non-Axios error to a generic safe message', () => {
    const result = normalizeApiError(new Error('raw internal details'));
    expect(result.code).toBe('UNEXPECTED_ERROR');
    expect(result.message).not.toContain('raw internal details');
    expect(result.message).toContain('Vui lòng thử lại');
  });

  it('does not echo secrets, tokens or error internals into the result', () => {
    const error = axiosErrorWithResponse(500, 'password=hunter2 token=abc123 stack');
    const result = normalizeApiError(error);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('abc123');
    expect(serialized).not.toContain('stack');
  });
});
