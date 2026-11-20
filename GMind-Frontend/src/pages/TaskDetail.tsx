import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button, { buttonClasses } from '../components/ui/Button';
import Input from '../components/ui/Input';
import Icon from '../components/ui/Icon';
import UserAvatar from '../components/account/UserAvatar';
import { Breadcrumb, EmptyState, ErrorState } from '../components/workspace/WorkspaceUI';
import ConfirmationDialog from '../components/workspace/ConfirmationDialog';
import { SubmitTaskDialog, RequestChangesDialog } from '../components/tasks/TaskDialogs';
import { useToast } from '../components/ui/Toast';
import { useCurrentUserId } from '../hooks/use-current-user-id';
import { useRemindTask } from '../hooks/use-remind-task';
import { qk } from '../services/query-keys';
import {
  tasksService, hasTaskDetails, TaskStatus,
  type TaskDetailDto, type TaskPermissionsDto, type SubmissionDto, type ReviewDto,
} from '../services/tasks';
import { projectsService } from '../services/projects';
import { groupsService, type GroupMemberDto } from '../services/groups';
import { deadlineState } from '../utils/task-time';
import { formatDate, formatDateTime, STATUS_LABEL, PRIORITY_LABEL, timestamp } from '../utils/presentation';

const errMsg = (e: unknown, fb: string) =>
  typeof (e as { message?: unknown })?.message === 'string' && (e as { message?: unknown }).message ? (e as { message: string }).message : fb;
const errStatus = (e: unknown) => (e as { status?: number })?.status;
const initials = (n?: string | null) => (n || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const hostname = (u: string) => { try { return new URL(u).hostname; } catch { return u; } };
function httpUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try { const parsed = new URL(trimmed); return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : null; }
  catch { return null; }
}
function vnInputValue(iso?: string | null): string {
  if (!iso) return '';
  const d = timestamp(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const p = (t: string) => parts.find(x => x.type === t)?.value ?? '';
  const hour = p('hour') === '24' ? '00' : p('hour');
  return `${p('year')}-${p('month')}-${p('day')}T${hour}:${p('minute')}`;
}
const vnToIso = (v: string) => (v ? new Date(`${v}:00+07:00`).toISOString() : undefined);

const PERMS_NONE: TaskPermissionsDto = {
  canEdit: false, canAssign: false, canDelete: false, canUpdateProgress: false, canAddSubtask: false, allowedTransitions: [],
};

type DialogKind = 'submit' | 'changes' | 'edit' | 'assign' | 'delete' | null;

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  return <MainLayout><TaskPage key={id ?? ''} id={id ?? ''} /></MainLayout>;
}

