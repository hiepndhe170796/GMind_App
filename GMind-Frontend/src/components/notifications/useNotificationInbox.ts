import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { notificationsService, vnToday, type NotificationDto, type NotificationPageDto } from '../../services/notifications';
import { errMsg, status } from '../workspace/utils';
import { useNotificationCount } from './useNotificationCount';
import { getSessionSnapshot } from '../../services/session';
import { qk } from '../../services/query-keys';

const FALLBACK = 'Không tải được thông báo. Vui lòng thử lại.';
const isDenied = (e: unknown) => { const s = status(e); return s === 403 || s === 404; };

/**
 * Cursor-paged inbox backed by GET /api/notifications/page. Older pages load
 * via loadMore(); mark-read mutates the cached pages and refreshes the badge.
 */
export function useNotificationInbox(unreadOnly: boolean, onDenied: () => void) {
  const queryClient = useQueryClient();
  const { refresh: refreshCount, clear: clearCount } = useNotificationCount();
  const uid = getSessionSnapshot()?.user.id ?? '';
  const key = useMemo(() => qk.notifications(uid, unreadOnly), [uid, unreadOnly]);
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  // A denied mark-read clears private content until the key (user/filter) changes.
  const [deniedFor, setDeniedFor] = useState<{ k: typeof key; m: string } | null>(null);
  const [today, setToday] = useState(vnToday);
  const mutation = useRef<string | null>(null);

  const query = useInfiniteQuery<NotificationPageDto, Error, InfiniteData<NotificationPageDto>, typeof key, string | null>({
    queryKey: key,
    queryFn: ({ pageParam }) => notificationsService.page(unreadOnly, pageParam ?? null),
    initialPageParam: null,
    getNextPageParam: last => last.nextCursor,
    enabled: !(deniedFor && deniedFor.k === key),
    refetchInterval: 60_000,
  });
  const queryDenied = !!query.error && isDenied(query.error);
  const denied = (deniedFor && deniedFor.k === key ? deniedFor.m : '')
    || (queryDenied ? errMsg(query.error, FALLBACK) : '');

  // Denied list fetches clear the badge and close open confirmations (no setState).
  useEffect(() => {
    if (queryDenied) { clearCount(); onDenied(); }
  }, [queryDenied, clearCount, onDenied]);

  const items: NotificationDto[] | null = denied
    ? null
    : query.data ? query.data.pages.flatMap(p => p.items) : null;
  const hasData = items !== null;
  const fatal = denied || (!hasData && query.isError ? errMsg(query.error, FALLBACK) : '');
  const refreshError = hasData && query.isError ? errMsg(query.error, FALLBACK) : '';

  const markCached = (id: string | 'all') => {
    queryClient.setQueryData<InfiniteData<NotificationPageDto>>(key, prev => prev && ({
      ...prev,
      pages: prev.pages.map(page => {
        const updated = page.items
          .map(n => (id === 'all' || n.id === id ? { ...n, isRead: true } : n));
        return { ...page, items: unreadOnly ? updated.filter(n => !n.isRead) : updated };
      }),
    }));
  };

  const refresh = useCallback(async () => {
    if (mutation.current || denied) return;
    setToday(vnToday());
    await Promise.all([query.refetch(), refreshCount()]);
  }, [query, refreshCount, denied]);

  const mutate = useCallback(async (id: string | 'all'): Promise<boolean> => {
    if (mutation.current) return false;
    mutation.current = id;
    setPending(id);
    setActionError('');
    setSuccess('');
    try {
      let affected = 0;
      if (id === 'all') affected = await notificationsService.markAllRead();
      else await notificationsService.markRead(id);
      markCached(id);
      setSuccess(id === 'all'
        ? `Đã đánh dấu ${affected} thông báo là đã đọc.`
        : 'Đã đánh dấu thông báo là đã đọc.');
      await Promise.all([queryClient.invalidateQueries({ queryKey: key }), refreshCount(true)]);
      return true;
    } catch (error) {
      const message = errMsg(error, 'Không cập nhật được thông báo. Vui lòng thử lại.');
      if (isDenied(error)) {
        setDeniedFor({ k: key, m: message });
        setActionError('');
        clearCount();
        onDenied();
      } else setActionError(message);
      return false;
    } finally {
      mutation.current = null;
      setPending(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- markCached reads current key/unreadOnly
  }, [key, unreadOnly, queryClient, refreshCount, clearCount, onDenied]);

  return {
    items, fatal, refreshError, actionError, success, pending, today,
    refreshing: query.isRefetching && !query.isFetchingNextPage,
    hasMore: !denied && !!query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: () => { if (!mutation.current) void query.fetchNextPage(); },
    refresh, markOne: (id: string) => mutate(id), markAll: () => mutate('all'),
  };
}
