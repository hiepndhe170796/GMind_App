import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import ResponsiveFilters from '../components/ui/ResponsiveFilters';
import UserAvatar from '../components/account/UserAvatar';
import { Breadcrumb, Skeleton, ErrorState, EmptyState } from '../components/workspace/WorkspaceUI';
import { errMsg, status } from '../components/workspace/utils';
import { groupsService, type ActivityItemDto } from '../services/groups';
import { qk } from '../services/query-keys';
import { useCurrentUserId } from '../hooks/use-current-user-id';
import { dayKey, timestamp } from '../utils/presentation';

const CATEGORIES: { value: string; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: 'task', label: 'Công việc' },
  { value: 'status', label: 'Trạng thái & duyệt' },
  { value: 'member', label: 'Thành viên' },
  { value: 'project', label: 'Dự án' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'group', label: 'Nhóm' },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]));

const timeFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false });
const dayFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

function dayHeading(key: string): string {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  if (key === today) return 'Hôm nay';
  if (key === yesterday) return 'Hôm qua';
  const d = new Date(`${key}T12:00:00Z`);
  return dayFmt.format(d);
}

export default function ActivityLogPage() {
  const { id } = useParams<{ id: string }>();
  const me = useCurrentUserId();
  const [params, setParams] = useSearchParams();
  const actor = params.get('actor') ?? '';
  const project = params.get('project') ?? '';
  const category = params.get('category') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const [dateError, setDateError] = useState('');

  const groupQ = useQuery({
    queryKey: qk.group(me ?? '', id ?? ''),
    queryFn: () => groupsService.get(id ?? ''),
    enabled: !!me && !!id,
    retry: (n, e) => status(e) !== 403 && status(e) !== 404 && n < 1,
  });
  const filtersQ = useQuery({
    queryKey: qk.activityFilters(me ?? '', id ?? ''),
    queryFn: () => groupsService.activityLogFilters(id ?? ''),
    enabled: !!me && !!id,
    retry: (n, e) => status(e) !== 403 && status(e) !== 404 && n < 1,
  });
  const filters = useMemo(() => ({ actorId: actor || undefined, projectId: project || undefined,
    category: category || undefined, from: from || undefined, to: to || undefined }),
    [actor, project, category, from, to]);
  const logQ = useInfiniteQuery({
    queryKey: qk.activityLog(me ?? '', id ?? '', { actor, project, category, from, to }),
    queryFn: ({ pageParam }) => groupsService.activityLog(id ?? '', { ...filters, take: 30, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.nextCursor ?? undefined,
    enabled: !!me && !!id,
    retry: (n, e) => status(e) !== 403 && status(e) !== 404 && n < 1,
  });

  const setParam = (key: string, value: string) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  };
  const setDate = (key: 'from' | 'to', value: string) => {
    const next = { from, to, [key]: value };
    if (next.from && next.to && next.from > next.to) { setDateError('Từ ngày phải trước hoặc bằng đến ngày.'); return; }
    setDateError('');
    setParam(key, value);
  };
  const clearFilters = () => { setParams(new URLSearchParams(), { replace: true }); setDateError(''); };
  const hasFilters = !!actor || !!project || !!category || !!from || !!to;

  const items = useMemo(() => (logQ.data?.pages ?? []).flatMap(p => p.items), [logQ.data]);
  const grouped = useMemo(() => {
    const groups = new Map<string, ActivityItemDto[]>();
    for (const item of items) {
      const key = dayKey(timestamp(item.createdAt).toISOString());
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(item);
    }
    return [...groups.entries()];
  }, [items]);
  const activeFilterCount = [actor, project, category, from, to].filter(Boolean).length;

  return (
    <MainLayout>
      <div className="space-y-6">
        <Breadcrumb hideCurrentBelowSm items={[
          { label: 'Nhóm của tôi', to: '/groups' },
          { label: groupQ.data?.name ?? 'Nhóm', to: `/groups/${id}` },
          { label: 'Nhật ký hoạt động' },
        ]} />
        <header>
          <h2 className="text-title font-semibold text-ink">Nhật ký hoạt động</h2>
          <p className="mt-2 text-base text-ink-secondary">Ghi lại các thay đổi quan trọng của nhóm. Chỉ Trưởng nhóm xem được.</p>
        </header>

        {logQ.isError && status(logQ.error) === 403 ? (
          <Card className="p-4 sm:p-6">
            <ErrorState message="Chỉ Trưởng nhóm xem được nhật ký hoạt động của nhóm." backTo={`/groups/${id}`} backLabel="Về nhóm" />
          </Card>
        ) : (
          <>
            <ResponsiveFilters activeCount={activeFilterCount} search={
              <span className="self-center text-sm font-medium text-ink-secondary">Lọc nhật ký hoạt động</span>
            }>
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                <div>
                  <label htmlFor="al-actor" className="block text-sm font-medium text-ink-secondary mb-1">Người thực hiện</label>
                  <select id="al-actor" value={actor} onChange={e => setParam('actor', e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary-600">
                    <option value="">Tất cả</option>
                    {(filtersQ.data?.actors ?? []).map(a => (
                      <option key={a.userId} value={a.userId}>{a.displayName}{a.isActive ? '' : ' (đã rời nhóm)'}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="al-project" className="block text-sm font-medium text-ink-secondary mb-1">Dự án</label>
                  <select id="al-project" value={project} onChange={e => setParam('project', e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary-600">
                    <option value="">Tất cả</option>
                    {(filtersQ.data?.projects ?? []).map(p => (
                      <option key={p.id} value={p.id}>{p.name}{p.isArchived ? ' (đã lưu trữ)' : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="al-category" className="block text-sm font-medium text-ink-secondary mb-1">Loại</label>
                  <select id="al-category" value={category} onChange={e => setParam('category', e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary-600">
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="al-from" className="block text-sm font-medium text-ink-secondary mb-1">Từ ngày</label>
                  <input id="al-from" type="date" value={from} onChange={e => setDate('from', e.target.value)}
                    aria-invalid={!!dateError} aria-describedby={dateError ? 'al-date-err' : undefined}
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary-600" />
                </div>
                <div>
                  <label htmlFor="al-to" className="block text-sm font-medium text-ink-secondary mb-1">Đến ngày</label>
                  <input id="al-to" type="date" value={to} onChange={e => setDate('to', e.target.value)}
                    aria-invalid={!!dateError} aria-describedby={dateError ? 'al-date-err' : undefined}
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary-600" />
                </div>
                <div className="flex items-end justify-end gap-3 md:col-span-3 xl:col-span-1">
                  {hasFilters && (
                    <button type="button" className="min-h-9 text-sm font-medium text-primary-700 hover:underline"
                      onClick={clearFilters}>Xóa bộ lọc</button>
                  )}
                </div>
              </div>
              {dateError && <p id="al-date-err" role="alert" className="mt-3 text-sm text-danger-700">{dateError}</p>}
            </ResponsiveFilters>

            {logQ.isPending ? <Skeleton label="Đang tải nhật ký…" />
              : logQ.isError ? (
                <Card className="p-4 sm:p-6">
                  <ErrorState message={errMsg(logQ.error, 'Không tải được nhật ký hoạt động.')} onRetry={() => void logQ.refetch()} />
                </Card>
              ) : items.length === 0 ? (
                <Card className="p-4 sm:p-6">
                  <EmptyState illustration="search" title="Không có hoạt động phù hợp."
                    body={hasFilters ? 'Thử nới hoặc xóa bộ lọc.' : 'Chưa có hoạt động nào được ghi lại.'}
                    action={hasFilters
                      ? <button className="min-h-9 text-primary-700 font-medium hover:underline" onClick={clearFilters}>Xóa bộ lọc</button>
                      : undefined} />
                </Card>
              ) : (
                <>
                  {grouped.map(([key, rows]) => (
                    <section key={key} aria-label={dayHeading(key)}>
                      <h3 className="text-sm font-semibold text-ink-secondary">{dayHeading(key)}</h3>
                      <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface">
                        {rows.map(a => (
                          <li key={a.id} className="flex items-start gap-3 px-4 py-3 min-w-0">
                            <UserAvatar name={a.actorName} size={24} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm min-w-0">
                                <span className="font-medium text-ink">{a.actorName}</span>
                                {' — '}<span className="text-ink-secondary [overflow-wrap:anywhere]">{a.summary}</span>
                              </p>
                              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
                                <Badge variant="neutral" dot={false}>{CATEGORY_LABEL[a.category ?? ''] ?? a.entityType}</Badge>
                                <span>{timeFmt.format(timestamp(a.createdAt))}</span>
                                {a.projectName && <span>· {a.projectName}</span>}
                                {a.taskId && (
                                  <Link to={`/tasks/${a.taskId}`} className="font-medium text-primary-700 hover:underline">
                                    Mở công việc
                                  </Link>
                                )}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                  <div className="flex justify-center">
                    {logQ.hasNextPage ? (
                      <Button variant="secondary" className="min-h-11" disabled={logQ.isFetchingNextPage}
                        isLoading={logQ.isFetchingNextPage} onClick={() => void logQ.fetchNextPage()}>
                        Tải thêm
                      </Button>
                    ) : (
                      <p className="text-sm text-ink-muted">Đã hiển thị toàn bộ hoạt động.</p>
                    )}
                  </div>
                </>
              )}
          </>
        )}
      </div>
    </MainLayout>
  );
}
