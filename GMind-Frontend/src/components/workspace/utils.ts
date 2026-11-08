export const errMsg = (e: unknown, fb: string) =>
  typeof (e as { message?: unknown })?.message === 'string' && (e as { message?: unknown }).message ? (e as { message: string }).message : fb;
export const status = (e: unknown) => (e as { status?: number })?.status;
export const initials = (n?: string | null) => (n || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
