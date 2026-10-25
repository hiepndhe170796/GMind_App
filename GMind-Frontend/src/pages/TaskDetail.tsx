import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { tasksService, TaskStatus, type TaskDto, type CommentDto, type LinkDto, type ReviewDto } from '../services/tasks';
import { projectsService } from '../services/projects';
import { groupsService } from '../services/groups';
import { authService } from '../services/auth';

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

  const reload = async () => {
    const [t, c, l, r] = await Promise.all([
      tasksService.get(id!), tasksService.comments(id!), tasksService.links(id!), tasksService.reviews(id!),
    ]);
    setTask(t); setComments(c); setLinks(l); setReviews(r);
    const project = await projectsService.get(t.projectId);
    const group = await groupsService.get(project.groupId);
    setMyRole(group.myRole);
  };

  useEffect(() => {
    if (!authService.isLoggedIn()) { navigate('/login'); return; }
    reload().catch(e => setError(e?.message || 'Không tải được task')).finally(() => setLoading(false));
  }, [id, navigate]);

  const changeStatus = async (status: number, comment?: string) => {
    try { await tasksService.changeStatus(id!, status, comment); setReviewNote(''); await reload(); }
    catch (e: any) { setError(e?.message || 'Không đổi được trạng thái'); }
  };

  const addComment = async () => {
    if (!newComment.trim()) return;
    try { await tasksService.addComment(id!, newComment); setNewComment(''); await reload(); }
    catch (e: any) { setError(e?.message || 'Không gửi được bình luận'); }
  };

  const addLink = async () => {
    if (!newLink.trim()) return;
    try { await tasksService.addLink(id!, newLink); setNewLink(''); await reload(); }
    catch (e: any) { setError(e?.message || 'Link không hợp lệ'); }
  };

  if (loading) return <MainLayout><LoadingSpinner /></MainLayout>;
  if (!task) return <MainLayout><p className="text-danger-600">{error || 'Không tìm thấy task'}</p></MainLayout>;

  const isLeader = myRole === 'Leader';
  const isAssignee = task.assigneeUserId === me?.id;

  return (
    <MainLayout>
      <Link to={`/projects/${task.projectId}`} className="text-sm text-primary-600 hover:underline">← Về project</Link>
      <div className="flex items-start justify-between mt-2 mb-6">
        <div>
          <h1 className="text-3xl font-bold">{task.title}</h1>
          <p className="text-neutral-500 mt-1">Giao cho: {task.assigneeName || 'Chưa giao'}</p>
          {task.deadlineAt && <p className="text-sm text-danger-600 mt-1">Hạn: {new Date(task.deadlineAt).toLocaleString('vi-VN')}</p>}
        </div>
        <Badge variant="primary">{task.status}</Badge>
      </div>
      {error && <p className="mb-4 text-sm text-danger-600">{error}</p>}

      {task.description && <Card className="mb-4"><p className="whitespace-pre-wrap">{task.description}</p></Card>}

      <Card className="mb-4">
        <div className="flex gap-2 flex-wrap">
          {task.status === 'ToDo' && isAssignee && <Button onClick={() => changeStatus(TaskStatus.InProgress)}>Bắt đầu</Button>}
          {task.status === 'InProgress' && isAssignee && <Button onClick={() => changeStatus(TaskStatus.Submitted)}>Nộp để duyệt</Button>}
          {task.status === 'Submitted' && isLeader && (
            <div className="w-full space-y-2">
              <input className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-neutral-900" placeholder="Nhận xét duyệt (bắt buộc khi trả về)" value={reviewNote} onChange={e => setReviewNote(e.target.value)} />
              <div className="flex gap-2">
                <Button variant="success" onClick={() => changeStatus(TaskStatus.Completed, reviewNote || undefined)}>Duyệt</Button>
                <Button variant="danger" onClick={() => changeStatus(TaskStatus.ChangesRequested, reviewNote)}>Trả về sửa</Button>
              </div>
            </div>
          )}
          {task.status === 'ChangesRequested' && isAssignee && <Button variant="warning" onClick={() => changeStatus(TaskStatus.InProgress)}>Làm lại</Button>}
        </div>
      </Card>

      {reviews.length > 0 && (
        <Card className="mb-4">
          <h2 className="font-semibold mb-3">Lịch sử duyệt</h2>
          {reviews.map(r => (
            <div key={r.id} className="border-l-2 border-neutral-300 pl-3 mb-3">
              <p className="text-sm"><b>{r.reviewerName}</b> — {r.decision === 'Completed' ? 'Duyệt' : 'Yêu cầu sửa'} <span className="text-neutral-400">(v{r.submissionVersion})</span></p>
              {r.comment && <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">{r.comment}</p>}
            </div>
          ))}
        </Card>
      )}

      <Card className="mb-4">
        <h2 className="font-semibold mb-3">Tài liệu / Link ({links.length})</h2>
        <ul className="space-y-1 mb-3">
          {links.map(l => (
            <li key={l.id}><a href={l.url} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline text-sm">{l.displayName || l.url}</a></li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input className="flex-1 border rounded-lg px-3 py-2 text-sm dark:bg-neutral-900" placeholder="https://..." value={newLink} onChange={e => setNewLink(e.target.value)} />
          <Button variant="secondary" size="sm" onClick={addLink}>Thêm link</Button>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">Bình luận ({comments.length})</h2>
        <div className="space-y-3 mb-4">
          {comments.map(c => (
            <div key={c.id} className="border-b border-neutral-200 dark:border-neutral-700 pb-2">
              <p className="text-sm"><b>{c.authorName}</b> <span className="text-neutral-400 text-xs">{new Date(c.createdAt).toLocaleString('vi-VN')}</span></p>
              <p className="text-sm mt-1 whitespace-pre-wrap">{c.body}</p>
            </div>
          ))}
          {comments.length === 0 && <p className="text-sm text-neutral-500">Chưa có bình luận.</p>}
        </div>
        <div className="flex gap-2">
          <input className="flex-1 border rounded-lg px-3 py-2 text-sm dark:bg-neutral-900" placeholder="Viết bình luận..." value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && addComment()} />
          <Button size="sm" onClick={addComment}>Gửi</Button>
        </div>
      </Card>
    </MainLayout>
  );
}