function TaskPage({ id }: { id: string }) {
  const uid = useCurrentUserId();
  const me = uid ?? '';
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [justApproved, setJustApproved] = useState(false);
  const [confirmLink, setConfirmLink] = useState<string | null>(null);
  const [confirmComment, setConfirmComment] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const taskQ = useQuery({
    queryKey: qk.task(me, id), queryFn: () => tasksService.get(id), enabled: !!me && !!id,
  });
  const task = taskQ.data;
  const detail = task && hasTaskDetails(task) ? task : null;
  const perms = detail?.permissions ?? PERMS_NONE;

  const projectQ = useQuery({
    queryKey: qk.project(me, task?.projectId ?? ''), queryFn: () => projectsService.get(task!.projectId), enabled: !!me && !!task,
  });
  const groupId = projectQ.data?.groupId;
  const groupQ = useQuery({
    queryKey: qk.groupMembers(me, groupId ?? ''), queryFn: () => groupsService.get(groupId!), enabled: !!me && !!groupId,
  });

  const detailOn = !!me && !!detail;
  const subtasksQ = useQuery({
    queryKey: qk.taskSubtasks(me, id), queryFn: () => tasksService.subtasks(id), enabled: detailOn && !detail!.parentTaskId,
  });
  const commentsQ = useQuery({ queryKey: qk.taskComments(me, id), queryFn: () => tasksService.comments(id), enabled: detailOn });
  const linksQ = useQuery({ queryKey: qk.taskLinks(me, id), queryFn: () => tasksService.links(id), enabled: detailOn });
  const helpersQ = useQuery({ queryKey: qk.taskHelpers(me, id), queryFn: () => tasksService.listHelpers(id), enabled: detailOn });
  const reviewsQ = useQuery({ queryKey: qk.taskReviews(me, id), queryFn: () => tasksService.reviews(id), enabled: detailOn });
  const submissionsQ = useQuery({ queryKey: qk.taskSubmissions(me, id), queryFn: () => tasksService.submissions(id), enabled: detailOn });

  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: qk.task(me, id) });
    void qc.invalidateQueries({ queryKey: qk.taskSubtasks(me, id) });
    void qc.invalidateQueries({ queryKey: qk.taskComments(me, id) });
    void qc.invalidateQueries({ queryKey: qk.taskLinks(me, id) });
    void qc.invalidateQueries({ queryKey: qk.taskReviews(me, id) });
    void qc.invalidateQueries({ queryKey: qk.taskSubmissions(me, id) });
    if (task?.projectId) void qc.invalidateQueries({ queryKey: qk.projectTasks(me, task.projectId) });
    void qc.invalidateQueries({ queryKey: qk.myTasks(me) });
  };

  const statusM = useMutation({
    mutationFn: ({ status, comment }: { status: number; comment?: string }) => tasksService.changeStatus(id, status, comment),
    onSuccess: (_d, v) => {
      invalidateAll();
      setDialog(null);
      if (v.status === TaskStatus.Completed) {
        setJustApproved(true);
        toast.success('Đã duyệt công việc.');
      } else if (v.status === TaskStatus.Submitted) {
        toast.success('Đã nộp công việc để duyệt.');
      } else if (v.status === TaskStatus.ChangesRequested) {
        toast.success('Đã gửi yêu cầu chỉnh sửa.');
      } else if (v.status === TaskStatus.InProgress) {
        toast.success(detail?.status === 'Completed' ? 'Đã mở lại công việc.' : 'Công việc đang được thực hiện.');
      } else {
        toast.success('Đã cập nhật trạng thái.');
      }
    },
    onError: (e) => toast.error(errMsg(e, 'Không thể cập nhật trạng thái. Vui lòng thử lại.')),
  });

  const deleteM = useMutation({
    mutationFn: () => tasksService.remove(id),
    onSuccess: () => {
      invalidateAll();
      toast.success('Đã xóa công việc.');
      navigate(task?.projectId ? `/projects/${task.projectId}` : '/dashboard');
    },
  });
  const [deleteError, setDeleteError] = useState('');

  const { remindTask, remindingId, isReminded } = useRemindTask();

  // ------- loading / error states -------
  if (taskQ.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <p role="status" className="sr-only">Đang tải công việc…</p>
        <div aria-hidden="true" className="space-y-6 motion-safe:animate-pulse">
          <div className="h-4 w-56 rounded bg-slate-100" />
          <div className="h-8 w-72 rounded bg-slate-100" />
          <div className="flex gap-2"><div className="h-7 w-24 rounded-full bg-slate-100" /><div className="h-7 w-24 rounded-full bg-slate-100" /></div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-6"><div className="h-40 rounded-2xl bg-slate-100" /><div className="h-64 rounded-2xl bg-slate-100" /></div>
            <div className="h-72 rounded-2xl bg-slate-100 max-xl:hidden" />
          </div>
        </div>
      </div>
    );
  }

  if (taskQ.isError || !task) {
    const code = taskQ.error ? errStatus(taskQ.error) : 404;
    if (code === 403) {
      return (
        <div className="mx-auto max-w-6xl">
          <EmptyState illustration="lost" title="Bạn không có quyền xem công việc này"
            body="Chỉ Trưởng nhóm, người phụ trách và người phụ trách công việc chính mới xem được chi tiết."
            action={<Link to="/tasks" className="text-primary-700 font-medium hover:underline">Về Công việc của tôi</Link>} />
        </div>
      );
    }
    if (code === 404 || (!task && !taskQ.error)) {
      return (
        <div className="mx-auto max-w-6xl">
          <EmptyState illustration="lost" title="Không tìm thấy công việc"
            body="Công việc có thể đã bị xóa hoặc đường dẫn không đúng."
            action={<Link to="/tasks" className="text-primary-700 font-medium hover:underline">Về Công việc của tôi</Link>} />
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-6xl">
        <ErrorState message={errMsg(taskQ.error, 'Không thể tải công việc. Vui lòng thử lại.')} onRetry={() => void taskQ.refetch()} />
      </div>
    );
  }

  // ------- summary-only view -------
  if (!detail) {
    const dl = deadlineState(task.deadlineAt, task.status, now);
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Breadcrumb hideCurrentBelowSm items={[
          { label: groupQ.data?.name ?? 'Nhóm', to: groupId ? `/groups/${groupId}` : undefined },
          { label: projectQ.data?.name ?? 'Dự án', to: `/projects/${task.projectId}` },
          { label: task.title },
        ]} />
        <header className="min-w-0">
          <h2 className="text-title font-semibold text-ink [overflow-wrap:anywhere]">{task.title}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge value={task.status}>{STATUS_LABEL[task.status] ?? task.status}</Badge>
            <Badge value={task.priority}>{PRIORITY_LABEL[task.priority] ?? task.priority}</Badge>
            {(dl.kind === 'overdue' || dl.kind === 'today' || dl.kind === 'tomorrow') && (
              <Badge variant={dl.kind === 'overdue' ? 'danger' : dl.kind === 'today' ? 'warning' : 'neutral'} dot={false}>{dl.label}</Badge>
            )}
          </div>
          <p className="mt-2 text-sm text-ink-muted [overflow-wrap:anywhere]">
            {task.assigneeName || 'Chưa giao'} · {task.deadlineAt ? `Hạn ${formatDateTime(task.deadlineAt)}` : 'Chưa đặt hạn'}
          </p>
        </header>
        <Card className="p-4 sm:p-6">
          <p className="text-body text-ink-secondary">
            Bạn đang xem thông tin chung của công việc. Chỉ Trưởng nhóm, người phụ trách và người phụ trách công việc chính mới xem được chi tiết đầy đủ.
          </p>
        </Card>
      </div>
    );
  }

  const subtasks = subtasksQ.data ?? [];
  const comments = commentsQ.data ?? [];
  const links = linksQ.data ?? [];
  const reviews = reviewsQ.data ?? [];
  const submissions = submissionsQ.data ?? [];
  const members = groupQ.data?.members ?? [];

  const dl = deadlineState(detail.deadlineAt, detail.status, now);
  const openSubtasks = (detail.subtaskCount ?? 0) - (detail.subtasksCompleted ?? 0);
  const submitBlocked = openSubtasks > 0;
  const busy = statusM.isPending || deleteM.isPending || !!remindingId;
  const isAssigneeOpenTop = detail.assigneeUserId === me && detail.status !== 'Completed' && !detail.parentTaskId;
  const helpers = helpersQ.data ?? [];
  const activeHelpers = helpers.filter(h => !h.endedAt);
  const endedHelpers = helpers.filter(h => !!h.endedAt);

  type TransitionAction = { label: string; run: () => void; disabled?: boolean; disabledReason?: string };
  const transitionButton = (target: string): TransitionAction | null => {
    switch (target) {
      case 'InProgress':
        return detail.status === 'Completed' ? { label: 'Mở lại', run: () => statusM.mutate({ status: TaskStatus.InProgress }) }
          : detail.status === 'ChangesRequested' ? { label: 'Làm lại', run: () => statusM.mutate({ status: TaskStatus.InProgress }) }
          : { label: 'Bắt đầu', run: () => statusM.mutate({ status: TaskStatus.InProgress }) };
      case 'Submitted':
        return { label: 'Nộp để duyệt', run: () => setDialog('submit'), disabled: submitBlocked, disabledReason: submitBlocked ? 'Hoàn thành tất cả công việc con trước khi nộp.' : undefined };
      case 'Completed':
        return detail.status === 'Submitted' ? { label: 'Duyệt', run: () => statusM.mutate({ status: TaskStatus.Completed }) }
          : { label: 'Hoàn thành', run: () => statusM.mutate({ status: TaskStatus.Completed }) };
      case 'ChangesRequested':
        return { label: 'Yêu cầu chỉnh sửa', run: () => setDialog('changes') };
      case 'ToDo':
        return { label: 'Về Cần làm', run: () => statusM.mutate({ status: TaskStatus.ToDo }) };
      default:
        return null;
    }
  };

  const transitions = perms.allowedTransitions.map(t => ({ target: t, ...transitionButton(t)! })).filter(x => x.label);
  const primaryRank = (t: string) => ({ Submitted: 0, Completed: 1, InProgress: 2, ChangesRequested: 3, ToDo: 4 } as Record<string, number>)[t] ?? 5;
  const primary = transitions.length ? [...transitions].sort((a, b) => primaryRank(a.target) - primaryRank(b.target))[0] : null;
  const secondaryTransitions = transitions.filter(t => t !== primary);

  const actionButtons = (compact = false) => (
    <>
      {primary && (
        <Button size={compact ? 'sm' : 'md'} disabled={busy || primary.disabled} isLoading={statusM.isPending}
          onClick={primary.run}>{primary.label}</Button>
      )}
      {secondaryTransitions.map(t => (
        <Button key={t.target} variant="secondary" size={compact ? 'sm' : 'md'} disabled={busy || t.disabled} onClick={t.run}>{t.label}</Button>
      ))}
      {perms.canEdit && <Button variant="secondary" size={compact ? 'sm' : 'md'} disabled={busy} onClick={() => setDialog('edit')}>Sửa</Button>}
      {perms.canAssign && <Button variant="secondary" size={compact ? 'sm' : 'md'} disabled={busy} onClick={() => setDialog('assign')}>Giao lại</Button>}
      {perms.canRemind && (isReminded(detail.id) || perms.remindedRecently ? (
        <Button variant="secondary" size={compact ? 'sm' : 'md'} disabled
          aria-label={`Đã nhắc ${detail.assigneeName ?? 'người phụ trách'} về ${detail.title}`}>
          <Icon name="check" size={16} />Đã nhắc
        </Button>
      ) : (
        <Button variant="secondary" size={compact ? 'sm' : 'md'} disabled={busy || !!remindingId} isLoading={remindingId === detail.id}
          aria-label={`Nhắc ${detail.assigneeName ?? 'người phụ trách'} về ${detail.title}`}
          onClick={() => remindTask(detail.id, detail.assigneeName ?? 'người phụ trách')}>Nhắc</Button>
      ))}
      {perms.canDelete && <Button variant="danger" size={compact ? 'sm' : 'md'} disabled={busy} onClick={() => { setDeleteError(''); setDialog('delete'); }}>Xóa</Button>}
      {isAssigneeOpenTop && groupId && (
        <Link to={`/groups/${groupId}/marketplace?new=NeedHelp&task=${detail.id}`}
          className={buttonClasses({ variant: 'secondary', size: compact ? 'sm' : 'md', className: 'border-accent-300 text-accent-700' })}>
          Nhờ hỗ trợ / chuyển giao
        </Link>
      )}
    </>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-24 lg:pb-0">
      <Breadcrumb hideCurrentBelowSm items={[
        { label: groupQ.data?.name ?? 'Nhóm', to: groupId ? `/groups/${groupId}` : undefined },
        { label: projectQ.data?.name ?? 'Dự án', to: `/projects/${detail.projectId}` },
        ...(detail.parentTaskId ? [{ label: detail.parentTitle || 'Công việc chính', to: `/tasks/${detail.parentTaskId}` }] : []),
        { label: detail.title },
      ]} />

      <header className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-title font-semibold text-ink [overflow-wrap:anywhere]">{detail.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge value={detail.status} className="relative" dot={!(justApproved && detail.status === 'Completed')}>
                {justApproved && detail.status === 'Completed' && (
                  <Icon name="check" size={14} className="mr-0.5 inline motion-safe:animate-[gm-approve-pop_.6s_ease-out_both]" />
                )}
                {STATUS_LABEL[detail.status] ?? detail.status}
              </Badge>
              <Badge value={detail.priority}>{PRIORITY_LABEL[detail.priority] ?? detail.priority}</Badge>
              {(dl.kind === 'overdue' || dl.kind === 'today' || dl.kind === 'tomorrow') && (
                <Badge variant={dl.kind === 'overdue' ? 'danger' : dl.kind === 'today' ? 'warning' : 'neutral'} dot={false}>{dl.label}</Badge>
              )}
              {detail.parentTaskId && <Badge variant="secondary" dot={false}>Công việc con</Badge>}
            </div>
            <p className="mt-2 text-sm min-w-0 text-ink-muted [overflow-wrap:anywhere]">
              {detail.assigneeName || 'Chưa giao'} · {detail.deadlineAt ? `Hạn ${formatDateTime(detail.deadlineAt)}` : 'Chưa đặt hạn'}
            </p>
          </div>
          {(primary || perms.canEdit || perms.canAssign || perms.canRemind || perms.canDelete) && (
            <div className="hidden lg:flex flex-wrap items-center gap-2">{actionButtons()}</div>
          )}
        </div>
        {primary?.disabled && primary.disabledReason && (
          <p className="mt-2 text-sm text-ink-muted">{primary.disabledReason}</p>
        )}
      </header>

      {perms.isHelper && !perms.canAssign && (
        <p role="note" className="rounded-xl border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-700">
          Bạn đang hỗ trợ công việc này. Bạn có thể xem và bình luận; người phụ trách vẫn là {detail.assigneeName || 'chưa giao'}.
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card className="p-4 sm:p-6">
            <h3 className="text-section font-semibold text-ink">Mô tả</h3>
            {detail.description ? (
              <p className="mt-3 max-w-[68ch] text-body text-ink whitespace-pre-wrap [overflow-wrap:anywhere]">{detail.description}</p>
            ) : <p className="mt-3 text-small text-ink-muted">Chưa có mô tả.</p>}
          </Card>

          {!detail.parentTaskId && (
            <SubtasksCard taskId={id} detail={detail} subtasks={subtasks} perms={perms} busy={busy} invalidate={invalidateAll} />
          )}

          <HandoffTimeline submissions={submissions} reviews={reviews} isSubtask={!!detail.parentTaskId} />

          <DocumentsCard
            links={links} busy={busy}
            onDelete={(linkId) => setConfirmLink(linkId)}
            invalidate={invalidateAll}
            canAdd={perms.canAddLink === true}
            taskId={id}
          />

          <CommentsCard
            taskId={id} comments={comments} busy={busy} invalidate={invalidateAll}
            canComment={perms.canComment !== false}
            onDelete={(cid) => setConfirmComment(cid)}
          />
        </div>

        <aside className="min-w-0 max-xl:contents xl:space-y-6">
          <Card className="p-4 sm:p-6 max-xl:order-2">
            <h3 className="text-section font-semibold text-ink">Thông tin</h3>
            <dl className="mt-4 space-y-3.5">
              <InfoRow label="Người phụ trách">
                <span className="flex items-center gap-2 min-w-0">
                  <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-caption font-semibold text-primary-700">{initials(detail.assigneeName)}</span>
                  <span className="min-w-0 [overflow-wrap:anywhere]">{detail.assigneeName || 'Chưa giao'}</span>
                </span>
              </InfoRow>
              <InfoRow label="Hạn">
                {detail.deadlineAt ? (
                  <span>
                    {formatDateTime(detail.deadlineAt)}
                    {(dl.kind === 'overdue' || dl.kind === 'today') && (
                      <span className={`block text-small ${dl.kind === 'overdue' ? 'text-danger-700 font-medium' : 'text-ink-muted'}`}>{dl.label}</span>
                    )}
                  </span>
                ) : 'Chưa đặt hạn'}
              </InfoRow>
              <InfoRow label="Ưu tiên">{PRIORITY_LABEL[detail.priority] ?? detail.priority}</InfoRow>
              {detail.estimateHours != null && <InfoRow label="Ước tính">{detail.estimateHours} giờ</InfoRow>}
              {detail.points != null && <InfoRow label="Điểm">{detail.points}</InfoRow>}
              <InfoRow label="Tạo bởi">{detail.createdByName || '—'} · {formatDateTime(detail.createdAt)}</InfoRow>
              {detail.updatedAt && <InfoRow label="Cập nhật">{formatDateTime(detail.updatedAt)}</InfoRow>}
            </dl>
          </Card>
          {helpers.length > 0 && (
            <HelpersCard taskId={id} active={activeHelpers} ended={endedHelpers} invalidate={invalidateAll}
              className="max-xl:order-3" />
          )}
          <ProgressPanel task={detail} me={me} invalidate={invalidateAll} className="max-xl:-order-1" />
        </aside>
      </div>

      {/* Mobile sticky action bar; .gm-sticky-bar lifts the toast via --gm-toast-offset */}
      {(primary || perms.canEdit || perms.canAssign || perms.canRemind || perms.canDelete) && (
        <div className="gm-sticky-bar fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 p-3 lg:hidden">
          <div className="flex items-center gap-2 overflow-x-auto">{actionButtons(true)}</div>
        </div>
      )}

      {dialog === 'submit' && (
        <SubmitTaskDialog busy={statusM.isPending}
          blockedReason={submitBlocked ? 'Hoàn thành tất cả công việc con trước khi nộp.' : undefined}
          onClose={() => setDialog(null)}
          onSubmit={(note) => statusM.mutate({ status: TaskStatus.Submitted, comment: note || undefined })} />
      )}
      {dialog === 'changes' && (
        <RequestChangesDialog busy={statusM.isPending}
          onClose={() => setDialog(null)}
          onSubmit={(comment) => statusM.mutate({ status: TaskStatus.ChangesRequested, comment })} />
      )}
      {dialog === 'edit' && <EditDialog task={detail} isLeader={perms.canAssign} invalidate={invalidateAll} onClose={() => setDialog(null)} />}
      {dialog === 'assign' && <AssignDialog task={detail} members={members} invalidate={invalidateAll} onClose={() => setDialog(null)} />}
      <ConfirmationDialog open={dialog === 'delete'} title="Xóa công việc" busy={deleteM.isPending} onClose={() => setDialog(null)}>
        <p>Xóa “{detail.title}” sẽ gỡ mọi liên kết và xóa lịch sử bàn giao của công việc. Hành động này không thể hoàn tác.</p>
        {deleteError && <p role="alert" className="mt-2 text-small text-danger-700 [overflow-wrap:anywhere]">{deleteError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" disabled={deleteM.isPending} onClick={() => setDialog(null)}>Hủy</Button>
          <Button variant="danger" isLoading={deleteM.isPending}
            onClick={() => { setDeleteError(''); deleteM.mutate(undefined, { onError: (e) => setDeleteError(errMsg(e, 'Không thể xóa công việc. Vui lòng thử lại.')) }); }}>Xóa</Button>
        </div>
      </ConfirmationDialog>
      <ConfirmationDialog open={confirmLink != null} title="Xóa tài liệu" onClose={() => setConfirmLink(null)}>
        <p>Xóa liên kết tài liệu này khỏi công việc?</p>
        <DeleteLinkConfirm linkId={confirmLink} invalidate={invalidateAll} onDone={() => setConfirmLink(null)} />
      </ConfirmationDialog>
      <ConfirmationDialog open={confirmComment != null} title="Xóa bình luận" onClose={() => setConfirmComment(null)}>
        <p>Xóa bình luận này? Hành động không thể hoàn tác.</p>
        <DeleteCommentConfirm commentId={confirmComment} invalidate={invalidateAll} onDone={() => setConfirmComment(null)} />
      </ConfirmationDialog>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-small text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-right text-small font-medium text-ink [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/* ---------- Tiến độ ---------- */
function ProgressPanel({ task, me, invalidate, className = '' }: { task: TaskDetailDto; me: string; invalidate: () => void; className?: string }) {
  const toast = useToast();
  const canSlide = !!task.permissions?.canUpdateProgress && task.assigneeUserId === me;
  const [value, setValue] = useState(task.progressPercent);
  const [saved, setSaved] = useState(task.progressPercent);
  const [prev, setPrev] = useState(task.progressPercent);
  if (prev !== task.progressPercent) {
    setPrev(task.progressPercent);
    setValue(task.progressPercent);
    setSaved(task.progressPercent);
  }

  const progressM = useMutation({
    mutationFn: (p: number) => tasksService.updateProgress(task.id, p),
    onSuccess: (d) => { setValue(d.progressPercent); setSaved(d.progressPercent); toast.success('Đã lưu tiến độ.'); invalidate(); },
    onError: (e) => { setValue(saved); toast.error(errMsg(e, 'Không thể lưu tiến độ. Vui lòng thử lại.')); },
  });

  return (
    <Card className={`p-4 sm:p-6 ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-section font-semibold text-ink">Tiến độ</h3>
        <span className="text-small tabular-nums font-semibold text-ink">{task.status === 'Completed' ? 'Đã hoàn thành' : `${value}%`}</span>
      </div>
      {canSlide ? (
        <div className="mt-3">
          <label htmlFor="task-progress" className="sr-only">Tiến độ phần trăm</label>
          <input id="task-progress" type="range" min={0} max={100} step={5} value={value}
            disabled={progressM.isPending}
            onChange={(e) => setValue(Number(e.target.value))}
            className="w-full accent-primary-600" />
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="secondary" disabled={progressM.isPending || value === saved} isLoading={progressM.isPending}
              onClick={() => progressM.mutate(value)}>Lưu tiến độ</Button>
          </div>
          <p className="mt-3 text-small text-ink-muted">100% không tự hoàn thành — hãy nộp để Trưởng nhóm duyệt.</p>
        </div>
      ) : (
        <div className="mt-3" role="img" aria-label={`Tiến độ ${task.progressPercent}%`}>
          <div className="h-1.5 w-full rounded-full bg-slate-200">
            <div className={`h-1.5 rounded-full ${task.status === 'Completed' ? 'bg-success-600' : 'bg-primary-500'}`} style={{ width: `${task.progressPercent}%` }} />
          </div>
        </div>
      )}
    </Card>
  );
}

/* ---------- Công việc con ---------- */
function SubtasksCard({ taskId, detail, subtasks, perms, busy, invalidate }: {
  taskId: string; detail: TaskDetailDto; subtasks: import('../services/tasks').TaskSummaryDto[];
  perms: TaskPermissionsDto; busy: boolean; invalidate: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [error, setError] = useState('');
  const sendingRef = useRef(false);
  const createM = useMutation({
    mutationFn: () => tasksService.create(detail.projectId, {
      title: title.trim(), parentTaskId: taskId, deadlineAt: vnToIso(deadline),
    }),
    onSuccess: () => { setTitle(''); setDeadline(''); setError(''); invalidate(); toast.success('Đã thêm công việc con.'); },
    onError: (e) => setError(errMsg(e, 'Không thể thêm công việc con.')),
    onSettled: () => { sendingRef.current = false; },
  });
  const toggleM = useMutation({
    mutationFn: ({ subId, status }: { subId: string; status: number }) => tasksService.changeStatus(subId, status),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(errMsg(e, 'Không thể cập nhật công việc con.')),
  });

  const toggleTarget = (s: import('../services/tasks').TaskSummaryDto): number | null => {
    const allowed = s.permissions?.allowedTransitions ?? [];
    if (s.status === 'Completed') return allowed.includes('InProgress') ? TaskStatus.InProgress : null;
    if (allowed.includes('Completed')) return TaskStatus.Completed;
    if (allowed.includes('InProgress')) return TaskStatus.InProgress;
    return null;
  };

  const submit = () => {
    if (sendingRef.current) return;
    if (!title.trim()) { setError('Hãy nhập tiêu đề công việc con.'); return; }
    sendingRef.current = true;
    createM.mutate();
  };

  return (
    <Card className="p-4 sm:p-6">
      <h3 className="text-section font-semibold text-ink">Công việc con</h3>
      {(detail.subtaskCount ?? 0) > 0 && (
        <p className="mt-1 text-small text-ink-muted">{detail.subtasksCompleted ?? 0}/{detail.subtaskCount} công việc con hoàn thành</p>
      )}
      {subtasks.length === 0 ? (
        <p className="mt-3 text-small text-ink-muted">Chưa có công việc con.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {subtasks.map(s => {
            const target = toggleTarget(s);
            const done = s.status === 'Completed';
            const sdl = deadlineState(s.deadlineAt, s.status);
            return (
              <li key={s.id} className="flex items-center gap-3 py-2.5 min-w-0">
                <button type="button" disabled={!target || toggleM.isPending || busy}
                  aria-label={done ? `Mở lại ${s.title}` : target === TaskStatus.InProgress ? `Bắt đầu ${s.title}` : `Hoàn thành ${s.title}`}
                  aria-pressed={done}
                  onClick={() => target != null && toggleM.mutate({ subId: s.id, status: target })}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${done ? 'border-success-600 bg-success-600 text-white' : 'border-slate-300 bg-white text-transparent hover:border-primary-500'}`}>
                  <Icon name="check" size={14} />
                </button>
                <div className="min-w-0 flex-1">
                  <Link to={`/tasks/${s.id}`} className={`text-small font-medium hover:underline [overflow-wrap:anywhere] ${done ? 'text-ink-muted line-through' : 'text-ink'}`}>{s.title}</Link>
                  <p className="text-caption text-ink-muted">
                    {s.assigneeName || 'Chưa giao'}{s.deadlineAt ? ` · ${sdl.label || formatDateTime(s.deadlineAt)}` : ''}
                  </p>
                </div>
                <Badge value={s.status}>{STATUS_LABEL[s.status] ?? s.status}</Badge>
              </li>
            );
          })}
        </ul>
      )}
      {perms.canAddSubtask && (
        <div className="mt-4 border-t border-line pt-4">
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <Input id="subtask-title" label="Thêm công việc con" placeholder="Tiêu đề công việc con" maxLength={200}
              value={title} disabled={busy || createM.isPending}
              onChange={e => { setTitle(e.target.value); if (error) setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
              error={error} />
            <div>
              <label htmlFor="subtask-deadline" className="mb-1.5 block text-small font-semibold text-ink-secondary">Hạn (không bắt buộc)</label>
              <input id="subtask-deadline" type="datetime-local" value={deadline} disabled={busy || createM.isPending}
                onChange={e => setDeadline(e.target.value)}
                className="app-surface h-11 w-full rounded-xl border border-line bg-white px-3 text-small" />
            </div>
            <Button variant="secondary" disabled={busy} isLoading={createM.isPending} onClick={submit}>Thêm</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ---------- Bàn giao & duyệt ---------- */
function HandoffTimeline({ submissions, reviews, isSubtask }: { submissions: SubmissionDto[]; reviews: ReviewDto[]; isSubtask: boolean }) {
  const timeline = useMemo(() => {
    const map = new Map<number, { submission?: SubmissionDto; reviews: ReviewDto[] }>();
    for (const s of submissions) map.set(s.version, { submission: s, reviews: [] });
    for (const r of reviews) {
      const g = map.get(r.submissionVersion) ?? { reviews: [] };
      g.reviews.push(r);
      map.set(r.submissionVersion, g);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [submissions, reviews]);

  return (
    <Card className="p-4 sm:p-6">
      <h3 className="text-section font-semibold text-ink">Bàn giao &amp; duyệt</h3>
      {timeline.length === 0 ? (
        <p className="mt-3 text-small text-ink-muted">
          {isSubtask ? 'Công việc con không qua vòng duyệt.' : 'Chưa có lượt bàn giao nào. Lịch sử sẽ xuất hiện khi người phụ trách nộp để duyệt.'}
        </p>
      ) : (
        <ol className="mt-4 space-y-5">
          {timeline.map(([version, g]) => (
            <li key={version} className="relative border-l-2 border-accent-200 pl-4">
              <span aria-hidden="true" className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-accent-500" />
              <p className="text-small font-semibold text-accent-700">Lần nộp {version}</p>
              {g.submission && (
                <div className="mt-1">
                  <p className="text-small text-ink-muted">{g.submission.submittedByName} · {formatDateTime(g.submission.createdAt)}</p>
                  {g.submission.note && (
                    <p className="mt-1 rounded-lg bg-accent-50 px-3 py-2 text-body text-ink whitespace-pre-wrap [overflow-wrap:anywhere]">{g.submission.note}</p>
                  )}
                </div>
              )}
              {g.reviews.map(r => (
                <div key={r.id} className="mt-3">
                  <p className={`text-small font-semibold ${r.decision === 'Completed' ? 'text-success-700' : 'text-warning-700'}`}>
                    {r.decision === 'Completed' ? 'Duyệt' : 'Yêu cầu chỉnh sửa'} lần nộp {version}
                  </p>
                  <p className="text-caption text-ink-muted [overflow-wrap:anywhere]">{r.reviewerName} · {formatDateTime(r.createdAt)}</p>
                  {r.comment && <p className="mt-1 text-body text-ink whitespace-pre-wrap [overflow-wrap:anywhere]">{r.comment}</p>}
                </div>
              ))}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/* ---------- Tài liệu ---------- */
function DocumentsCard({ taskId, links, busy, canAdd, invalidate, onDelete }: {
  taskId: string; links: import('../services/tasks').LinkDto[]; busy: boolean; canAdd: boolean;
  invalidate: () => void; onDelete: (linkId: string) => void;
}) {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const urlRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false);
  const addM = useMutation({
    mutationFn: () => tasksService.addLink(taskId, url.trim(), name.trim() || undefined),
    onSuccess: () => { setUrl(''); setName(''); setError(''); invalidate(); toast.success('Đã thêm tài liệu.'); },
    onError: (e) => { setError(errMsg(e, 'Không thể thêm liên kết.')); urlRef.current?.focus(); },
    onSettled: () => { sendingRef.current = false; },
  });
  const submit = () => {
    if (sendingRef.current) return;
    if (!httpUrl(url)) { setError('Liên kết phải bắt đầu bằng http:// hoặc https://.'); urlRef.current?.focus(); return; }
    sendingRef.current = true;
    addM.mutate();
  };

  return (
    <Card className="p-4 sm:p-6">
      <h3 className="text-section font-semibold text-ink">Tài liệu</h3>
      {links.length === 0 ? (
        <p className="mt-3 text-small text-ink-muted">Chưa có tài liệu đính kèm.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {links.map(l => {
            const safe = httpUrl(l.url);
            return (
              <li key={l.id} className="flex items-center gap-3 py-2.5 min-w-0">
                <Icon name="link" size={16} className="shrink-0 text-ink-muted" />
                <div className="min-w-0 flex-1">
                  {safe ? (
                    <a href={safe} target="_blank" rel="noopener noreferrer" className="text-small font-medium text-primary-700 hover:underline [overflow-wrap:anywhere]">
                      {l.displayName || hostname(l.url)}<span className="sr-only"> (mở tab mới)</span>
                    </a>
                  ) : <span className="text-small text-ink-muted [overflow-wrap:anywhere]">{l.displayName || l.url}</span>}
                  <p className="text-caption text-ink-muted [overflow-wrap:anywhere]">
                    {safe && l.displayName ? `${hostname(l.url)} · ` : ''}{l.createdByName ? `${l.createdByName} · ` : ''}{formatDateTime(l.createdAt)}
                  </p>
                </div>
                {l.canDelete && (
                  <button type="button" aria-label={`Xóa tài liệu ${l.displayName || l.url}`} disabled={busy}
                    onClick={() => onDelete(l.id)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-danger-50 hover:text-danger-600 disabled:opacity-50">
                    <Icon name="close" size={16} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canAdd && (
        <form noValidate className="mt-4 border-t border-line pt-4" onSubmit={e => { e.preventDefault(); submit(); }}>
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Input id="link-name" label="Tên hiển thị" placeholder="Tên tài liệu (không bắt buộc)" maxLength={200}
              value={name} disabled={busy || addM.isPending} onChange={e => setName(e.target.value)} />
            <Input id="link-url" ref={urlRef} label="Liên kết" type="url" placeholder="https://..." maxLength={2000}
              value={url} disabled={busy || addM.isPending} error={error}
              onChange={e => { setUrl(e.target.value); if (error) setError(''); }} />
            <Button type="submit" variant="secondary" disabled={busy} isLoading={addM.isPending}>Thêm tài liệu</Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function DeleteLinkConfirm({ linkId, invalidate, onDone }: { linkId: string | null; invalidate: () => void; onDone: () => void }) {
  const toast = useToast();
  const [error, setError] = useState('');
  const delM = useMutation({
    mutationFn: () => tasksService.deleteLink(linkId!),
    onSuccess: () => { invalidate(); toast.success('Đã xóa tài liệu.'); onDone(); },
    onError: (e) => setError(errMsg(e, 'Không thể xóa tài liệu.')),
  });
  return (
    <>
      {error && <p role="alert" className="mt-2 text-small text-danger-700">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" disabled={delM.isPending} onClick={onDone}>Hủy</Button>
        <Button variant="danger" isLoading={delM.isPending} onClick={() => { setError(''); delM.mutate(); }}>Xóa</Button>
      </div>
    </>
  );
}

/* ---------- Bình luận ---------- */
function CommentsCard({ taskId, comments, busy, invalidate, onDelete, canComment = true }: {
  taskId: string; comments: import('../services/tasks').CommentDto[]; busy: boolean;
  invalidate: () => void; onDelete: (commentId: string) => void; canComment?: boolean;
}) {
  const toast = useToast();
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const commentRef = useRef<HTMLTextAreaElement>(null);

  const sendingRef = useRef(false);
  const addM = useMutation({
    mutationFn: () => tasksService.addComment(taskId, body.trim()),
    onSuccess: () => { setBody(''); setError(''); invalidate(); },
    onError: (e) => { setError(errMsg(e, 'Không thể gửi bình luận.')); commentRef.current?.focus(); },
    onSettled: () => { sendingRef.current = false; },
  });
  const editM = useMutation({
    mutationFn: ({ cid, text }: { cid: string; text: string }) => tasksService.updateComment(cid, text),
    onSuccess: () => { setEditingId(null); invalidate(); toast.success('Đã cập nhật bình luận.'); },
    onError: (e) => toast.error(errMsg(e, 'Không thể cập nhật bình luận.')),
  });

  const submit = () => {
    if (sendingRef.current) return;
    const trimmed = body.trim();
    if (!trimmed) { setError('Hãy viết nội dung bình luận.'); commentRef.current?.focus(); return; }
    if (trimmed.length > 2000) { setError('Bình luận tối đa 2.000 ký tự.'); commentRef.current?.focus(); return; }
    sendingRef.current = true;
    addM.mutate();
  };

  return (
    <Card className="p-4 sm:p-6">
      <h3 className="text-section font-semibold text-ink">Bình luận{comments.length ? ` (${comments.length})` : ''}</h3>
      {canComment && (
      <form noValidate className="mt-3" onSubmit={e => { e.preventDefault(); submit(); }}>
        <label htmlFor="task-comment" className="sr-only">Viết bình luận</label>
        <textarea id="task-comment" ref={commentRef} rows={3} maxLength={2000} placeholder="Viết bình luận…" value={body}
          aria-invalid={!!error} aria-describedby={'task-comment-hint' + (error ? ' task-comment-error' : '')}
          disabled={busy || addM.isPending}
          onChange={e => { setBody(e.target.value); if (error) setError(''); }}
          onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); submit(); } }}
          className="app-surface w-full rounded-xl border border-line bg-white px-4 py-2.5 text-body" />
        <p id="task-comment-hint" className="mt-1 text-caption text-ink-muted">Tối đa 2.000 ký tự. Ctrl + Enter để gửi.</p>
        {error && <p id="task-comment-error" role="alert" className="mt-1 text-small text-danger-700 [overflow-wrap:anywhere]">{error}</p>}
        <Button type="submit" className="mt-3" disabled={busy} isLoading={addM.isPending}>Gửi bình luận</Button>
      </form>
      )}

      {comments.length === 0 ? (
        <p className="mt-4 text-small text-ink-muted">Chưa có bình luận. Hãy trao đổi về công việc tại đây.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {comments.map(c => (
            <li key={c.id} className="flex gap-3 py-3 min-w-0">
              <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-caption font-semibold text-primary-700">{initials(c.authorName)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-small min-w-0 [overflow-wrap:anywhere]">
                  <span className="font-semibold text-ink">{c.authorName}</span>{' '}
                  <span className="text-caption text-ink-muted">
                    {formatDateTime(c.createdAt)}{c.updatedAt && c.updatedAt !== c.createdAt ? ' · đã sửa' : ''}
                  </span>
                </p>
                {editingId === c.id ? (
                  <div className="mt-2">
                    <label htmlFor={`edit-${c.id}`} className="sr-only">Sửa bình luận</label>
                    <textarea id={`edit-${c.id}`} rows={3} maxLength={2000} value={editBody} onChange={e => setEditBody(e.target.value)}
                      disabled={editM.isPending}
                      className="app-surface w-full rounded-xl border border-line bg-white px-3 py-2 text-body" />
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" isLoading={editM.isPending} disabled={!editBody.trim()}
                        onClick={() => editM.mutate({ cid: c.id, text: editBody.trim() })}>Lưu</Button>
                      <Button size="sm" variant="secondary" disabled={editM.isPending} onClick={() => setEditingId(null)}>Hủy</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mt-0.5 text-body text-ink whitespace-pre-wrap [overflow-wrap:anywhere]">{c.body}</p>
                    {(c.canEdit || c.canDelete) && (
                      <div className="mt-1 flex gap-3">
                        {c.canEdit && (
                          <button type="button" className="text-caption font-medium text-primary-700 hover:underline"
                            onClick={() => { setEditingId(c.id); setEditBody(c.body); }}>Sửa</button>
                        )}
                        {c.canDelete && (
                          <button type="button" className="text-caption font-medium text-danger-700 hover:underline"
                            onClick={() => onDelete(c.id)}>Xóa</button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DeleteCommentConfirm({ commentId, invalidate, onDone }: { commentId: string | null; invalidate: () => void; onDone: () => void }) {
  const toast = useToast();
  const [error, setError] = useState('');
  const delM = useMutation({
    mutationFn: () => tasksService.deleteComment(commentId!),
    onSuccess: () => { invalidate(); toast.success('Đã xóa bình luận.'); onDone(); },
    onError: (e) => setError(errMsg(e, 'Không thể xóa bình luận.')),
  });
  return (
    <>
      {error && <p role="alert" className="mt-2 text-small text-danger-700">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" disabled={delM.isPending} onClick={onDone}>Hủy</Button>
        <Button variant="danger" isLoading={delM.isPending} onClick={() => { setError(''); delM.mutate(); }}>Xóa</Button>
      </div>
    </>
  );
}

/* ---------- Dialogs ---------- */
const PRIORITY_OPTIONS: [number, string][] = [[1, 'Thấp'], [2, 'Trung bình'], [3, 'Cao'], [4, 'Khẩn cấp']];
const PRIORITY_NUM: Record<string, number> = { Low: 1, Medium: 2, High: 3, Urgent: 4 };

function EditDialog({ task, isLeader, invalidate, onClose }: {
  task: TaskDetailDto; isLeader: boolean; invalidate: () => void; onClose: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [priority, setPriority] = useState(PRIORITY_NUM[task.priority] ?? 2);
  const [deadline, setDeadline] = useState(vnInputValue(task.deadlineAt));
  const [estimate, setEstimate] = useState(task.estimateHours != null ? String(task.estimateHours) : '');
  const [points, setPoints] = useState(task.points != null ? String(task.points) : '');
  const [error, setError] = useState('');

  const editM = useMutation({
    mutationFn: () => tasksService.update(task.id, {
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      deadlineAt: vnToIso(deadline),
      estimateHours: estimate.trim() === '' ? undefined : Number(estimate),
      ...(isLeader && !task.parentTaskId ? { points: points.trim() === '' ? undefined : Number(points) } : {}),
    }),
    onSuccess: () => { invalidate(); toast.success('Đã cập nhật công việc.'); onClose(); },
    onError: (e) => setError(errMsg(e, 'Không thể cập nhật công việc.')),
  });

  const submit = () => {
    if (!title.trim()) { setError('Hãy nhập tiêu đề công việc.'); return; }
    if (estimate.trim() !== '' && (Number.isNaN(Number(estimate)) || Number(estimate) < 0)) { setError('Ước tính phải là số giờ không âm.'); return; }
    if (points.trim() !== '' && (Number.isNaN(Number(points)) || Number(points) < 0)) { setError('Điểm phải là số không âm.'); return; }
    editM.mutate();
  };

  return (
    <ConfirmationDialog open title="Sửa công việc" busy={editM.isPending} onClose={onClose}>
      <div className="space-y-4">
        <Input id="edit-title" label="Tiêu đề" maxLength={200} value={title} disabled={editM.isPending} onChange={e => setTitle(e.target.value)} />
        <div>
          <label htmlFor="edit-desc" className="mb-1.5 block text-small font-semibold text-ink-secondary">Mô tả</label>
          <textarea id="edit-desc" rows={4} maxLength={4000} value={description} disabled={editM.isPending} onChange={e => setDescription(e.target.value)}
            className="w-full rounded-xl border border-line bg-white px-3 py-2 text-body" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="edit-priority" className="mb-1.5 block text-small font-semibold text-ink-secondary">Ưu tiên</label>
            <select id="edit-priority" value={priority} disabled={editM.isPending} onChange={e => setPriority(Number(e.target.value))}
              className="h-11 w-full rounded-xl border border-line bg-white px-3 text-body">
              {PRIORITY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="edit-deadline" className="mb-1.5 block text-small font-semibold text-ink-secondary">Hạn (giờ VN)</label>
            <input id="edit-deadline" type="datetime-local" value={deadline} disabled={editM.isPending} onChange={e => setDeadline(e.target.value)}
              className="h-11 w-full rounded-xl border border-line bg-white px-3 text-body" />
          </div>
          <Input id="edit-estimate" label="Ước tính (giờ)" type="number" min={0} step={0.5} value={estimate} disabled={editM.isPending} onChange={e => setEstimate(e.target.value)} />
          {isLeader && !task.parentTaskId && (
            <Input id="edit-points" label="Điểm" type="number" min={0} step={1} value={points} disabled={editM.isPending} onChange={e => setPoints(e.target.value)} />
          )}
        </div>
        {error && <p role="alert" className="text-small text-danger-700 [overflow-wrap:anywhere]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={editM.isPending} onClick={onClose}>Hủy</Button>
          <Button isLoading={editM.isPending} onClick={submit}>Lưu thay đổi</Button>
        </div>
      </div>
    </ConfirmationDialog>
  );
}

function AssignDialog({ task, members, invalidate, onClose }: {
  task: TaskDetailDto; members: GroupMemberDto[]; invalidate: () => void; onClose: () => void;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState(task.assigneeUserId ?? '');
  const [error, setError] = useState('');

  const assignM = useMutation({
    mutationFn: () => tasksService.assign(task.id, selected || undefined),
    onSuccess: () => { invalidate(); toast.success(selected ? 'Đã giao lại công việc.' : 'Đã bỏ giao công việc.'); onClose(); },
    onError: (e) => setError(errMsg(e, 'Không thể giao lại công việc.')),
  });

  return (
    <ConfirmationDialog open title="Giao lại công việc" busy={assignM.isPending} onClose={onClose}>
      <label htmlFor="assign-member" className="block text-small font-semibold text-ink-secondary">Người phụ trách</label>
      <select id="assign-member" value={selected} disabled={assignM.isPending} onChange={e => setSelected(e.target.value)}
        className="mt-1.5 h-11 w-full rounded-xl border border-line bg-white px-3 text-body">
        <option value="">Bỏ giao (chưa giao ai)</option>
        {members.map(m => (
          <option key={m.userId} value={m.userId}>
            {m.displayName}{m.openTaskCount != null ? ` — ${m.openTaskCount} việc đang làm` : ''}
          </option>
        ))}
      </select>
      {error && <p role="alert" className="mt-2 text-small text-danger-700 [overflow-wrap:anywhere]">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" disabled={assignM.isPending} onClick={onClose}>Hủy</Button>
        <Button isLoading={assignM.isPending} onClick={() => assignM.mutate()}>Giao lại</Button>
      </div>
    </ConfirmationDialog>
  );
}

/* ---------- Người hỗ trợ ---------- */
function HelpersCard({ taskId, active, ended, invalidate, className = '' }: {
  taskId: string;
  active: import('../services/groups').TaskHelperDto[];
  ended: import('../services/groups').TaskHelperDto[];
  invalidate: () => void; className?: string;
}) {
  const toast = useToast();
  const [ending, setEnding] = useState<import('../services/groups').TaskHelperDto | null>(null);
  const [error, setError] = useState('');
  const endM = useMutation({
    mutationFn: (rowId: string) => tasksService.endHelper(taskId, rowId),
    onSuccess: () => { toast.success('Đã kết thúc hỗ trợ.'); setEnding(null); invalidate(); },
    onError: e => setError(errMsg(e, 'Không kết thúc được hỗ trợ.')),
  });
  const row = (h: import('../services/groups').TaskHelperDto, showEnd: boolean) => (
    <li key={h.id} className="py-2.5 min-w-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <UserAvatar name={h.displayName} url={h.avatarUrl} size={28} />
        <span className="min-w-0 flex-1">
          <span className="block text-small font-medium text-ink [overflow-wrap:anywhere]">{h.displayName}</span>
          <span className="text-caption text-ink-muted">
            Từ {formatDate(h.createdAt)}{h.endedAt ? ` đến ${formatDate(h.endedAt)}` : ''}
          </span>
        </span>
        {showEnd && h.canEnd && (
          <Button size="sm" variant="secondary" className="min-h-9 shrink-0" onClick={() => { setError(''); setEnding(h); }}>
            Kết thúc hỗ trợ
          </Button>
        )}
      </div>
      <p className="mt-1 text-caption text-ink-secondary [overflow-wrap:anywhere]">{h.scope}</p>
    </li>
  );
  return (
    <Card className={`p-4 sm:p-6 ${className}`}>
      <h3 className="text-section font-semibold text-ink">Người hỗ trợ ({active.length})</h3>
      <ul className="mt-2 divide-y divide-line">{active.map(h => row(h, true))}</ul>
      {ended.length > 0 && (
        <details className="mt-3 border-t border-line pt-3">
          <summary className="min-h-9 cursor-pointer text-small font-medium text-ink-secondary hover:text-ink">Đã kết thúc ({ended.length})</summary>
          <ul className="mt-1 divide-y divide-line">{ended.map(h => row(h, false))}</ul>
        </details>
      )}
      <ConfirmationDialog open={!!ending} busy={endM.isPending} title="Kết thúc hỗ trợ"
        onClose={() => { if (!endM.isPending) setEnding(null); }}>
        <p>Kết thúc hỗ trợ của {ending?.displayName} cho công việc này? Họ sẽ không còn xem hay bình luận được.</p>
        {error && <p role="alert" className="mt-3 text-small text-danger-700">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="danger" className="min-h-11" disabled={endM.isPending} isLoading={endM.isPending}
            onClick={() => ending && endM.mutate(ending.id)}>Kết thúc hỗ trợ</Button>
          <Button variant="secondary" className="min-h-11" disabled={endM.isPending} onClick={() => setEnding(null)}>Hủy</Button>
        </div>
      </ConfirmationDialog>
    </Card>
  );
}
