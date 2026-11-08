import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Icon from '../components/ui/Icon';
import '../components/tasks/tasks.css';
import { tasksService, TaskStatus, hasTaskDetails, type TaskDetailDto, type CommentDto, type LinkDto } from '../services/tasks';
import { loadTaskWorkspace } from '../services/workspace';
import { authService } from '../services/auth';
import { formatDateTime, STATUS_LABEL, PRIORITY_LABEL } from '../utils/presentation';
import { deadlineTime } from '../components/dashboard/dashboard-model';

type Workspace = Awaited<ReturnType<typeof loadTaskWorkspace>>;
type ActionKind = 'comment' | 'link' | 'status';
type ErrorKey = 'comment' | 'link' | 'review' | 'status';
const STATUS_NOTICE: Record<number, string> = {
  [TaskStatus.InProgress]: 'Đã chuyển công việc sang đang làm.',
  [TaskStatus.Submitted]: 'Đã nộp công việc để duyệt.',
  [TaskStatus.ChangesRequested]: 'Đã yêu cầu chỉnh sửa.',
  [TaskStatus.Completed]: 'Đã duyệt hoàn thành công việc.',
};
const status = (e: unknown) => (e as { status?: number })?.status;
const errMsg = (e: unknown, fb: string) =>
  typeof (e as { message?: unknown })?.message === 'string' && (e as { message?: unknown }).message ? (e as { message: string }).message : fb;
const initials = (n?: string | null) => (n || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
function httpUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try { const parsed = new URL(trimmed); return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : null; }
  catch { return null; }
}

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const me = authService.currentUser();
  return <MainLayout><TaskWorkspace key={`${id ?? ''}:${me?.id ?? ''}`} id={id ?? ''} userId={me?.id ?? ''} /></MainLayout>;
}

