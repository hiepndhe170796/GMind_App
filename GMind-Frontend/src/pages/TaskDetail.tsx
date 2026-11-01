import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import Input from '../components/ui/Input';
import Icon from '../components/ui/Icon';
import { tasksService, TaskStatus, hasTaskDetails, type TaskDto, type CommentDto, type LinkDto, type ReviewDto } from '../services/tasks';
import { loadTaskWorkspace } from '../services/workspace';
import { authService } from '../services/auth';
import { formatDate, formatDateTime, STATUS_LABEL, PRIORITY_LABEL } from '../utils/presentation';

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const me = authService.currentUser();
  const [task, setTask] = useState<TaskDto | null>(null);
  const [comments, setComments] = useState<CommentDto[]>([]);
  const [links, setLinks] = useState<LinkDto[]>([]);
  const [reviews, setReviews] = useState<ReviewDto[]>([]);
  const [myRole, setMyRole] = useState('Member');
  const [newComment, setNewComment] = useState('');
  const [newLink, setNewLink] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadVersion = useRef(0);
  const reload = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true); setError('');
    setTask(null); setComments([]); setLinks([]); setReviews([]); setMyRole('Member');
    try {
      const data = await loadTaskWorkspace(id!);
      if (version !== loadVersion.current) return;
      setTask(data.task); setComments(data.comments); setLinks(data.links); setReviews(data.reviews); setMyRole(data.myRole);
    } catch (error: unknown) {
      if (version === loadVersion.current) {
        setError((error as { message?: string })?.message || 'Không tải được dữ liệu');
        setTask(null); setComments([]); setLinks([]); setReviews([]);
      }
    } finally { if (version === loadVersion.current) setLoading(false); }
  }, [id]);
  useEffect(() => {
    if (!authService.isLoggedIn()) { navigate('/login'); return; }
    setNewComment(''); setNewLink(''); setReviewNote('');
    void reload();
    return () => { loadVersion.current++; };
  }, [reload, navigate]);

  const handleMutationError = (error: unknown, fallback: string) => {
    const failure = error as { message?: string; status?: number };
    if (failure?.status === 403 || failure?.status === 404) {
      loadVersion.current++;
      setTask(null); setComments([]); setLinks([]); setReviews([]); setMyRole('Member');
      setNewComment(''); setNewLink(''); setReviewNote('');
      setLoading(false);
    }
    setError(failure?.message || fallback);
  };

  const changeStatus = async (status: number, comment?: string) => {
    const version = loadVersion.current;
    try {
      await tasksService.changeStatus(id!, status, comment);
      if (version !== loadVersion.current) return;
      setReviewNote(''); await reload();
    } catch (e: unknown) {
      if (version !== loadVersion.current) return;
      handleMutationError(e, 'Không đổi được trạng thái');
    }
  };

  const addComment = async () => {
    if (!newComment.trim()) return;
    const version = loadVersion.current;
    try {
      await tasksService.addComment(id!, newComment);
      if (version !== loadVersion.current) return;
      setNewComment(''); await reload();
    } catch (e: unknown) {
      if (version !== loadVersion.current) return;
      handleMutationError(e, 'Không gửi được bình luận');
    }
  };

  const addLink = async () => {
    if (!newLink.trim()) return;
    const version = loadVersion.current;
    try {
      await tasksService.addLink(id!, newLink);
      if (version !== loadVersion.current) return;
      setNewLink(''); await reload();
    } catch (e: unknown) {
      if (version !== loadVersion.current) return;
      handleMutationError(e, 'Link không hợp lệ');
    }
  };

  if (loading) return <MainLayout><LoadingSpinner /></MainLayout>;
  if (!task) return (
    <MainLayout>
      <p role="alert" className="text-danger-600">{error || 'Không tìm thấy task'}</p>
      <Button variant="secondary" size="sm" className="mt-2" onClick={() => void reload()}>Thử lại</Button>
    </MainLayout>
  );

  const isLeader = myRole === 'Leader';
  const isAssignee = task.assigneeUserId === me?.id;
  const details = hasTaskDetails(task);
  const initials = (n?: string | null) => (n || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <MainLayout>
      <nav className="text-xs text-slate-400 mb-3">
        <Link to={`/projects/${task.projectId}`} className="hover:text-primary-600">← Về dự án</Link>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-slate-900 break-words">{task.title}</h2>
          <p className="text-sm text-slate-500 mt-1">Giao cho: {task.assigneeName || 'Chưa giao'}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Badge value={task.priority}>{PRIORITY_LABEL[task.priority] ?? task.priority}</Badge>
          <Badge value={task.status}>{STATUS_LABEL[task.status] ?? task.status}</Badge>
        </div>
      </div>
      {error && <p role="alert" className="mb-4 text-sm text-danger-600">{error}</p>}
      {!details && (
        <Card>
          <p className="text-sm text-slate-600">Bạn đang xem thông tin chung. Chỉ Leader và người phụ trách được xem chi tiết công việc.</p>
          <p className="text-sm text-slate-500 mt-2">Hạn: {formatDate(task.deadlineAt)}</p>
        </Card>
      )}
      {details && (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
          <div className="space-y-6 min-w-0">
            <Card>
              <h3 className="font-semibold mb-2">Mô tả</h3>
              {task.description
                ? <p className="whitespace-pre-wrap text-sm text-slate-700 break-words">{task.description}</p>
                : <p className="text-sm text-slate-400">Chưa có mô tả.</p>}
            </Card>
            <Card>
              <h3 className="font-semibold mb-3">Tài liệu / Link ({links.length})</h3>
              <ul className="space-y-2 mb-3">
                {links.map(l => (
                  <li key={l.id} className="flex items-center gap-2 text-sm min-w-0">
                    <Icon name="link" size={14} className="text-slate-400 shrink-0" />
                    <a href={l.url} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline break-all">{l.displayName || l.url}</a>
                  </li>
                ))}
                {links.length === 0 && <p className="text-sm text-slate-400">Chưa có tài liệu.</p>}
              </ul>
              <div className="flex gap-2 flex-wrap">
                <input aria-label="Thêm liên kết" className="flex-1 min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="https://..." value={newLink} onChange={e => setNewLink(e.target.value)} />
                <Button variant="secondary" size="sm" onClick={addLink}>Thêm link</Button>
              </div>
            </Card>
            <Card>
              <h3 className="font-semibold mb-3">Bình luận ({comments.length})</h3>
              <div className="space-y-4 mb-4">
                {comments.map(c => (
                  <div key={c.id} className="flex gap-3 min-w-0">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 text-primary-700 text-xs font-semibold shrink-0">{initials(c.authorName)}</span>
                    <div className="min-w-0">
                      <p className="text-sm"><b>{c.authorName}</b> <span className="text-slate-400 text-xs">{formatDateTime(c.createdAt)}</span></p>
                      <p className="text-sm mt-0.5 whitespace-pre-wrap break-words text-slate-700">{c.body}</p>
                    </div>
                  </div>
                ))}
                {comments.length === 0 && <p className="text-sm text-slate-400">Chưa có bình luận.</p>}
              </div>
              <div className="flex gap-2 flex-wrap">
                <input aria-label="Viết bình luận" className="flex-1 min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Viết bình luận..." value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && addComment()} />
                <Button size="sm" onClick={addComment}>Gửi</Button>
              </div>
            </Card>
            {reviews.length > 0 && (
              <Card>
                <h3 className="font-semibold mb-3">Lịch sử duyệt</h3>
                {reviews.map(r => (
                  <div key={r.id} className="border-l-2 border-slate-200 pl-3 mb-3">
                    <p className="text-sm"><b>{r.reviewerName}</b> — {r.decision === 'Completed' ? 'Duyệt' : 'Yêu cầu sửa'} <span className="text-slate-400">(v{r.submissionVersion})</span></p>
                    {r.comment && <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap break-words">{r.comment}</p>}
                  </div>
                ))}
              </Card>
            )}
          </div>
          <div className="space-y-6 min-w-0">
            <Card>
              <h3 className="font-semibold mb-3">Thông tin công việc</h3>
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Người phụ trách</dt>
                  <dd className="flex items-center gap-1.5 font-medium min-w-0">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-[10px] font-semibold shrink-0">{initials(task.assigneeName)}</span>
                    <span className="truncate">{task.assigneeName || 'Chưa giao'}</span>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2"><dt className="text-slate-500">Hạn</dt><dd className="font-medium">{formatDate(task.deadlineAt)}</dd></div>
                <div className="flex items-center justify-between gap-2"><dt className="text-slate-500">Ưu tiên</dt><dd><Badge value={task.priority}>{PRIORITY_LABEL[task.priority] ?? task.priority}</Badge></dd></div>
              </dl>
              {details && task.progressPercent != null && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-slate-500 mb-1"><span>Tiến độ</span><span>{task.progressPercent}%</span></div>
                  <div role="progressbar" aria-label="Tiến độ công việc" aria-valuenow={task.progressPercent} aria-valuemin={0} aria-valuemax={100} className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-primary-500" style={{ width: `${task.progressPercent}%` }} />
                  </div>
                </div>
              )}
              {details && task.estimateHours != null && <p className="mt-3 text-xs text-slate-500">Ước lượng: {task.estimateHours} giờ</p>}
            </Card>
            {(isAssignee || isLeader) && (
              <Card>
                <h3 className="font-semibold mb-3">Thao tác</h3>
                <div className="space-y-3">
                  {task.status === 'ToDo' && isAssignee && <Button className="w-full" onClick={() => changeStatus(TaskStatus.InProgress)}>Bắt đầu làm</Button>}
                  {task.status === 'InProgress' && isAssignee && <Button className="w-full" onClick={() => changeStatus(TaskStatus.Submitted)}>Nộp để duyệt</Button>}
                  {task.status === 'Submitted' && isLeader && (
                    <>
                      <Input label="Nhận xét duyệt" placeholder="Nhận xét duyệt (bắt buộc khi trả về)" value={reviewNote} onChange={e => setReviewNote(e.target.value)} />
                      <div className="flex gap-2 flex-wrap">
                        <Button variant="success" onClick={() => changeStatus(TaskStatus.Completed, reviewNote || undefined)}>Duyệt</Button>
                        <Button variant="danger" onClick={() => changeStatus(TaskStatus.ChangesRequested, reviewNote)}>Trả về sửa</Button>
                      </div>
                    </>
                  )}
                  {task.status === 'ChangesRequested' && isAssignee && <Button variant="warning" className="w-full" onClick={() => changeStatus(TaskStatus.InProgress)}>Làm lại</Button>}
                  {task.status === 'Completed' && <p className="text-sm text-success-700">Công việc đã hoàn thành.</p>}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </MainLayout>
  );
}
