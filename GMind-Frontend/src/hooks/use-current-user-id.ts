import { useSyncExternalStore } from 'react';
import { getSessionSnapshot, subscribeSession } from '../services/session';

/** Current signed-in user's id (null when logged out), reactive to session changes. */
export function useCurrentUserId(): string | null {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getSessionSnapshot);
  return session?.user.id ?? null;
}
