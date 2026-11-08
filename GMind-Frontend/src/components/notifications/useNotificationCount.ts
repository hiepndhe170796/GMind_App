import { useContext } from 'react';
import { NotificationCountContext, type CountCtx } from './notification-count-context';

export const useNotificationCount = (): CountCtx => {
  const c = useContext(NotificationCountContext);
  if (!c) throw new Error('NotificationCountProvider is required');
  return c;
};
