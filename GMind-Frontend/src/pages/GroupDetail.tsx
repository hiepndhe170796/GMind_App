import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button, { buttonClasses } from '../components/ui/Button';
import Input from '../components/ui/Input';
import Icon from '../components/ui/Icon';
import ActionMenu from '../components/ui/ActionMenu';
import { Breadcrumb, Skeleton, ErrorState, EmptyState } from '../components/workspace/WorkspaceUI';
import { errMsg, status } from '../components/workspace/utils';
import ConfirmationDialog from '../components/workspace/ConfirmationDialog';
import { groupsService, groupsManage, type InviteListItemDto } from '../services/groups';
import { projectsService, projectsManage } from '../services/projects';
import { loadGroupWorkspace } from '../services/workspace';
import StatusBar from '../components/ui/StatusBar';
import UserAvatar from '../components/account/UserAvatar';
import GroupSettingsDialog from '../components/groups/GroupSettingsDialog';
import { qk } from '../services/query-keys';
import { useToast } from '../components/ui/Toast';
import { useCurrentUserId } from '../hooks/use-current-user-id';
import { formatDate, formatDateTime } from '../utils/presentation';
import { deadlineState } from '../utils/task-time';

const ROLE_NUM = { Leader: 1, Member: 2 } as const;
const PROJECT_STATUS: Record<string, string> = { NotStarted: 'Chưa bắt đầu', InProgress: 'Đang làm', Completed: 'Hoàn thành', Archived: 'Đã lưu trữ' };
const INVITE_STATUS: Record<string, string> = { Active: 'Đang hoạt động', Expired: 'Hết hạn', Exhausted: 'Hết lượt', Revoked: 'Đã thu hồi' };

const RoleBadge = ({ role }: { role: string }) =>
  <Badge variant={role === 'Leader' ? 'accent' : 'neutral'}>{role === 'Leader' ? 'Trưởng nhóm' : 'Thành viên'}</Badge>;

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const me = useCurrentUserId();
  return <MainLayout><GroupWorkspace key={`${id ?? ''}:${me ?? ''}`} id={id ?? ''} userId={me} /></MainLayout>;
}

