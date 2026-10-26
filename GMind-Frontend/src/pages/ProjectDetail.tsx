import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { projectsService, type ProjectDto } from '../services/projects';
import { tasksService, TaskStatus, type TaskSummaryDto } from '../services/tasks';
import { groupsService, type GroupMemberDto } from '../services/groups';
import { authService } from '../services/auth';

const COLUMNS = ['ToDo', 'InProgress', 'Submitted', 'ChangesRequested', 'Completed'] as const;
const STATUS_LABEL: Record<string, string> = {
  ToDo: 'Cần làm', InProgress: 'Đang làm', Submitted: 'Chờ duyệt',
  ChangesRequested: 'Yêu cầu sửa', Completed: 'Hoàn thành',
};

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const me = authService.currentUser();
  const [project, setProject] = useState<ProjectDto | null>(null);
  const [tasks, setTasks] = useState<TaskSummaryDto[]>([]);
  const [members, setMembers] = useState<GroupMemberDto[]>([]);
  const [myRole, setMyRole] = useState('Member');
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [deadline, setDeadline] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = () => Promise.all([
    projectsService.get(id!).then(setProject),
    tasksService.list(id!).then(setTasks),
  ]).catch(e => setError(e?.message || 'Lỗi tải dữ liệu'));

  useEffect(() => {
    if (!authService.isLoggedIn()) { navigate('/login'); return; }
    reload()
      .then(() => projectsService.get(id!))
      .then(p => groupsService.get(p.groupId))
      .then(g => { setMembers(g.members); setMyRole(g.myRole); })
      .catch(e => setError(e?.message || 'Lỗi tải nhóm'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const createTask = async () => {
    if (!title.trim()) return;
    try {
      await tasksService.create(id!, {
        title, assigneeUserId: assignee || undefined,
        deadlineAt: deadline || undefined, priority: 2,
      });
      setTitle(''); setAssignee(''); setDeadline('');
      await reload();
    } catch (e: any) { setError(e?.message || 'Tạo task thất bại'); }
  };

  const changeStatus = async (t: TaskSummaryDto, status: number) => {
    try { await tasksService.changeStatus(t.id, status); await reload(); }
    catch (e: any) { setError(e?.message || 'Không đổi được trạng thái'); }
  };

  if (loading) return <MainLayout><LoadingSpinner /></MainLayout>;
  if (!project) return <MainLayout><p className="text-danger-600">{error || 'Không tìm thấy project'}</p></MainLayout>;

  const topTasks = tasks.filter(t => !t.parentTaskId);
  const isLeader = myRole === 'Leader';

  return (
    <MainLayout>
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-3xl font-bold">{project.name}</h1>
          {project.subject && <p className="text-neutral-500">Môn: {project.subject}</p>}
          {project.deadlineAt && <p className="text-sm text-danger-600">Hạn: {new Date(project.deadlineAt).toLocaleDateString('vi-VN')}</p>}
        </div>
        <Badge variant="primary">{project.completedCount}/{project.taskCount} xong</Badge>
      </div>
      {error && <p className="mb-4 text-sm text-danger-600">{error}</p>}

      {isLeader && (
      <Card className="mb-6">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-40"><Input label="Task mới" value={title} onChange={e => setTitle(e.target.value)} placeholder="Tên task" /></div>
          <select className="border rounded-lg px-3 py-2 text-sm dark:bg-neutral-900" value={assignee} onChange={e => setAssignee(e.target.value)}>
            <option value="">Giao cho...</option>
            {members.map(m => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
          </select>
          <input type="date" className="border rounded-lg px-3 py-2 text-sm dark:bg-neutral-900" value={deadline} onChange={e => setDeadline(e.target.value)} />
          <Button onClick={createTask}>Thêm</Button>
        </div>
      </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {COLUMNS.map(col => (
          <div key={col} className="bg-neutral-100 dark:bg-neutral-900 rounded-lg p-3">
            <h3 className="text-sm font-semibold mb-2">{STATUS_LABEL[col]} ({topTasks.filter(t => t.status === col).length})</h3>
            {topTasks.filter(t => t.status === col).map(t => (
              <Card key={t.id} className="mb-2 !p-3">
                <Link to={`/tasks/${t.id}`} className="text-sm font-medium hover:text-primary-600">{t.title}</Link>
                <p className="text-xs text-neutral-500">{t.assigneeName || 'Chưa giao'} {t.deadlineAt && `· ${new Date(t.deadlineAt).toLocaleDateString('vi-VN')}`}</p>
                <div className="flex gap-1 mt-2 flex-wrap">
                  {t.status === 'ToDo' && t.assigneeUserId === me?.id && <Button size="sm" onClick={() => changeStatus(t, TaskStatus.InProgress)}>Bắt đầu</Button>}
                  {t.status === 'InProgress' && t.assigneeUserId === me?.id && <Button size="sm" onClick={() => changeStatus(t, TaskStatus.Submitted)}>Nộp</Button>}
                  {t.status === 'Submitted' && isLeader && <>
                    <Button size="sm" variant="success" onClick={() => changeStatus(t, TaskStatus.Completed)}>Duyệt</Button>
                    <Button size="sm" variant="danger" onClick={() => changeStatus(t, TaskStatus.ChangesRequested)}>Trả về</Button>
                  </>}
                  {t.status === 'ChangesRequested' && t.assigneeUserId === me?.id && <Button size="sm" variant="warning" onClick={() => changeStatus(t, TaskStatus.InProgress)}>Làm lại</Button>}
                </div>
              </Card>
            ))}
          </div>
        ))}
      </div>
    </MainLayout>
  );
}
