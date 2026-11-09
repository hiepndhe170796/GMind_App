export function isSafeAvatarUrl(value: string): boolean {
  const unsafeCharacter = Array.from(value).some(char => {
    const code = char.charCodeAt(0);
    return code <= 32 || (code >= 127 && code <= 159);
  });
  if (value.length > 500 || !/^https?:\/\//i.test(value) || unsafeCharacter) return false;
  try {
    const url = new URL(value);
    return !!url.hostname && !url.username && !url.password && ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

export function accountError(error: unknown, fallback: string): string {
  const failure = error as { status?: number; code?: string; message?: unknown } | null;
  if (!failure || (failure.status && failure.status >= 500)) return fallback;
  if (['NETWORK_ERROR', 'TIMEOUT', 'API_UNAVAILABLE'].includes(failure.code ?? '') && typeof failure.message === 'string') return failure.message;
  return fallback;
}
