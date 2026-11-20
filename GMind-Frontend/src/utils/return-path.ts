/**
 * Sanitize a `location.state.from` value into a safe same-origin return path.
 * Rejects absolute URLs, protocol-relative URLs, backslashes, control chars
 * and the auth routes themselves (never loop back into login/register).
 */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  if ([...value].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return null;
  const target = new URL(value, window.location.origin);
  if (target.origin !== window.location.origin) return null;
  if (['/login', '/register', '/forgot-password', '/reset-password'].includes(target.pathname)) return null;
  return target.pathname + target.search + target.hash;
}
