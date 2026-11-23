import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import StatusBar from '../components/ui/StatusBar';
import UserAvatar from '../components/account/UserAvatar';
import { Breadcrumb, EmptyState, ErrorState } from '../components/workspace/WorkspaceUI';
import MyTaskRow from '../components/tasks/MyTaskRow';
import { useCurrentUserId } from '../hooks/use-current-user-id';
import { useRemindTask } from '../hooks/use-remind-task';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { riskReason, type RiskReasonKind } from '../components/dashboard/leader-queue-model';
import { qk } from '../services/query-keys';
import { groupsService, type MemberOverviewTask } from '../services/groups';
import { errMsg, status } from '../components/workspace/utils';
import { formatDate, formatDateTime, timestamp } from '../utils/presentation';

const NAV_STATE = { navigationSection: '/groups' };
const ROLE_LABEL: Record<string, string> = { Leader: 'Trưởng nhóm', Member: 'Thành viên' };
const RISK_FLAGS: { key: 'isOverdue' | 'isAtRisk' | 'isStale'; kind: RiskReasonKind; label: string; variant: 'danger' | 'warning' }[] = [
  { key: 'isOverdue', kind: 'Overdue', label: 'Quá hạn', variant: 'danger' },
  { key: 'isAtRisk', kind: 'AtRisk', label: 'Có nguy cơ', variant: 'warning' },
  { key: 'isStale', kind: 'Stale', label: 'Đình trệ', variant: 'warning' },
];
const STATUS_FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'ToDo', label: 'Cần làm' },
  { key: 'InProgress', label: 'Đang làm' },
  { key: 'Submitted', label: 'Chờ duyệt' },
  { key: 'ChangesRequested', label: 'Cần sửa' },
  { key: 'Completed', label: 'Hoàn thành' },
] as const;

