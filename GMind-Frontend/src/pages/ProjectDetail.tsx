import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Icon from '../components/ui/Icon';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { projectsService, type ProjectDto } from '../services/projects';
import { tasksService, TaskStatus, type TaskSummaryDto } from '../services/tasks';
import { groupsService, type GroupMemberDto } from '../services/groups';
import { authService } from '../services/auth';
import { formatDate, timestamp, STATUS_LABEL, PRIORITY_LABEL } from '../utils/presentation';

const COLUMNS = ['ToDo', 'InProgress', 'Submitted', 'ChangesRequested', 'Completed'] as const;

const memberInitials = (name?: string | null) =>
  (name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const me = authService.currentUser();
  const loadVersion = useRef(0);
  const [project, setProject] = useState<ProjectDto | null>(null);
  const [tasks, setTasks] = useState<TaskSummaryDto[]>([]);
  const [members, setMembers] = useState<GroupMemberDto[]>([]);
  const [myRole, setMyRole] = useState('Member');
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [deadline, setDeadline] = useState('');
  const [creating, setCreating] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [view, setView] = useState<'list' | 'board'>('list');

  useEffect(() => {
    const version = ++loadVersion.current;
    setLoading(true); setError('');
    setProject(null); setTasks([]); setMembers([]); setMyRole('Member'); setFormOpen(false);
    projectsService.get(id!)
      .then(p => tasksService.list(id!).then(t => ({ p, t })))
      .then(({ p, t }) => groupsService.get(p.groupId).then(g => ({ p, t, g })))
      .then(({ p, t, g }) => {
        if (version !== loadVersion.current) return;
        setProject(p); setTasks(t); setMembers(g.members); setMyRole(g.myRole); setLoading(false);
      })
      .catch(e => {
        if (version !== loadVersion.current) return;
        const failure = e as { status?: number; message?: string };
        if (failure?.status === 403 || failure?.status === 404) {
          setProject(null); setTasks([]); setMembers([]); setMyRole('Member'); setFormOpen(false);
        }
        setError(failure?.message || 'Lỗi tải dữ liệu'); setLoading(false);
      });
    return () => { loadVersion.current++; };
  }, [id, attempt]);

  const reloadProject = async (version: number) => {
    const [p, t] = await Promise.all([projectsService.get(id!), tasksService.list(id!)]);
    if (version !== loadVersion.current) return;
    setProject(p); setTasks(t);
  };

  const handleMutationError = (e: unknown, fallback: string) => {
    const failure = e as { status?: number; message?: string };
    if (failure?.status === 403 || failure?.status === 404) {
      loadVersion.current++;
      setProject(null); setTasks([]); setMembers([]); setMyRole('Member');
      setFormOpen(false); setTitle(''); setAssignee(''); setDeadline('');
      setCreating(false); setLoading(false);
    }
    setError(failure?.message || fallback);
  };

  const createTask = async () => {
    if (!title.trim() || creating) return;
    const version = loadVersion.current;
    setCreating(true); setError('');
    try {
      await tasksService.create(id!, {
        title: title.trim(), assigneeUserId: assignee || undefined,
        deadlineAt: deadline ? new Date(`${deadline}T23:59:00+07:00`).toISOString() : undefined,
        priority: 2,
      });
      if (version !== loadVersion.current) return;
      setTitle(''); setAssignee(''); setDeadline(''); setFormOpen(false);
      await reloadProject(version);
    } catch (e: unknown) {
      if (version !== loadVersion.current) return;
      handleMutationError(e, 'Tạo task thất bại');
    } finally { if (version === loadVersion.current) setCreating(false); }
  };

  const changeStatus = async (t: TaskSummaryDto, status: number) => {
    const version = loadVersion.current;
    try {
      await tasksService.changeStatus(t.id, status);
      if (version !== loadVersion.current) return;
      await reloadProject(version);
    } catch (e: unknown) {
      if (version === loadVersion.current) handleMutationError(e, 'Không đổi được trạng thái');
    }
  };

  if (loading) return <MainLayout><LoadingSpinner /></MainLayout>;
  if (!project) return (
    <MainLayout>
      <p role="alert" className="text-sm text-danger-600 mb-3">{error || 'Không tìm thấy project'}</p>
      <div className="flex gap-3 items-center">
        <Button variant="secondary" size="sm" onClick={() => setAttempt(a => a + 1)}>Thử lại</Button>
        <Link to="/dashboard" className="text-sm text-primary-600 hover:underline">Về trang tổng quan</Link>
      </div>
    </MainLayout>
  );

  const isLeader = myRole === 'Leader';
  const topTasks = tasks.filter(t => !t.parentTaskId).filter(t => {
    if (statusFilter && t.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (q && !t.title.toLowerCase().includes(q)) return false;
    return true;
  });

  const TaskMeta = ({ t }: { t: TaskSummaryDto }) => (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <span className="flex items-center gap-1.5 text-xs text-slate-500">
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary-100 text-primary-700 text-[10px] font-semibold">{memberInitials(t.assigneeName)}</span>
        {t.assigneeName || 'Chưa giao'}
      </span>
      <Badge value={t.priority}>{PRIORITY_LABEL[t.priority] ?? t.priority}</Badge>
      <Badge value={t.status}>{STATUS_LABEL[t.status] ?? t.status}</Badge>
      <span className="text-xs text-slate-400">{formatDate(t.deadlineAt)}</span>
    </div>
  );

  const TaskActions = ({ t, compact = false }: { t: TaskSummaryDto; compact?: boolean }) => (
    <div className={`flex gap-2 flex-wrap ${compact ? 'mt-2' : 'mt-0'}`}>
      {t.status === 'ToDo' && t.assigneeUserId === me?.id && <Button size="sm" onClick={() => changeStatus(t, TaskStatus.InProgress)}>Bắt đầu</Button>}
      {t.status === 'InProgress' && t.assigneeUserId === me?.id && <Button size="sm" onClick={() => changeStatus(t, TaskStatus.Submitted)}>Nộp bài</Button>}
      {t.status === 'Submitted' && isLeader && <Link to={`/tasks/${t.id}`}><Button size="sm" variant="success">Xem và duyệt</Button></Link>}
      {t.status === 'ChangesRequested' && t.assigneeUserId === me?.id && <Button size="sm" variant="warning" onClick={() => changeStatus(t, TaskStatus.InProgress)}>Làm lại</Button>}
    </div>
  );

  return (
    <MainLayout>
      <nav className="text-xs text-slate-400 mb-2">
        <Link to={`/groups/${project.groupId}`} className="hover:text-primary-600">Nhóm</Link>
        <span className="mx-1">/</span><span className="text-slate-600">{project.name}</span>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-slate-900">{project.name}</h2>
          {project.subject && <p className="text-sm text-slate-500 mt-0.5">Môn: {project.subject}</p>}
          {project.description && <p className="text-sm text-slate-500 mt-0.5 max-w-2xl">{project.description}</p>}
          {project.deadlineAt && <p className={`text-sm mt-0.5 ${project.status !== 'Completed' && timestamp(project.deadlineAt).getTime() < Date.now() ? 'text-danger-600' : 'text-slate-500'}`}>Hạn: {formatDate(project.deadlineAt)}</p>}
        </div>
        <Badge value="InProgress" className="!px-3 !py-1 !text-sm">{project.completedCount}/{project.taskCount} công việc hoàn thành</Badge>
      </div>
      {error && <p role="alert" className="mb-4 text-sm text-danger-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-40 max-w-xs">
          <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input aria-label="Tìm công việc" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm công việc..."
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" />
        </div>
        <select aria-label="Lọc trạng thái" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">Tất cả trạng thái</option>
          {COLUMNS.map(c => <option key={c} value={c}>{STATUS_LABEL[c]}</option>)}
        </select>
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {(['list', 'board'] as const).map(v => (
            <button key={v} aria-pressed={view === v} onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${view === v ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-500'}`}>
              {v === 'list' ? 'Danh sách' : 'Bảng'}
            </button>
          ))}
        </div>
        {isLeader && !formOpen && (
          <Button size="md" onClick={() => setFormOpen(true)}><Icon name="plus" size={15} />Thêm công việc</Button>
        )}
      </div>

      {isLeader && formOpen && (
        <Card className="mb-5">
          <form className="flex flex-wrap gap-3 items-end" onSubmit={e => { e.preventDefault(); void createTask(); }}>
            <div className="flex-1 min-w-40"><Input label="Tên công việc" value={title} onChange={e => setTitle(e.target.value)} placeholder="Nhập tên công việc" /></div>
            <label className="text-sm">
              <span className="block text-sm font-medium text-slate-700 mb-1">Giao cho</span>
              <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={assignee} onChange={e => setAssignee(e.target.value)}>
                <option value="">Chưa giao</option>
                {members.map(m => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
              </select>
            </label>
            <Input label="Hạn" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
            <div className="flex gap-2">
              <Button type="submit" isLoading={creating}>Thêm</Button>
              <Button type="button" variant="secondary" onClick={() => { setFormOpen(false); setTitle(''); }}>Hủy</Button>
            </div>
          </form>
        </Card>
      )}

      {view === 'list' ? (
        <Card className="!p-0 overflow-hidden">
          {topTasks.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">Chưa có công việc nào phù hợp.</p>
          ) : (
            <ul className="divide-y divide-[#e7ecf4]">
              {topTasks.map(t => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <Link to={`/tasks/${t.id}`} className="block truncate font-medium text-slate-800 hover:text-primary-600">{t.title}</Link>
                    <TaskMeta t={t} />
                  </div>
                  <TaskActions t={t} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-3" style={{ minWidth: `${COLUMNS.length * 240}px` }}>
            {COLUMNS.map(col => (
              <div key={col} className="w-60 shrink-0 rounded-2xl bg-slate-100/80 p-3">
                <h3 className="text-sm font-semibold mb-3 text-slate-700">{STATUS_LABEL[col]} ({topTasks.filter(t => t.status === col).length})</h3>
                {topTasks.filter(t => t.status === col).map(t => (
                  <Card key={t.id} className="mb-2 !p-3">
                    <Link to={`/tasks/${t.id}`} className="text-sm font-medium text-slate-800 hover:text-primary-600 break-words">{t.title}</Link>
                    <TaskMeta t={t} />
                    <TaskActions t={t} compact />
                  </Card>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </MainLayout>
  );
}
