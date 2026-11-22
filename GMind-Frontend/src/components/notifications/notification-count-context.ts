import { createContext } from 'react';

export interface CountCtx {
  count: number | null;
  loading: boolean;
  error: string;
  refresh(force?: boolean): Promise<void>;
  clear(): void;
  setCount(next: number | null): void;
}
export const NotificationCountContext = createContext<CountCtx | null>(null);