export default function MemberDetail() {
  const { groupId = '', userId = '' } = useParams();
  const me = useCurrentUserId() ?? '';
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const groupQ = useQuery({
    queryKey: qk.group(me, groupId),
    queryFn: () => groupsService.get(groupId),
    enabled: !!me && !!groupId,
    retry: (n, e) => status(e) !== 403 && status(e) !== 404 && n < 1,
  });
  const overviewQ = useQuery({
    queryKey: qk.memberOverview(me, groupId, userId),
    queryFn: () => groupsService.memberOverview(groupId, userId),
    enabled: !!me && !!groupId && !!userId,
    retry: (n, e) => status(e) !== 403 && status(e) !== 404 && n < 1,
  });

  const { remindTask, remindingId, isReminded } = useRemindTask({ groupId, memberId: userId });

  const data = overviewQ.data;
  const member = data?.member;
  useDocumentTitle(member?.displayName);
  const topLevel = useMemo(() => (data?.tasks ?? []).filter(t => !t.parentTaskId), [data]);
  const watchlist = useMemo(() => {
    const rank = (t: MemberOverviewTask) => t.isOverdue ? 0 : t.isAtRisk ? 1 : 2;
    const dl = (t: MemberOverviewTask) => t.deadlineAt ? timestamp(t.deadlineAt).getTime() : Number.MAX_SAFE_INTEGER;
    return topLevel.filter(t => t.isOverdue || t.isAtRisk || t.isStale)
      .sort((a, b) => rank(a) - rank(b) || dl(a) - dl(b));
  }, [topLevel]);
  const filtered = useMemo(
    () => statusFilter === 'all' ? topLevel : topLevel.filter(t => t.status === statusFilter),
    [topLevel, statusFilter]);
  const statusCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of topLevel) m.set(t.status, (m.get(t.status) ?? 0) + 1);
    return m;
  }, [topLevel]);

  const loading = groupQ.isPending || overviewQ.isPending;
  const err = overviewQ.isError ? overviewQ.error : groupQ.isError ? groupQ.error : null;
  const errStatus = err ? status(err) : undefined;

  const remindBtn = (t: MemberOverviewTask) => {
    if (!t.permissions?.canRemind) return null;
    if (isReminded(t.id) || t.permissions.remindedRecently) {
      return (
        <Button variant="secondary" size="sm" disabled
          aria-label={`Đã nhắc ${member?.displayName ?? ''} về ${t.title}`}>
          <Icon name="check" size={16} />Đã nhắc
        </Button>
      );
    }
    return (
      <Button variant="secondary" size="sm" isLoading={remindingId === t.id} disabled={!!remindingId}
        aria-label={`Nhắc ${member?.displayName ?? ''} về ${t.title}`}
        onClick={() => remindTask(t.id, member?.displayName ?? 'thành viên')}>Nhắc</Button>
    );
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <Breadcrumb items={[
          { label: 'Nhóm của tôi', to: '/groups' },
          { label: groupQ.data?.name ?? 'Nhóm', to: `/groups/${groupId}` },
          { label: member?.displayName ?? 'Thành viên' },
        ]} hideCurrentBelowSm />

        {loading ? (
          <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
            <p role="status" className="sr-only">Đang tải thông tin thành viên…</p>
            <div className="h-20 rounded-2xl bg-surface-subtle" />
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="h-48 rounded-2xl bg-surface-subtle" />
              <div className="h-48 rounded-2xl bg-surface-subtle" />
            </div>
          </div>
        ) : errStatus === 403 ? (
          <ErrorState message="Bạn không có quyền xem tiến độ của thành viên này."
            backTo={`/groups/${groupId}`} backLabel="Về nhóm" />
        ) : errStatus === 404 ? (
          <ErrorState message="Không tìm thấy thành viên trong nhóm này."
            backTo={`/groups/${groupId}`} backLabel="Về nhóm" />
        ) : err || !data || !member ? (
          <ErrorState message={errMsg(err, 'Không tải được thông tin thành viên.')}
            onRetry={() => { void overviewQ.refetch(); void groupQ.refetch(); }}
            backTo={`/groups/${groupId}`} backLabel="Về nhóm" />
        ) : (
          <>
            <header className="flex flex-wrap items-center gap-4 min-w-0">
              <UserAvatar name={member.displayName} url={member.avatarUrl} size={56} />
              <div className="min-w-0">
                <h2 className="text-title font-semibold text-ink break-words">{member.displayName}</h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Badge value={member.role}>{ROLE_LABEL[member.role] ?? member.role}</Badge>
                  {!member.isActive && <Badge variant="neutral">Đã rời nhóm</Badge>}
                  <span className="text-small text-ink-muted">Tham gia {formatDate(member.joinedAt)}</span>
                </div>
              </div>
            </header>

            <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-w-0 space-y-6">
                <section aria-labelledby="ov-progress">
                  <Card className="p-4 sm:p-6">
                    <h3 id="ov-progress" className="text-lg font-semibold text-ink">Tiến độ công việc</h3>
                    <div className="mt-3">
                      <StatusBar counts={{
                      ToDo: data.summary.toDo, InProgress: data.summary.inProgress,
                      Submitted: data.summary.submitted, ChangesRequested: data.summary.changesRequested,
                      Completed: data.summary.completed,
                    }} />
                    </div>
                    <p className="mt-2 text-small text-ink-secondary">
                      {data.summary.completed}/{data.summary.total} hoàn thành · {data.summary.completionPercent}%
                    </p>
                  </Card>
                </section>

                {watchlist.length > 0 && (
                  <section aria-labelledby="ov-risk">
                    <Card className="p-4 sm:p-6">
                      <h3 id="ov-risk" className="text-lg font-semibold text-ink">Cần theo dõi ({watchlist.length})</h3>
                      <ul className="mt-3 divide-y divide-line">
                        {watchlist.map(t => {
                          const flags = RISK_FLAGS.filter(f => t[f.key]);
                          const reason = riskReason(flags[0]!.kind, t);
                          return (
                            <li key={t.id} className="flex flex-col gap-1.5 py-3 min-w-0 sm:flex-row sm:items-center sm:gap-3">
                              <span className="min-w-0 flex-1">
                                <Link to={`/tasks/${t.id}`} state={NAV_STATE} title={t.title}
                                  className="inline-flex items-center max-sm:min-h-11 max-sm:-my-3 line-clamp-2 text-small font-medium text-ink hover:text-primary-700 [overflow-wrap:anywhere]">
                                  {t.title}
                                </Link>
                                <span className="mt-0.5 block text-caption text-ink-muted">{t.projectName} · {reason}</span>
                                <span className="mt-1.5 flex flex-wrap gap-1.5">
                                  {flags.map(f => <Badge key={f.key} variant={f.variant}>{f.label}</Badge>)}
                                </span>
                              </span>
                              <span className="flex shrink-0 items-center gap-2">
                                {remindBtn(t)}
                                <Link to={`/tasks/${t.id}`} state={NAV_STATE}
                                  className="inline-flex min-h-9 max-sm:min-h-11 max-sm:-my-1 items-center text-small font-medium text-primary-700 hover:underline">
                                  Mở công việc
                                </Link>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </Card>
                  </section>
                )}

                <section aria-labelledby="ov-tasks">
                  <Card className="p-4 sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 id="ov-tasks" className="text-lg font-semibold text-ink">Công việc ({topLevel.length})</h3>
                      <div role="group" aria-label="Lọc theo trạng thái"
                        className="-mx-1 flex flex-nowrap gap-1 overflow-x-auto whitespace-nowrap px-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
                        {STATUS_FILTERS.filter(f => f.key === 'all' || (statusCounts.get(f.key) ?? 0) > 0).map(f => {
                          const n = f.key === 'all' ? topLevel.length : statusCounts.get(f.key)!;
                          return (
                            <button key={f.key} type="button" aria-pressed={statusFilter === f.key}
                              onClick={() => setStatusFilter(f.key)}
                              className={`min-h-9 max-sm:min-h-11 shrink-0 rounded-lg px-3 text-small font-medium ${statusFilter === f.key ? 'bg-primary-50 text-primary-700' : 'text-ink-secondary hover:bg-surface-subtle'}`}>
                              {f.label} <span className="tabular-nums">({n})</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {filtered.length === 0 ? (
                      <EmptyState illustration="tasks" title="Không có công việc nào."
                        body={topLevel.length === 0 ? 'Thành viên này chưa được giao công việc.' : 'Không có công việc ở trạng thái này.'} />
                    ) : (
                      <ul className="mt-2 divide-y divide-line">
                        {filtered.map(t => <MyTaskRow key={t.id} task={t} navState={NAV_STATE} />)}
                      </ul>
                    )}
                  </Card>
                </section>
              </div>

              <div className="min-w-0 space-y-6">
                <section aria-labelledby="ov-points">
                  <Card className="p-4 sm:p-6">
                    <h3 id="ov-points" className="text-lg font-semibold text-ink">Điểm đóng góp</h3>
                    {data.points.projects.length === 0 ? (
                      <p className="mt-3 text-small text-ink-secondary">Chưa có điểm đóng góp nào được ghi nhận.</p>
                    ) : (
                      <ul className="mt-3 space-y-3">
                        {data.points.projects.map(p => (
                          <li key={p.projectId} className="min-w-0">
                            <div className="flex items-baseline justify-between gap-2 min-w-0">
                              <Link to={`/projects/${p.projectId}`} state={NAV_STATE}
                                className="inline-flex items-center max-sm:min-h-11 max-sm:-my-3 truncate text-small font-medium text-ink hover:text-primary-700">{p.projectName}</Link>
                              <span className="shrink-0 text-small font-semibold tabular-nums text-accent-700">{p.memberPoints} điểm</span>
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-subtle" role="img"
                                aria-label={`${p.percent}% điểm đã duyệt của dự án`}>
                                <span className="block h-1.5 rounded-full bg-accent-500" style={{ width: `${Math.min(100, p.percent)}%` }} />
                              </span>
                              <span className="shrink-0 text-caption tabular-nums text-ink-muted">{p.percent}%</span>
                            </div>
                            <p className="mt-0.5 text-caption text-ink-muted">trên tổng {p.projectCreditedPoints} điểm đã duyệt</p>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-4 border-t border-line pt-3 text-caption text-ink-muted">
                      Điểm của công việc được cộng cho người phụ trách khi Trưởng nhóm duyệt.
                    </p>
                  </Card>
                </section>

                <section aria-labelledby="ov-activity">
                  <Card className="p-4 sm:p-6">
                    <h3 id="ov-activity" className="text-lg font-semibold text-ink">Hoạt động gần đây</h3>
                    {data.activity.length === 0 ? (
                      <p className="mt-3 text-small text-ink-secondary">Chưa có hoạt động nào.</p>
                    ) : (
                      <ul className="mt-3 space-y-3">
                        {data.activity.map(a => (
                          <li key={a.id} className="min-w-0">
                            <p className="text-small text-ink [overflow-wrap:anywhere]">{a.summary}</p>
                            <p className="mt-0.5 text-caption text-ink-muted">{formatDateTime(a.createdAt)}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}
