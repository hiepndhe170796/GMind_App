// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { safeReturnPath } from './return-path';

describe('safeReturnPath', () => {
  it('accepts same-origin paths and keeps query/hash', () => {
    expect(safeReturnPath('/dashboard')).toBe('/dashboard');
    expect(safeReturnPath('/join/ABCD1234?x=1#y')).toBe('/join/ABCD1234?x=1#y');
    expect(safeReturnPath('/groups/g1')).toBe('/groups/g1');
  });
  it('rejects absolute and protocol-relative URLs and backslashes', () => {
    expect(safeReturnPath('https://evil.example/x')).toBeNull();
    expect(safeReturnPath('//evil.example/x')).toBeNull();
    expect(safeReturnPath('\\\\evil')).toBeNull();
    expect(safeReturnPath('/x\\y')).toBeNull();
    expect(safeReturnPath('javascript:alert(1)')).toBeNull();
  });
  it('rejects non-strings, control chars and auth routes', () => {
    expect(safeReturnPath(null)).toBeNull();
    expect(safeReturnPath(42)).toBeNull();
    expect(safeReturnPath(undefined)).toBeNull();
    expect(safeReturnPath('/x\ny')).toBeNull();
    for (const p of ['/login', '/register', '/forgot-password', '/reset-password']) {
      expect(safeReturnPath(p)).toBeNull();
    }
    // auth route as a prefix is still fine — only exact pathname is blocked
    expect(safeReturnPath('/login-help')).toBe('/login-help');
  });
});
