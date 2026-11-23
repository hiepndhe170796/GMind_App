import { createContext, useContext } from 'react';
import type { RealtimeChanged, RealtimeDiscussion, RealtimeNotification, RealtimeSessionRevoked, RealtimeStatus } from '../../services/realtime';

export interface RealtimeEvents {
  subscribeNotification(cb: (payload: RealtimeNotification) => void): () => void;
  subscribeChanged(cb: (payload: RealtimeChanged) => void): () => void;
  subscribeSessionRevoked(cb: (payload: RealtimeSessionRevoked) => void): () => void;
  subscribeDiscussion(cb: (payload: RealtimeDiscussion) => void): () => void;
}

export interface RealtimeContextValue extends RealtimeEvents {
  status: RealtimeStatus;
}

export const RealtimeContext = createContext<RealtimeContextValue | null>(null);

/** Realtime status; 'disconnected' when used outside the provider (tests, public pages). */
export function useRealtimeStatus(): RealtimeStatus {
  return useContext(RealtimeContext)?.status ?? 'disconnected';
}

export function useRealtimeEvents(): RealtimeEvents {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('RealtimeProvider is required');
  return ctx;
}