function TaskWorkspace({ id, userId }: { id: string; userId: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fatalError, setFatalError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [success, setSuccess] = useState('');
  const [actionErrors, setActionErrors] = useState<Partial<Record<ErrorKey, string>>>({});
  const [comment, setComment] = useState('');
  const [link, setLink] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [pending, setPending] = useState<ActionKind | null>(null);
  const [pendingStatus, setPendingStatus] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const loadVersion = useRef(0);
  const actionVersion = useRef(0);
  const pendingRef = useRef(false);
  const refreshingRef = useRef(false);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const reviewRef = useRef<HTMLTextAreaElement>(null);
  const focusAfterBusy = useRef<ErrorKey | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    const onFocus = () => setNow(Date.now());
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, []);

  const clearPrivate = useCallback(() => {
    setWorkspace(null); setComment(''); setLink(''); setReviewNote('');
    setActionErrors({}); setSuccess(''); setRefreshError('');
  }, []);

  const invalidateRequests = useCallback(() => {
    loadVersion.current++; actionVersion.current++;
    pendingRef.current = false; refreshingRef.current = false;
  }, []);

  const fetchWorkspace = useCallback(async (quiet = false) => {
    const version = ++loadVersion.current;
    try {
      const data = await loadTaskWorkspace(id);
      if (version !== loadVersion.current) return;
      if (hasTaskDetails(data.task)) {
        setWorkspace(data);
      } else {
        setWorkspace({ ...data, comments: [], links: [], reviews: [] });
        setComment(''); setLink(''); setReviewNote(''); setActionErrors({});
      }
      setFatalError('');
    } catch (e: unknown) {
      if (version !== loadVersion.current) return;
      const s = status(e);
      if (s === 403 || s === 404) {
        clearPrivate();
        setFatalError(errMsg(e, 'Không tải được dữ liệu'));
      } else if (!quiet) {
        setWorkspace(null);
        setFatalError(errMsg(e, 'Không tải được dữ liệu'));
      } else {
        setRefreshError('Thao tác đã được lưu nhưng chưa tải lại được đầy đủ chi tiết. ' + errMsg(e, ''));
      }
    } finally {
      if (version === loadVersion.current) {
        setLoading(false); setRefreshing(false); refreshingRef.current = false;
      }
    }
  }, [id, clearPrivate]);

  const reload = useCallback((quiet = false) => {
    if (!quiet) { setLoading(true); setWorkspace(null); setFatalError(''); setSuccess(''); }
    setRefreshError('');
    if (quiet) { refreshingRef.current = true; setRefreshing(true); }
    return fetchWorkspace(quiet);
  }, [fetchWorkspace]);

  useEffect(() => {
    if (!authService.isLoggedIn()) { navigate('/login'); return; }
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) return fetchWorkspace(false); });
    return () => { cancelled = true; invalidateRequests(); };
  }, [fetchWorkspace, invalidateRequests, navigate]);

  useEffect(() => {
    if (pending || refreshing || !focusAfterBusy.current) return;
    const k = focusAfterBusy.current; focusAfterBusy.current = null;
    (k === 'comment' ? commentRef : k === 'link' ? linkRef : reviewRef).current?.focus();
  }, [pending, refreshing, actionErrors]);

  const busy = pending !== null || refreshing;

  async function mutate<T>(kind: ActionKind, request: () => Promise<T>, apply: (result: T) => void, notice: string, errorKey: ErrorKey = kind) {
    if (pendingRef.current || refreshingRef.current) return;
    pendingRef.current = true;
    const action = ++actionVersion.current;
    const version = loadVersion.current;
    setPending(kind);
    setSuccess(''); setRefreshError('');
    setActionErrors(err => ({ ...err, [errorKey]: undefined }));
    try {
      const result = await request();
      if (action !== actionVersion.current || version !== loadVersion.current) return;
      apply(result);
      setSuccess(notice);
      await reload(true);
    } catch (e: unknown) {
      if (action !== actionVersion.current || version !== loadVersion.current) return;
      const s = status(e);
      if (s === 403 || s === 404) {
        loadVersion.current++;
        clearPrivate();
        setFatalError(errMsg(e, 'Không thực hiện được thao tác'));
        setLoading(false);
      } else {
        setActionErrors(err => ({ ...err, [errorKey]: errMsg(e, 'Không thực hiện được thao tác') }));
        focusAfterBusy.current = errorKey === 'status' ? null : errorKey;
      }
    } finally {
      if (action === actionVersion.current) { pendingRef.current = false; setPending(null); setPendingStatus(null); }
    }
  }

  const postStatus = (target: number) => {
    if (pendingRef.current || refreshingRef.current) return;
    setPendingStatus(target);
    void mutate('status',
      () => tasksService.changeStatus(id, target, reviewNote.trim() ? reviewNote.trim() : undefined),
      (dto: TaskDetailDto) => { setWorkspace(w => w ? { ...w, task: dto } : w); setReviewNote(''); },
      STATUS_NOTICE[target] ?? 'Đã đổi trạng thái.');
  };

  const submitReview = (target: number) => {
    const note = reviewNote.trim();
    let error = '';
    if (target === TaskStatus.ChangesRequested && !note) error = 'Nhập nhận xét trước khi trả về sửa.';
    else if (note.length > 2000) error = 'Nhận xét tối đa 2.000 ký tự.';
    if (error) { setActionErrors(e => ({ ...e, review: error })); focusAfterBusy.current = null; reviewRef.current?.focus(); return; }
    setActionErrors(e => ({ ...e, review: undefined }));
    postStatus(target);
  };

  const submitComment = () => {
    if (pendingRef.current || refreshingRef.current) return;
    const body = comment.trim();
    const error = !body ? 'Nhập nội dung bình luận.' : comment.length > 2000 ? 'Bình luận tối đa 2.000 ký tự.' : '';
    if (error) { setActionErrors(x => ({ ...x, comment: error })); commentRef.current?.focus(); return; }
    void mutate('comment', () => tasksService.addComment(id, body),
      (dto: CommentDto) => { setWorkspace(w => w && !w.comments.some(c => c.id === dto.id) ? { ...w, comments: [...w.comments, dto] } : w); setComment(''); },
      'Đã gửi bình luận.');
  };

  const submitLink = () => {
    if (pendingRef.current || refreshingRef.current) return;
    const url = link.trim();
    const error = !url ? 'Nhập liên kết tài liệu.' : link.length > 2000 ? 'Liên kết tối đa 2.000 ký tự.' : !httpUrl(url) ? 'Nhập liên kết bắt đầu bằng http:// hoặc https://.' : '';
    if (error) { setActionErrors(x => ({ ...x, link: error })); linkRef.current?.focus(); return; }
    void mutate('link', () => tasksService.addLink(id, url),
      (dto: LinkDto) => { setWorkspace(w => w && !w.links.some(l => l.id === dto.id) ? { ...w, links: [dto, ...w.links] } : w); setLink(''); },
      'Đã thêm liên kết.');
  };

  const onCommentKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); submitComment(); }
  };

  const raw = location.state && typeof location.state === 'object' ? location.state as Record<string, unknown> : {};
  const candidate = raw.returnTo;
  const navigationSection = raw.navigationSection === '/dashboard' ? '/dashboard'
    : raw.navigationSection === '/groups' ? '/groups'
    : raw.navigationSection === '/calendar' ? '/calendar' : raw.navigationSection === '/notifications' ? '/notifications' : '/my-tasks';
  const projectBase = workspace?.task ? `/projects/${workspace.task.projectId}` : '';
  const returnTo = typeof candidate === 'string' &&
    (candidate === '/my-tasks' || candidate.startsWith('/my-tasks?') ||
      candidate === '/calendar' || candidate.startsWith('/calendar?') ||
      candidate === '/notifications' || candidate.startsWith('/notifications?') ||
      (projectBase !== '' && (candidate === projectBase || candidate.startsWith(`${projectBase}?`))))
    ? candidate : undefined;
  const navState = { navigationSection, ...(returnTo ? { returnTo } : {}) };
  const backTo = returnTo && projectBase && returnTo.startsWith(projectBase) ? { to: returnTo, label: 'Về dự án' }
    : returnTo && (returnTo === '/calendar' || returnTo.startsWith('/calendar?')) ? { to: returnTo, label: 'Về Lịch công việc' }
    : returnTo && (returnTo === '/notifications' || returnTo.startsWith('/notifications?')) ? { to: returnTo, label: 'Về Thông báo' }
    : returnTo ? { to: returnTo, label: 'Về Việc của tôi' }
    : navigationSection === '/dashboard' ? { to: '/dashboard', label: 'Về Tổng quan' }
    : navigationSection === '/calendar' ? { to: '/calendar', label: 'Về Lịch công việc' }
    : navigationSection === '/notifications' ? { to: '/notifications', label: 'Về Thông báo' }
    : navigationSection === '/groups' && projectBase ? { to: projectBase, label: 'Về dự án' }
    : { to: '/my-tasks', label: 'Về Việc của tôi' };

  const task = workspace?.task ?? null;
  const details = !!task && hasTaskDetails(task);
  const dt = task && hasTaskDetails(task) ? task : null;
  const myRole = workspace?.myRole ?? 'Member';
  const isLeader = myRole === 'Leader';
  const isAssignee = !!task && task.assigneeUserId === userId;
  const time = task ? deadlineTime(task.deadlineAt) : null;
  const isOverdue = time !== null && time < now && task?.status !== 'Completed';
  const statusBtn = (target: number, label: string, extra = '') => (
    <Button key={target} className={`task-primary min-h-11 ${extra}`} disabled={busy}
      isLoading={pendingStatus === target && pending === 'status'} onClick={() => postStatus(target)}>{label}</Button>
  );

  const actionPanel = dt ? (
    <>
      <h3 className="font-semibold text-slate-900">Thao tác</h3>
      <div className="mt-3 space-y-3" aria-busy={busy}>
        {dt.status === 'ToDo' && isAssignee && (
          <>
            <p className="text-sm text-slate-600">Sẵn sàng thực hiện công việc này.</p>
            {statusBtn(TaskStatus.InProgress, 'Bắt đầu làm', 'w-full')}
          </>
        )}
        {dt.status === 'InProgress' && isAssignee && (
          <>
            <p className="text-sm text-slate-600">Thêm liên kết kết quả nếu cần, rồi nộp cho Leader duyệt.</p>
            {statusBtn(TaskStatus.Submitted, 'Nộp để duyệt', 'w-full')}
          </>
        )}
        {dt.status === 'Submitted' && isLeader && (
          <>
            <label htmlFor="review-note" className="block text-sm font-medium text-slate-700">Nhận xét duyệt</label>
            <textarea id="review-note" ref={reviewRef} rows={3} maxLength={2000} value={reviewNote}
              aria-invalid={!!actionErrors.review}
              aria-describedby={'review-note-hint' + (actionErrors.review ? ' review-note-error' : '')}
              onChange={e => { setReviewNote(e.target.value); if (actionErrors.review) setActionErrors(x => ({ ...x, review: undefined })); }}
              disabled={busy} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-base focus:outline-none focus:ring-2" />
            <p id="review-note-hint" className="text-xs text-slate-600">Bắt buộc khi trả về sửa; tối đa 2.000 ký tự.</p>
            {actionErrors.review && <p id="review-note-error" role="alert" className="text-sm text-danger-700 [overflow-wrap:anywhere]">{actionErrors.review}</p>}
            <div className="flex gap-2 flex-wrap">
              <Button className="task-primary min-h-11" disabled={busy}
                isLoading={pendingStatus === TaskStatus.Completed && pending === 'status'}
                onClick={() => submitReview(TaskStatus.Completed)}>Duyệt hoàn thành</Button>
              <Button variant="secondary" className="min-h-11 text-danger-700" disabled={busy}
                isLoading={pendingStatus === TaskStatus.ChangesRequested && pending === 'status'}
                onClick={() => submitReview(TaskStatus.ChangesRequested)}>Trả về sửa</Button>
            </div>
          </>
        )}
        {dt.status === 'Submitted' && isAssignee && !isLeader && (
          <p className="text-sm text-slate-600">Đã nộp để duyệt{dt.submittedAt ? ` lúc ${formatDateTime(dt.submittedAt)}` : ''}. Leader sẽ xem xét và phản hồi.</p>
        )}
        {dt.status === 'ChangesRequested' && isAssignee && (
          <>
            <p className="text-sm text-slate-600">Xem phản hồi ở <a href="#task-review-history" className="text-primary-700 hover:underline">lịch sử duyệt</a>, chỉnh sửa rồi nộp lại.</p>
            {statusBtn(TaskStatus.InProgress, 'Làm lại', 'w-full')}
          </>
        )}
        {dt.status === 'Completed' && (
          <p className="text-sm text-success-700">Công việc đã hoàn thành.{dt.completedAt ? ` (${formatDateTime(dt.completedAt)})` : ''}</p>
        )}
        {isLeader && !isAssignee && ['ToDo', 'InProgress', 'ChangesRequested'].includes(dt.status) && (
          <p className="text-sm text-slate-600">Người phụ trách sẽ cập nhật trạng thái. Bạn có thể trao đổi ở phần bình luận.</p>
        )}
        {actionErrors.status && <p role="alert" className="text-sm text-danger-700 [overflow-wrap:anywhere]">{actionErrors.status}</p>}
      </div>
      <div className="mt-5 border-t border-slate-200 pt-5">
        <h3 className="font-semibold text-slate-900">Thông tin công việc</h3>
        <dl className="mt-3 space-y-3">
          <div className="min-w-0">
            <dt className="text-sm text-slate-600">Người phụ trách</dt>
            <dd className="mt-1 flex items-center gap-2 font-medium min-w-0">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">{initials(dt.assigneeName)}</span>
              <span className="min-w-0 [overflow-wrap:anywhere]">{dt.assigneeName || 'Chưa giao'}</span>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">Hạn</dt>
            <dd className={`mt-0.5 text-base font-medium ${isOverdue ? 'text-danger-700' : 'text-slate-900'}`}>
              {time === null ? 'Chưa đặt hạn' : `${isOverdue ? 'Quá hạn · ' : ''}${formatDateTime(dt.deadlineAt!)}`}
              <span className="block text-xs font-normal text-slate-600">(giờ Việt Nam)</span>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">Ưu tiên</dt>
            <dd className="mt-1"><Badge value={dt.priority} className={dt.priority === 'Urgent' ? '!text-danger-700' : ''}>{PRIORITY_LABEL[dt.priority] ?? dt.priority}</Badge></dd>
          </div>
          {dt.progressPercent != null && (
            <div>
              <dt className="text-sm text-slate-600">Tiến độ</dt>
              <dd className="mt-1">
                <span className="text-base font-semibold tabular-nums">{dt.progressPercent}%</span>
                <div role="progressbar" aria-label="Tiến độ công việc" aria-valuenow={dt.progressPercent} aria-valuemin={0} aria-valuemax={100}
                  className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-primary-600" style={{ width: `${dt.progressPercent}%` }} />
                </div>
              </dd>
            </div>
          )}
          {dt.estimateHours != null && (
            <div><dt className="text-sm text-slate-600">Ước lượng</dt><dd className="mt-0.5 text-base">{dt.estimateHours} giờ</dd></div>
          )}
          {dt.createdAt && (
            <div><dt className="text-sm text-slate-600">Tạo lúc</dt><dd className="mt-0.5 text-sm text-slate-600">{formatDateTime(dt.createdAt)}</dd></div>
          )}
        </dl>
      </div>
    </>
  ) : null;

  return (
    <div className="task-surface space-y-6">
      <nav aria-label="Điều hướng công việc" className="flex flex-wrap items-center justify-between gap-2">
        <Link to={backTo.to} className="inline-flex min-h-9 items-center gap-1 text-sm text-primary-700 font-medium hover:underline">
          <Icon name="chevron-left" size={16} />{backTo.label}
        </Link>
        {task && (
          <div className="flex flex-wrap items-center gap-3">
            {task.parentTaskId && (
              <Link to={`/tasks/${task.parentTaskId}`} state={navState} className="inline-flex min-h-9 items-center text-sm text-primary-700 font-medium hover:underline">Mở công việc cha</Link>
            )}
            <Link to={`/projects/${task.projectId}`} className="inline-flex min-h-9 items-center text-sm text-primary-700 font-medium hover:underline">Về dự án</Link>
          </div>
        )}
      </nav>

      {loading && (
        <>
          <p role="status" className="sr-only">Đang tải công việc…</p>
          <div aria-hidden="true" className="space-y-6 motion-safe:animate-pulse">
            <div className="h-8 w-64 rounded bg-slate-100" />
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_336px]">
              <div className="h-64 rounded-2xl bg-slate-100" />
              <div className="h-64 rounded-2xl bg-slate-100" />
            </div>
          </div>
        </>
      )}

      {!loading && (fatalError || !task) && (
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Không thể tải công việc</h2>
          <p role="alert" className="text-sm text-danger-700 [overflow-wrap:anywhere]">{fatalError || 'Không tìm thấy công việc.'}</p>
          <Button variant="secondary" className="mt-3" onClick={() => void reload(false)}>Thử lại</Button>
        </div>
      )}

      {!loading && task && (
        <>
          <header className="min-w-0">
            <h2 className="text-2xl font-bold text-slate-900 [overflow-wrap:anywhere]">{task.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge value={task.status} className={task.status === 'ChangesRequested' ? '!text-danger-700' : ''}>{STATUS_LABEL[task.status] ?? task.status}</Badge>
              <Badge value={task.priority} className={task.priority === 'Urgent' ? '!text-danger-700' : ''}>{PRIORITY_LABEL[task.priority] ?? task.priority}</Badge>
            </div>
            <p className={`mt-2 text-sm min-w-0 [overflow-wrap:anywhere] ${isOverdue ? 'text-danger-700 font-medium' : 'text-slate-600'}`}>
              {task.assigneeName || 'Chưa giao'} · {time === null ? 'Chưa đặt hạn' : `${isOverdue ? 'Quá hạn · ' : ''}${formatDateTime(task.deadlineAt!)}`}
            </p>
          </header>

          {refreshing && <p role="status" className="sr-only">Đang tải lại chi tiết…</p>}
          {refreshError && (
            <div>
              <p role="alert" className="text-sm text-danger-700 [overflow-wrap:anywhere]">{refreshError}</p>
              <Button variant="secondary" className="mt-2 min-h-11" disabled={busy} isLoading={refreshing}
                onClick={() => { if (!pendingRef.current && !refreshingRef.current) void reload(true); }}>Tải lại chi tiết</Button>
            </div>
          )}
          {success && <p role="status" className="text-sm font-medium text-success-700">{success}</p>}

          {!details && (
            <Card className="p-4 sm:p-6">
              <p className="text-sm text-slate-600">Bạn đang xem thông tin chung. Chỉ Leader và người phụ trách được xem chi tiết công việc.</p>
            </Card>
          )}

          {dt && (
            <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_336px]">
              <aside className="min-w-0 xl:col-start-2 xl:row-start-1">
                <Card className="p-4 sm:p-6">{actionPanel}</Card>
              </aside>
              <div className="min-w-0 space-y-6 xl:col-start-1 xl:row-start-1">
                <Card className="p-4 sm:p-6">
                  <h3 className="font-semibold text-slate-900">Mô tả</h3>
                  {dt.description ? (
                    <p className="mt-3 max-w-[65ch] text-base text-slate-800 whitespace-pre-wrap [overflow-wrap:anywhere]">{dt.description}</p>
                  ) : <p className="mt-3 text-sm text-slate-600">Chưa có mô tả.</p>}
                  <div className="mt-5 border-t border-slate-200 pt-5">
                    <h3 className="font-semibold text-slate-900">Tài liệu liên quan</h3>
                    {workspace!.links.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-600">Chưa có liên kết tài liệu.</p>
                    ) : (
                      <ul className="mt-3 divide-y divide-slate-100">
                        {workspace!.links.map(l => {
                          const safe = httpUrl(l.url);
                          return (
                            <li key={l.id} className="flex items-center gap-2 py-2.5 min-w-0">
                              <Icon name="link" size={16} className="shrink-0 text-slate-500" />
                              {safe ? (
                                <a href={safe} target="_blank" rel="noopener noreferrer" className="min-w-0 text-primary-700 hover:underline [overflow-wrap:anywhere]">
                                  {l.displayName || l.url}<span className="sr-only"> (mở tab mới)</span>
                                </a>
                              ) : (
                                <span className="min-w-0 text-slate-600 [overflow-wrap:anywhere]">{l.displayName || l.url}</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <form noValidate className="mt-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={e => { e.preventDefault(); submitLink(); }}>
                      <div className="min-w-0">
                        <Input id="task-link" ref={linkRef} label="Thêm liên kết" type="url" maxLength={2000} placeholder="https://..." value={link}
                          disabled={busy} onChange={e => { setLink(e.target.value); if (actionErrors.link) setActionErrors(x => ({ ...x, link: undefined })); }}
                          error={actionErrors.link} className="rounded-xl" />
                      </div>
                      <Button type="submit" variant="secondary" className="min-h-11 w-full sm:w-auto" disabled={busy} isLoading={pending === 'link'}>Thêm liên kết</Button>
                    </form>
                  </div>
                </Card>

                <Card className="p-4 sm:p-6">
                  <h3 className="font-semibold text-slate-900">Bình luận{workspace!.comments.length ? ` (${workspace!.comments.length})` : ''}</h3>
                  <form noValidate className="mt-3" onSubmit={e => { e.preventDefault(); submitComment(); }}>
                    <label htmlFor="task-comment" className="block text-sm font-medium text-slate-700 mb-1">Viết bình luận</label>
                    <textarea id="task-comment" ref={commentRef} rows={3} maxLength={2000} placeholder="Viết bình luận..." value={comment}
                      aria-invalid={!!actionErrors.comment}
                      aria-describedby={'task-comment-hint' + (actionErrors.comment ? ' task-comment-error' : '')}
                      disabled={busy} onChange={e => { setComment(e.target.value); if (actionErrors.comment) setActionErrors(x => ({ ...x, comment: undefined })); }}
                      onKeyDown={onCommentKey} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-base focus:outline-none focus:ring-2" />
                    <p id="task-comment-hint" className="mt-1 text-xs text-slate-600">Tối đa 2.000 ký tự. Ctrl + Enter để gửi.</p>
                    {actionErrors.comment && <p id="task-comment-error" role="alert" className="mt-1 text-sm text-danger-700 [overflow-wrap:anywhere]">{actionErrors.comment}</p>}
                    <Button type="submit" className="task-primary mt-3 min-h-11" disabled={busy} isLoading={pending === 'comment'}>Gửi</Button>
                  </form>
                  {workspace!.comments.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-600">Chưa có bình luận. Hãy trao đổi về công việc tại đây.</p>
                  ) : (
                    <ul className="mt-4 divide-y divide-slate-100">
                      {workspace!.comments.map(c => (
                        <li key={c.id} className="flex gap-3 py-3 min-w-0">
                          <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">{initials(c.authorName)}</span>
                          <div className="min-w-0">
                            <p className="text-sm min-w-0 [overflow-wrap:anywhere]"><span className="font-semibold">{c.authorName}</span> <span className="text-xs text-slate-600">{formatDateTime(c.createdAt)}</span></p>
                            <p className="mt-0.5 text-base text-slate-800 whitespace-pre-wrap [overflow-wrap:anywhere]">{c.body}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card className="p-4 sm:p-6 scroll-mt-24" id="task-review-history">
                  <h3 className="font-semibold text-slate-900">Lịch sử duyệt</h3>
                  {workspace!.reviews.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-600">Chưa có lượt duyệt. Lịch sử sẽ xuất hiện khi Leader duyệt hoặc yêu cầu chỉnh sửa.</p>
                  ) : (
                    <ul className="mt-3 divide-y divide-slate-100">
                      {workspace!.reviews.map(r => (
                        <li key={r.id} className="py-3">
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <span className="text-sm font-semibold min-w-0 [overflow-wrap:anywhere]">{r.reviewerName}</span>
                            <Badge value={r.decision} className={r.decision === 'ChangesRequested' ? '!text-danger-700' : ''}>{r.decision === 'Completed' ? 'Đã duyệt' : 'Yêu cầu chỉnh sửa'}</Badge>
                            <span className="text-xs text-slate-600">Lượt duyệt {r.submissionVersion} · {formatDateTime(r.createdAt)}</span>
                          </div>
                          <p className="mt-1 text-base text-slate-800 whitespace-pre-wrap [overflow-wrap:anywhere]">{r.comment || 'Không có nhận xét bổ sung.'}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
