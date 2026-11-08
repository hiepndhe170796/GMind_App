import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationsService, vnToday, type NotificationDto } from '../../services/notifications';
import { errMsg, status } from '../workspace/utils';
import { useNotificationCount } from './useNotificationCount';

export function useNotificationInbox(unreadOnly: boolean, onDenied: () => void) {
  const { refresh: refreshCount, clear: clearCount } = useNotificationCount();
  const [items, setItems] = useState<NotificationDto[] | null>(null);
  const [fatal, setFatal] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [today, setToday] = useState(vnToday);
  const mounted = useRef(false);
  const filter = useRef(unreadOnly);
  const version = useRef(0);
  const mutation = useRef<string | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const hasData = useRef(false);

  const deny = useCallback((message: string) => {
    version.current++;
    inflight.current = null;
    hasData.current = false;
    setItems(null);
    setFatal(message);
    setRefreshError('');
    setActionError('');
    setSuccess('');
    setRefreshing(false);
    clearCount();
    onDenied();
  }, [clearCount, onDenied]);

  const load = useCallback((quiet = true, afterMutation = false): Promise<void> => {
    if (!mounted.current || (mutation.current && !afterMutation)) return Promise.resolve();
    if (inflight.current && !afterMutation) return inflight.current;
    const requestVersion = ++version.current;
    setRefreshing(quiet);
    setToday(vnToday());
    const request = (async () => {
      try {
        const data = await notificationsService.list(filter.current);
        if (!mounted.current || requestVersion !== version.current) return;
        hasData.current = true;
        setItems(data);
        setFatal('');
        setRefreshError('');
      } catch (error) {
        if (!mounted.current || requestVersion !== version.current) return;
        const message = errMsg(error, 'Không tải được thông báo. Vui lòng thử lại.');
        if (status(error) === 403 || status(error) === 404) deny(message);
        else if (quiet && hasData.current) setRefreshError(message);
        else setFatal(message);
      } finally {
        if (mounted.current && requestVersion === version.current) {
          inflight.current = null;
          setRefreshing(false);
        }
      }
    })();
    inflight.current = request;
    return request;
  }, [deny]);

  useEffect(() => {
    mounted.current = true;
    const onFocus = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const timer = setInterval(onFocus, 60_000);
    const requestVersion = version;
    return () => {
      mounted.current = false;
      requestVersion.current++;
      inflight.current = null;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    filter.current = unreadOnly;
    const scheduled = ++version.current;
    inflight.current = null;
    hasData.current = false;
    // Defer the initial request so StrictMode's discarded mount cannot issue it.
    void Promise.resolve().then(() => {
      if (!mounted.current || scheduled !== version.current) return;
      setItems(null);
      setFatal('');
      setSuccess('');
      setActionError('');
      setRefreshError('');
      void load(false);
    });
  }, [unreadOnly, load]);

  const refresh = useCallback(async () => {
    if (mutation.current) return;
    await Promise.all([load(), refreshCount()]);
  }, [load, refreshCount]);

  const mutate = useCallback(async (id: string): Promise<boolean> => {
    if (mutation.current || !mounted.current) return false;
    mutation.current = id;
    setPending(id);
    setActionError('');
    setSuccess('');
    version.current++;
    inflight.current = null;
    setRefreshing(false);
    try {
      let affected = 0;
      if (id === 'all') affected = await notificationsService.markAllRead();
      else await notificationsService.markRead(id);
      if (!mounted.current) return false;
      setItems(previous => {
        if (!previous) return previous;
        const updated = previous.map(n => id === 'all' || n.id === id ? { ...n, isRead: true } : n);
        return filter.current ? updated.filter(n => !n.isRead) : updated;
      });
      setSuccess(id === 'all'
        ? `Đã đánh dấu ${affected} thông báo là đã đọc.`
        : 'Đã đánh dấu thông báo là đã đọc.');
      await Promise.all([load(true, true), refreshCount(true)]);
      return mounted.current;
    } catch (error) {
      if (!mounted.current) return false;
      const message = errMsg(error, 'Không cập nhật được thông báo. Vui lòng thử lại.');
      if (status(error) === 403 || status(error) === 404) deny(message);
      else setActionError(message);
      return false;
    } finally {
      mutation.current = null;
      if (mounted.current) setPending(null);
    }
  }, [deny, load, refreshCount]);

  return {
    items, fatal, refreshError, actionError, success, pending, refreshing, today,
    refresh, markOne: (id: string) => mutate(id), markAll: () => mutate('all'),
  };
}