function GroupWorkspace({ id, userId }: { id: string; userId: string | null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const qc = useQueryClient();
  const routeNotice = (location.state as { notice?: string } | null)?.notice;

  const wsQ = useQuery({
    queryKey: qk.groupWorkspace(userId ?? '', id),
    queryFn: () => loadGroupWorkspace(id),
    enabled: !!userId && !!id,
    retry: (n, e) => status(e) !== 403 && status(e) !== 404 && n < 1,
  });
  const group = wsQ.data?.group;
  const isLeader = group?.myRole === 'Leader';

  const invitesQ = useQuery({
    queryKey: qk.groupInvites(userId ?? '', id),
    queryFn: () => groupsService.listInvites(id),
    enabled: !!userId && !!id && isLeader,
    retry: (n, e) => status(e) !== 403 && status(e) !== 404 && n < 1,
  });
  const archivedQ = useQuery({
    queryKey: qk.archivedProjects(userId ?? '', id),
    queryFn: () => projectsManage.archived(id),
    enabled: !!userId && !!id,
    retry: (n, e) => status(e) !== 403 && status(e) !== 404 && n < 1,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: qk.groupWorkspace(userId ?? '', id) });
    void qc.invalidateQueries({ queryKey: qk.group(userId ?? '', id) });
    void qc.invalidateQueries({ queryKey: qk.archivedProjects(userId ?? '', id) });
    void qc.invalidateQueries({ queryKey: qk.groupInvites(userId ?? '', id) });
    void qc.invalidateQueries({ queryKey: qk.myGroups(userId ?? '') });
    void qc.invalidateQueries({ queryKey: qk.leaderQueue(userId ?? '') });
  };

  const [projOpen, setProjOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dialog, setDialog] = useState<null |
    { kind: 'leave' } |
    { kind: 'remove' | 'role'; memberId: string; memberName: string; toRole?: number } |
    { kind: 'restoreProject'; projectId: string; name: string } |
    { kind: 'revokeInvite'; invite: InviteListItemDto }>(null);
  const [actionError, setActionError] = useState('');

  const writeFailed = (e: unknown, fallback: string) => {
    const s = status(e);
    if (s === 403 || s === 404) {
      setDialog(null);
      toast.error(errMsg(e, 'Bạn không có quyền thực hiện thao tác này.'));
      void wsQ.refetch();
    } else {
      setActionError(errMsg(e, fallback));
    }
  };

  const leaveM = useMutation({
    mutationFn: () => groupsManage.leave(id),
    onSuccess: () => { toast.success('Đã rời nhóm.'); navigate('/groups'); },
    onError: e => { setDialog(null); const s = status(e); if (s === 403 || s === 404) { toast.error(errMsg(e, 'Bạn không có quyền thực hiện thao tác này.')); void wsQ.refetch(); } else toast.error(errMsg(e, 'Không rời được nhóm.')); },
  });
  const removeM = useMutation({
    mutationFn: (memberId: string) => groupsManage.removeMember(id, memberId),
    onSuccess: () => { toast.success('Đã xóa thành viên.'); setDialog(null); invalidate(); },
    onError: e => writeFailed(e, 'Không xóa được thành viên.'),
  });
  const roleM = useMutation({
    mutationFn: ({ memberId, toRole }: { memberId: string; toRole: number }) => groupsManage.changeRole(id, memberId, toRole),
    onSuccess: () => { toast.success('Đã đổi vai trò thành viên.'); setDialog(null); invalidate(); },
    onError: e => writeFailed(e, 'Không đổi được vai trò.'),
  });
  const restoreProjectM = useMutation({
    mutationFn: (projectId: string) => projectsManage.restore(projectId),
    onSuccess: () => { toast.success('Đã khôi phục dự án.'); setDialog(null); invalidate(); },
    onError: e => writeFailed(e, 'Không khôi phục được dự án.'),
  });
  const revokeM = useMutation({
    mutationFn: (inviteId: string) => groupsManage.revokeInvite(inviteId),
    onSuccess: () => { toast.success('Đã thu hồi mã mời.'); setDialog(null); void qc.invalidateQueries({ queryKey: qk.groupInvites(userId ?? '', id) }); },
    onError: e => writeFailed(e, 'Không thu hồi được mã mời.'),
  });

  const projects = wsQ.data?.projects ?? [];
  const progress = wsQ.data?.progress ?? null;
  const activity = (wsQ.data?.activity ?? []).slice(0, 5);
  const invites = invitesQ.data ?? [];
  const archived = archivedQ.data ?? [];
  const activeInvites = invites.filter(i => i.status === 'Active');
  const deadInvites = invites.filter(i => i.status !== 'Active');
  const leaderCount = group?.members.filter(m => m.role === 'Leader').length ?? 0;
  const busy = leaveM.isPending || removeM.isPending || roleM.isPending || restoreProjectM.isPending || revokeM.isPending;
  const meMember = group?.members.find(m => m.userId === userId);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Nhóm của tôi', to: '/groups' }, { label: group?.name ?? 'Nhóm' }]} />
      {wsQ.isPending ? <Skeleton label="Đang tải nhóm…" />
        : wsQ.isError || !group ? (
          <ErrorState
            message={status(wsQ.error) === 403 ? 'Bạn không có quyền xem nhóm này.' : errMsg(wsQ.error, 'Không tải được nhóm.')}
            onRetry={status(wsQ.error) === 403 || status(wsQ.error) === 404 ? undefined : () => void wsQ.refetch()}
            backTo="/groups" backLabel="Về nhóm của tôi" />
        ) : (
          <>
            <header className="flex flex-wrap items-start justify-between gap-3 min-w-0">
              <div className="min-w-0">
                <h2 className="text-title font-semibold text-ink [overflow-wrap:anywhere]">{group.name}</h2>
                {group.description && <p className="mt-1 max-w-[65ch] text-base text-ink-secondary [overflow-wrap:anywhere]">{group.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-secondary">
                  <RoleBadge role={group.myRole} />
                  <span>{group.members.length} thành viên</span>
                  <span>Tạo ngày {formatDate(group.createdAt)}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isLeader && (
                  <Button className="min-h-11 gap-1.5" onClick={() => setProjOpen(true)}>
                    <Icon name="plus" size={16} />Tạo dự án
                  </Button>
                )}
                <Link to={`/groups/${id}/marketplace`} className={buttonClasses({ variant: 'secondary', className: 'min-h-11' })}>Marketplace</Link>
                <ActionMenu
                  label={isLeader ? 'Thêm' : 'Tùy chọn'}
                  items={[
                    ...(isLeader ? [
                      { label: 'Sửa nhóm', onSelect: () => setEditOpen(true) },
                      { label: 'Cài đặt cảnh báo', onSelect: () => setSettingsOpen(true) },
                      { label: 'Lưu trữ nhóm', danger: true, onSelect: () => setArchiveOpen(true) },
                    ] : []),
                    {
                      label: 'Rời nhóm', danger: true,
                      disabled: isLeader && leaderCount <= 1,
                      disabledReason: 'Bạn là Trưởng nhóm duy nhất.',
                      onSelect: () => { setActionError(''); setDialog({ kind: 'leave' }); },
                    },
                  ]}
                />
              </div>
            </header>
            {routeNotice && <p role="status" className="text-sm font-medium text-success-700">{routeNotice}</p>}

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <section className="min-w-0 space-y-6" aria-label="Dự án và tiến độ">
                <div>
                  <h3 className="text-lg font-semibold text-ink">Dự án ({projects.length})</h3>
                  {projects.length === 0 ? (
                    <Card className="mt-3 p-4 sm:p-6"><EmptyState illustration="tasks" title="Chưa có dự án"
                      body={isLeader ? 'Tạo dự án đầu tiên cho nhóm.' : 'Trưởng nhóm sẽ tạo dự án cho nhóm.'} /></Card>
                  ) : (
                    <ul className="mt-3 grid gap-4 md:grid-cols-2">
                      {projects.map(p => {
                        const dl = deadlineState(p.deadlineAt, p.status === 'Archived' ? 'Completed' : undefined);
                        const pct = p.taskCount ? Math.round((p.completedCount / p.taskCount) * 100) : 0;
                        return (
                          <li key={p.id} className="min-w-0">
                            <Link to={`/projects/${p.id}`} className="group block h-full rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600">
                              <Card className="h-full p-4 transition-colors group-hover:border-primary-300">
                                <div className="flex items-start justify-between gap-2 min-w-0">
                                  <h4 className="min-w-0 font-semibold text-ink line-clamp-2 [overflow-wrap:anywhere] group-hover:text-primary-700">{p.name}</h4>
                                  <Badge value={p.status} variant={p.status === 'Archived' ? 'neutral' : undefined}>{PROJECT_STATUS[p.status] ?? p.status}</Badge>
                                </div>
                                {p.subject && <p className="mt-1 text-sm text-ink-secondary">Môn: {p.subject}</p>}
                                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-subtle" aria-hidden="true">
                                  <div className="h-full rounded-full bg-primary-500" style={{ width: `${pct}%` }} />
                                </div>
                                <p className="mt-1.5 text-sm text-ink-secondary">
                                  {p.completedCount}/{p.taskCount} công việc hoàn thành
                                  {p.deadlineAt && (
                                    <span className={dl.kind === 'overdue' ? 'font-medium text-danger-700' : dl.kind === 'today' ? 'font-medium text-warning-700' : ''}>
                                      {' · '}{dl.label || `Hạn ${formatDate(p.deadlineAt)}`}
                                    </span>
                                  )}
                                </p>
                              </Card>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {archived.length > 0 && <ArchivedProjects rows={archived} canRestore={isLeader}
                  onRestore={(p) => { setActionError(''); setDialog({ kind: 'restoreProject', projectId: p.id, name: p.name }); }} />}

                {isLeader && progress && (
                  <Card className="p-4 sm:p-6">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-semibold text-ink">Tiến độ thành viên</h3>
                      <p className="text-sm text-ink-secondary">
                        {progress.completedTasks}/{progress.totalTasks} hoàn thành · {Math.round(progress.percentComplete)}%
                        {progress.unassignedTasks > 0 && <span className="text-warning-700"> · {progress.unassignedTasks} chưa giao</span>}
                      </p>
                    </div>
                    <div className="mt-3 hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_5.5rem_4.5rem_4.5rem] gap-x-3 border-b border-line pb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted sm:grid">
                      <span>Thành viên</span><span>Trạng thái</span>
                      <span className="text-right">Hoàn thành</span>
                      <span className="text-right">Quá hạn</span>
                      <span className="text-right">Nguy cơ</span>
                    </div>
                    <ul className="divide-y divide-line">
                      {progress.members.map(m => {
                        const toDo = m.total - m.inProgress - m.submitted - m.completed - m.changesRequested;
                        return (
                          <li key={m.userId}
                            className="grid gap-y-2 py-3 min-w-0 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_5.5rem_4.5rem_4.5rem] sm:items-center sm:gap-x-3 sm:gap-y-0">
                            <span className="min-w-0">
                              <Link to={`/groups/${id}/members/${m.userId}`}
                                className="text-sm font-medium text-primary-700 hover:underline [overflow-wrap:anywhere]">
                                {m.displayName}
                              </Link>
                              {!m.isActiveMember && <span className="text-sm text-ink-secondary"> (đã rời nhóm)</span>}
                            </span>
                            <StatusBar size="sm" showLegend={false} counts={{
                              ToDo: Math.max(0, toDo), InProgress: m.inProgress, Submitted: m.submitted,
                              ChangesRequested: m.changesRequested, Completed: m.completed,
                            }} />
                            <p className="text-small text-ink-secondary sm:hidden">
                              <span className="tabular-nums">{m.completed}/{m.total} hoàn thành</span>
                              {' · '}<span className={`tabular-nums ${m.overdue > 0 ? 'font-medium text-danger-700' : ''}`}>{m.overdue} quá hạn</span>
                              {' · '}<span className={`tabular-nums ${(m.atRisk ?? 0) > 0 ? 'font-medium text-warning-700' : ''}`}>{m.atRisk ?? 0} có nguy cơ</span>
                            </p>
                            <span className="hidden text-sm tabular-nums text-ink-secondary sm:block sm:text-right">{m.completed}/{m.total}</span>
                            <span className={`hidden text-sm tabular-nums sm:block sm:text-right ${m.overdue > 0 ? 'font-medium text-danger-700' : 'text-ink-secondary'}`}>{m.overdue}</span>
                            <span className={`hidden text-sm tabular-nums sm:block sm:text-right ${(m.atRisk ?? 0) > 0 ? 'font-medium text-warning-700' : 'text-ink-secondary'}`}>{m.atRisk ?? 0}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                )}

                {isLeader && (
                  <Card className="p-4 sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold text-ink">Hoạt động gần đây</h3>
                      <Link to={`/groups/${id}/activity`} className="min-h-9 inline-flex items-center text-sm font-medium text-primary-700 hover:underline">
                        Xem nhật ký đầy đủ
                      </Link>
                    </div>
                    {activity.length === 0 ? <p className="mt-2 text-sm text-ink-secondary">Chưa có hoạt động.</p> : (
                      <ul className="mt-3 divide-y divide-line">
                        {activity.map(a => (
                          <li key={a.id} className="flex items-start gap-2.5 py-2.5 text-sm min-w-0">
                            <UserAvatar name={a.actorName} size={24} />
                            <span className="min-w-0 flex-1">
                              <span className="font-medium text-ink [overflow-wrap:anywhere]">{a.actorName}</span>
                              {' — '}<span className="text-ink-secondary [overflow-wrap:anywhere]">{a.summary}</span>
                            </span>
                            <span className="shrink-0 text-xs text-ink-muted">{formatDateTime(a.createdAt)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                )}
              </section>

              <aside className="min-w-0 space-y-6">
                <Card className="p-4 sm:p-6">
                  <h3 className="font-semibold text-ink">Thành viên ({group.members.length})</h3>
                  <ul className="mt-3 divide-y divide-line">
                    {group.members.map(m => {
                      const isMe = m.userId === userId;
                      const soleLeader = m.role === 'Leader' && leaderCount <= 1;
                      return (
                        <li key={m.userId} className="flex items-center gap-2.5 py-2.5 min-w-0">
                          <UserAvatar name={m.displayName} url={m.avatarUrl} size={32} />
                          <span className="min-w-0 flex-1">
                            {(isLeader || isMe) ? (
                              <Link to={`/groups/${id}/members/${m.userId}`}
                                className="text-sm font-medium text-primary-700 hover:underline [overflow-wrap:anywhere]">
                                {m.displayName}
                              </Link>
                            ) : (
                              <span className="text-sm font-medium text-ink [overflow-wrap:anywhere]">{m.displayName}</span>
                            )}
                            {isMe && <span className="text-sm text-ink-secondary"> (bạn)</span>}
                            <span className="mt-0.5 flex flex-wrap items-center gap-2">
                              <RoleBadge role={m.role} />
                              {isLeader && m.openTaskCount != null && m.openTaskCount > 0 && (
                                <span className="text-xs text-ink-secondary">{m.openTaskCount} việc đang mở</span>
                              )}
                            </span>
                          </span>
                          {isLeader && !isMe && (
                            <ActionMenu
                              label={<Icon name="more-horizontal" size={20} aria-hidden />}
                              ariaLabel={`Thao tác với ${m.displayName}`}
                              chevron={false}
                              triggerClassName={buttonClasses({ variant: 'ghost', size: 'sm', className: 'min-h-11 min-w-11 px-0 sm:min-h-9 sm:min-w-9' })}
                              items={[
                                m.role === 'Leader'
                                  ? { label: 'Hạ vai trò', onSelect: () => { setActionError(''); setDialog({ kind: 'role', memberId: m.userId, memberName: m.displayName, toRole: ROLE_NUM.Member }); } }
                                  : { label: 'Làm trưởng nhóm', onSelect: () => { setActionError(''); setDialog({ kind: 'role', memberId: m.userId, memberName: m.displayName, toRole: ROLE_NUM.Leader }); } },
                                {
                                  label: 'Xóa khỏi nhóm', danger: true,
                                  disabled: soleLeader, disabledReason: 'Bạn là Trưởng nhóm duy nhất.',
                                  onSelect: () => { setActionError(''); setDialog({ kind: 'remove', memberId: m.userId, memberName: m.displayName }); },
                                },
                              ]}
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </Card>

                {isLeader && (
                  <Card className="p-4 sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold text-ink">Mã mời</h3>
                      <Button size="sm" variant="secondary" className="min-h-9 gap-1" onClick={() => setInviteOpen(true)}>
                        <Icon name="plus" size={14} />Tạo mã mời
                      </Button>
                    </div>
                    {invitesQ.isPending ? <p className="mt-2 text-sm text-ink-secondary">Đang tải…</p>
                      : invites.length === 0 ? <p className="mt-2 text-sm text-ink-secondary">Chưa có mã mời nào.</p>
                        : (
                          <>
                            <ul className="mt-3 divide-y divide-line">
                              {activeInvites.map(i => <InviteRow key={i.id} invite={i}
                                onRevoke={() => { setActionError(''); setDialog({ kind: 'revokeInvite', invite: i }); }} />)}
                            </ul>
                            {deadInvites.length > 0 && (
                              <details className="mt-4 border-t border-line pt-3">
                                <summary className="min-h-9 cursor-pointer text-sm font-medium text-ink-secondary hover:text-ink">
                                  Mã không còn hiệu lực ({deadInvites.length})
                                </summary>
                                <ul className="mt-1 divide-y divide-line">
                                  {deadInvites.map(i => <InviteRow key={i.id} invite={i} />)}
                                </ul>
                              </details>
                            )}
                          </>
                        )}
                  </Card>
                )}
              </aside>
            </div>

            {projOpen && <ProjectDialog groupId={id} busy={busy} onClose={() => setProjOpen(false)} onCreated={() => { setProjOpen(false); toast.success('Đã tạo dự án.'); invalidate(); }} />}
            {editOpen && <EditGroupDialog groupId={id} initialName={group.name} initialDesc={group.description ?? ''}
              onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); toast.success('Đã cập nhật nhóm.'); invalidate(); }} />}
            {archiveOpen && <ArchiveGroupDialog groupId={id} name={group.name} onClose={() => setArchiveOpen(false)} />}
            {inviteOpen && <InviteDialog groupId={id} onClose={() => { setInviteOpen(false); void qc.invalidateQueries({ queryKey: qk.groupInvites(userId ?? '', id) }); }} />}
            {settingsOpen && (
              <GroupSettingsDialog groupId={id} open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={invalidate} />
            )}

            <ConfirmationDialog open={!!dialog} busy={busy} onClose={() => { if (!busy) setDialog(null); }}
              title={dialog?.kind === 'leave' ? 'Rời nhóm'
                : dialog?.kind === 'remove' ? 'Xóa thành viên'
                  : dialog?.kind === 'role' ? 'Đổi vai trò'
                    : dialog?.kind === 'restoreProject' ? 'Khôi phục dự án'
                      : 'Thu hồi mã mời'}>
              {dialog?.kind === 'leave' && (
                <p>
                  Bạn sẽ rời nhóm "{group.name}".
                  {(meMember?.openTaskCount ?? 0) > 0 && ` ${meMember!.openTaskCount} công việc chưa hoàn thành của bạn sẽ chuyển về Chưa giao và các yêu cầu Marketplace đang hoạt động sẽ bị hủy.`}
                  {(meMember?.openTaskCount ?? 0) === 0 && ' Các yêu cầu Marketplace đang hoạt động của bạn sẽ bị hủy.'}
                </p>
              )}
              {dialog?.kind === 'remove' && (
                <p>
                  Xóa {dialog.memberName} khỏi nhóm "{group.name}"?
                  {(() => { const n = group.members.find(x => x.userId === dialog.memberId)?.openTaskCount ?? 0;
                    return n > 0 ? ` ${n} công việc chưa hoàn thành của họ sẽ chuyển về Chưa giao và các yêu cầu Marketplace đang hoạt động sẽ bị hủy.` : ' Các yêu cầu Marketplace đang hoạt động của họ sẽ bị hủy.'; })()}
                </p>
              )}
              {dialog?.kind === 'role' && <p>{dialog.toRole === ROLE_NUM.Member ? `Hạ ${dialog.memberName} xuống Thành viên?` : `Nâng ${dialog.memberName} lên Trưởng nhóm?`}</p>}
              {dialog?.kind === 'restoreProject' && <p>Khôi phục dự án "{dialog.name}"? Dự án sẽ hiện lại trong danh sách hoạt động của nhóm.</p>}
              {dialog?.kind === 'revokeInvite' && <p>Thu hồi mã mời{(dialog.invite.label ? ` "${dialog.invite.label}"` : '')}? Người có mã cũ sẽ không tham gia được — cần tạo mã mới nếu đổi ý.</p>}
              {actionError && <p role="alert" className="mt-3 text-sm text-danger-700 [overflow-wrap:anywhere]">{actionError}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant={dialog?.kind === 'role' || dialog?.kind === 'restoreProject' ? 'primary' : 'danger'}
                  className="min-h-11" disabled={busy}
                  isLoading={busy}
                  onClick={() => {
                    if (!dialog) return;
                    if (dialog.kind === 'leave') leaveM.mutate();
                    else if (dialog.kind === 'remove') removeM.mutate(dialog.memberId);
                    else if (dialog.kind === 'role') roleM.mutate({ memberId: dialog.memberId, toRole: dialog.toRole! });
                    else if (dialog.kind === 'restoreProject') restoreProjectM.mutate(dialog.projectId);
                    else if (dialog.kind === 'revokeInvite') revokeM.mutate(dialog.invite.id);
                  }}>
                  Xác nhận
                </Button>
                <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => setDialog(null)}>Hủy</Button>
              </div>
            </ConfirmationDialog>
          </>
        )}
    </div>
  );
}

function InviteRow({ invite, onRevoke }: { invite: InviteListItemDto; onRevoke?: () => void }) {
  return (
    <li className="min-w-0 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 text-sm font-medium text-ink [overflow-wrap:anywhere]">{invite.label ?? 'Mã mời không nhãn'}</span>
        <Badge variant={invite.status === 'Active' ? 'success' : 'neutral'}>{INVITE_STATUS[invite.status] ?? invite.status}</Badge>
      </div>
      <p className="mt-1 text-xs text-ink-secondary">
        {invite.maxUses != null ? `Đã dùng ${invite.usedCount}/${invite.maxUses}` : `Đã dùng ${invite.usedCount} lượt`}
        {' · '}{invite.expiresAt ? `Hết hạn ${formatDateTime(invite.expiresAt)}` : 'Không hết hạn'}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-ink-muted">{invite.createdByName} · {formatDate(invite.createdAt)}</span>
        {onRevoke && (
          <Button size="sm" variant="danger" className="min-h-9" onClick={onRevoke}>Thu hồi</Button>
        )}
      </div>
    </li>
  );
}

function ArchivedProjects({ rows, canRestore, onRestore }: {
  rows: { id: string; name: string; archivedAt?: string | null; taskCount: number; completedCount: number }[];
  canRestore: boolean; onRestore: (p: { id: string; name: string }) => void;
}) {
  return (
    <details className="group rounded-2xl border border-line bg-surface-subtle">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-ink">
        Dự án đã lưu trữ ({rows.length})
        <Icon name="chevron-down" size={16} className="transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="divide-y divide-line border-t border-line">
        {rows.map(p => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 min-w-0">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink [overflow-wrap:anywhere]">{p.name}</span>
              <span className="text-xs text-ink-secondary">
                Lưu trữ {formatDate(p.archivedAt)} · {p.completedCount}/{p.taskCount} công việc
              </span>
            </span>
            {canRestore && <Button size="sm" variant="secondary" className="min-h-9" onClick={() => onRestore(p)}>Khôi phục</Button>}
          </li>
        ))}
      </ul>
    </details>
  );
}

// ── Dialogs ──

function ProjectDialog({ groupId, busy, onClose, onCreated }: {
  groupId: string; busy: boolean; onClose: () => void; onCreated: () => void;
}) {
  const [form, setForm] = useState({ name: '', description: '', subject: '', deadline: '' });
  const [errors, setErrors] = useState<{ name?: string; description?: string; subject?: string; form?: string }>({});
  const createM = useMutation({
    mutationFn: () => projectsService.create(groupId, form.name.trim(), form.description.trim() || undefined,
      form.subject.trim() || undefined,
      form.deadline && Number.isFinite(Date.parse(form.deadline)) ? new Date(`${form.deadline}T23:59:00+07:00`).toISOString() : undefined),
    onSuccess: onCreated,
    onError: e => setErrors(x => ({ ...x, form: errMsg(e, 'Không tạo được dự án.') })),
  });
  const submit = () => {
    const errs: typeof errors = {};
    if (!form.name.trim()) errs.name = 'Nhập tên dự án.';
    else if (form.name.trim().length > 200) errs.name = 'Tên dự án tối đa 200 ký tự.';
    if (form.description.trim().length > 2000) errs.description = 'Mô tả tối đa 2.000 ký tự.';
    if (form.subject.trim().length > 100) errs.subject = 'Môn học tối đa 100 ký tự.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    createM.mutate();
  };
  return (
    <ConfirmationDialog open busy={busy || createM.isPending} onClose={onClose} title="Tạo dự án">
      <form noValidate className="space-y-4" onSubmit={e => { e.preventDefault(); submit(); }}>
        <Input id="proj-name" label="Tên dự án" maxLength={200} value={form.name} disabled={createM.isPending}
          error={errors.name} onChange={e => { setForm(x => ({ ...x, name: e.target.value })); if (errors.name) setErrors(x => ({ ...x, name: undefined })); }} />
        <Input id="proj-subject" label="Môn học (tuỳ chọn)" maxLength={100} value={form.subject} disabled={createM.isPending}
          error={errors.subject} onChange={e => { setForm(x => ({ ...x, subject: e.target.value })); if (errors.subject) setErrors(x => ({ ...x, subject: undefined })); }} />
        <div>
          <label htmlFor="proj-deadline" className="block text-sm font-medium text-ink-secondary mb-1">Hạn (tuỳ chọn)</label>
          <input id="proj-deadline" type="date" value={form.deadline} disabled={createM.isPending}
            onChange={e => setForm(x => ({ ...x, deadline: e.target.value }))}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary-600" />
        </div>
        <div>
          <label htmlFor="proj-desc" className="block text-sm font-medium text-ink-secondary mb-1">Mô tả (tuỳ chọn)</label>
          <textarea id="proj-desc" rows={3} maxLength={2000} value={form.description} disabled={createM.isPending}
            aria-invalid={!!errors.description}
            onChange={e => { setForm(x => ({ ...x, description: e.target.value })); if (errors.description) setErrors(x => ({ ...x, description: undefined })); }}
            className="w-full rounded-xl border border-line bg-surface px-4 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-primary-600" />
          {errors.description && <p role="alert" className="mt-1 text-sm text-danger-700">{errors.description}</p>}
        </div>
        {errors.form && <p role="alert" className="text-sm text-danger-700">{errors.form}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="min-h-11" disabled={createM.isPending} isLoading={createM.isPending}>Tạo dự án</Button>
          <Button type="button" variant="secondary" className="min-h-11" disabled={createM.isPending} onClick={onClose}>Hủy</Button>
        </div>
      </form>
    </ConfirmationDialog>
  );
}

function EditGroupDialog({ groupId, initialName, initialDesc, onClose, onSaved }: {
  groupId: string; initialName: string; initialDesc: string; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [desc, setDesc] = useState(initialDesc);
  const [error, setError] = useState('');
  const saveM = useMutation({
    mutationFn: () => groupsManage.update(groupId, name.trim(), desc.trim() || undefined),
    onSuccess: onSaved,
    onError: e => setError(errMsg(e, 'Không cập nhật được nhóm.')),
  });
  return (
    <ConfirmationDialog open busy={saveM.isPending} onClose={onClose} title="Sửa nhóm">
      <form noValidate className="space-y-4" onSubmit={e => {
        e.preventDefault();
        if (!name.trim()) { setError('Nhập tên nhóm.'); return; }
        setError('');
        saveM.mutate();
      }}>
        <Input id="edit-name" label="Tên nhóm" maxLength={200} value={name} disabled={saveM.isPending}
          onChange={e => { setName(e.target.value); if (error) setError(''); }} />
        <div>
          <label htmlFor="edit-desc" className="block text-sm font-medium text-ink-secondary mb-1">Mô tả (tuỳ chọn)</label>
          <textarea id="edit-desc" rows={3} maxLength={1000} value={desc} disabled={saveM.isPending}
            onChange={e => setDesc(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface px-4 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-primary-600" />
        </div>
        {error && <p role="alert" className="text-sm text-danger-700">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="min-h-11" disabled={saveM.isPending} isLoading={saveM.isPending}>Lưu</Button>
          <Button type="button" variant="secondary" className="min-h-11" disabled={saveM.isPending} onClick={onClose}>Hủy</Button>
        </div>
      </form>
    </ConfirmationDialog>
  );
}

function ArchiveGroupDialog({ groupId, name, onClose }: { groupId: string; name: string; onClose: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const userId = useCurrentUserId();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const archiveM = useMutation({
    mutationFn: () => groupsService.archiveGroup(groupId, typed),
    onSuccess: () => {
      toast.success('Đã lưu trữ nhóm.');
      void qc.invalidateQueries({ queryKey: qk.myGroups(userId ?? '') });
      void qc.invalidateQueries({ queryKey: qk.archivedGroups(userId ?? '') });
      void qc.invalidateQueries({ queryKey: qk.leaderQueue(userId ?? '') });
      void qc.invalidateQueries({ queryKey: qk.myTasks(userId ?? '') });
      navigate('/groups');
    },
    onError: e => setError(errMsg(e, 'Không lưu trữ được nhóm.')),
  });
  return (
    <ConfirmationDialog open busy={archiveM.isPending} onClose={onClose} title="Lưu trữ nhóm">
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-secondary">
        <li>Nhóm sẽ ẩn khỏi danh sách và mọi thành viên tạm thời không truy cập được.</li>
        <li>Mã mời ngừng hoạt động.</li>
        <li>Các yêu cầu Marketplace đang hoạt động bị hủy.</li>
        <li>Trưởng nhóm có thể khôi phục trong mục Nhóm đã lưu trữ.</li>
      </ul>
      <form noValidate className="mt-4 space-y-3" onSubmit={e => {
        e.preventDefault();
        if (typed !== name) return;
        archiveM.mutate();
      }}>
        <Input id="archive-name" label={`Nhập tên nhóm để xác nhận`} placeholder={name}
          value={typed} disabled={archiveM.isPending} autoComplete="off"
          onChange={e => { setTyped(e.target.value); if (error) setError(''); }} />
        {error && <p role="alert" className="text-sm text-danger-700">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="danger" className="min-h-11" disabled={typed !== name || archiveM.isPending}
            isLoading={archiveM.isPending}>Lưu trữ nhóm</Button>
          <Button type="button" variant="secondary" className="min-h-11" disabled={archiveM.isPending} onClick={onClose}>Hủy</Button>
        </div>
      </form>
    </ConfirmationDialog>
  );
}

type InviteExpiryChoice = '1d' | '7d' | '30d' | 'never';

function InviteDialog({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [expiry, setExpiry] = useState<InviteExpiryChoice>('7d');
  const [limitMode, setLimitMode] = useState<'unlimited' | 'limited'>('unlimited');
  const [maxUses, setMaxUses] = useState('');
  const [errors, setErrors] = useState<{ label?: string; maxUses?: string; form?: string }>({});
  const [created, setCreated] = useState<{ code: string } | null>(null);
  const [copyHint, setCopyHint] = useState('');

  const createM = useMutation({
    mutationFn: () => {
      const days = expiry === '1d' ? 1 : expiry === '7d' ? 7 : expiry === '30d' ? 30 : null;
      return groupsService.createInvite(groupId, {
        label: label.trim() || undefined,
        expiresAt: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
        maxUses: limitMode === 'limited' ? Number(maxUses) : null,
      });
    },
    onSuccess: inv => setCreated({ code: inv.code }),
    onError: e => setErrors(x => ({ ...x, form: errMsg(e, 'Không tạo được mã mời.') })),
  });

  const submit = () => {
    const errs: typeof errors = {};
    if (label.trim().length > 100) errs.label = 'Nhãn tối đa 100 ký tự.';
    if (limitMode === 'limited') {
      const n = Number(maxUses);
      if (!Number.isInteger(n) || n < 1 || n > 500) errs.maxUses = 'Số lượt từ 1 đến 500.';
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    createM.mutate();
  };

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`Đã sao chép ${what}.`); setCopyHint(''); }
    catch { setCopyHint('Không sao chép được. Hãy chọn và chép thủ công.'); }
  };

  return (
    <ConfirmationDialog open busy={createM.isPending} onClose={onClose} title="Tạo mã mời">
      {created ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-secondary">Chia sẻ mã hoặc liên kết cho thành viên mới.</p>
          <div className="rounded-xl border border-line bg-surface-subtle p-4 text-center">
            <code className="font-mono text-2xl font-semibold tracking-[0.2em] text-ink">{created.code}</code>
            <p className="mt-2 break-all font-mono text-xs text-ink-secondary">{`${window.location.origin}/join/${created.code}`}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="min-h-11" onClick={() => void copy(created.code, 'mã')}>Sao chép mã</Button>
            <Button variant="secondary" className="min-h-11" onClick={() => void copy(`${window.location.origin}/join/${created.code}`, 'liên kết')}>Sao chép liên kết</Button>
          </div>
          {copyHint && <p role="alert" className="text-sm text-danger-700">{copyHint}</p>}
          <p className="text-xs text-ink-muted">Mã chỉ hiển thị một lần. Hãy sao chép trước khi đóng.</p>
          <Button className="min-h-11 w-full" onClick={onClose}>Đóng</Button>
        </div>
      ) : (
        <form noValidate className="space-y-4" onSubmit={e => { e.preventDefault(); submit(); }}>
          <Input id="invite-label" label="Nhãn (tuỳ chọn)" maxLength={100} value={label} disabled={createM.isPending}
            error={errors.label} hint="Giúp nhận ra mã này dùng cho ai, ví dụ “Lớp nhóm 3”."
            onChange={e => { setLabel(e.target.value); if (errors.label) setErrors(x => ({ ...x, label: undefined })); }} />
          <div>
            <label htmlFor="invite-expiry" className="block text-sm font-medium text-ink-secondary mb-1">Hạn dùng</label>
            <select id="invite-expiry" value={expiry} disabled={createM.isPending}
              onChange={e => setExpiry(e.target.value as InviteExpiryChoice)}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary-600">
              <option value="1d">1 ngày</option>
              <option value="7d">7 ngày</option>
              <option value="30d">30 ngày</option>
              <option value="never">Không hết hạn</option>
            </select>
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-ink-secondary">Số lượt dùng</legend>
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="radio" name="invite-uses" checked={limitMode === 'unlimited'} disabled={createM.isPending}
                  onChange={() => setLimitMode('unlimited')} className="h-4 w-4 accent-primary-600" />
                Không giới hạn
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="radio" name="invite-uses" checked={limitMode === 'limited'} disabled={createM.isPending}
                  onChange={() => setLimitMode('limited')} className="h-4 w-4 accent-primary-600" />
                Giới hạn
              </label>
              {limitMode === 'limited' && (
                <Input id="invite-max" label="Số lượt (1–500)" value={maxUses} disabled={createM.isPending}
                  inputMode="numeric" error={errors.maxUses}
                  onChange={e => { setMaxUses(e.target.value); if (errors.maxUses) setErrors(x => ({ ...x, maxUses: undefined })); }} />
              )}
            </div>
          </fieldset>
          {errors.form && <p role="alert" className="text-sm text-danger-700">{errors.form}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="min-h-11" disabled={createM.isPending} isLoading={createM.isPending}>Tạo mã</Button>
            <Button type="button" variant="secondary" className="min-h-11" disabled={createM.isPending} onClick={onClose}>Hủy</Button>
          </div>
        </form>
      )}
    </ConfirmationDialog>
  );
}
