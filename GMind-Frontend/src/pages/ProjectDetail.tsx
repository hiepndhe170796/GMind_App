import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Icon from '../components/ui/Icon';
import '../components/workspace/workspace.css';
import { Breadcrumb, Skeleton, ErrorState } from '../components/workspace/WorkspaceUI';
import { errMsg, status, initials } from '../components/workspace/utils';
import ConfirmationDialog from '../components/workspace/ConfirmationDialog';
import { projectsService, projectsManage, type ProjectDto } from '../services/projects';
import { tasksService, TaskStatus, type TaskSummaryDto } from '../services/tasks';
import { groupsService, type GroupMemberDto, type ActivityDto } from '../services/groups';
import { authService } from '../services/auth';
import { formatDate, formatDateTime, timestamp, dayKey, STATUS_LABEL, PRIORITY_LABEL } from '../utils/presentation';

const COLUMNS = ['ToDo', 'InProgress', 'Submitted', 'ChangesRequested', 'Completed'] as const;
type Ws = { project: ProjectDto; tasks: TaskSummaryDto[]; members: GroupMemberDto[]; myRole: string; groupName: string; activity: ActivityDto[]; activityError: string };

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const me = authService.currentUser();
  return <MainLayout><ProjectWorkspace key={`${id ?? ''}:${me?.id ?? ''}`} id={id ?? ''} userId={me?.id ?? ''} /></MainLayout>;
}

function ProjectWorkspace({ id, userId }: { id: string; userId: string }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [ws, setWs] = useState<Ws | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fatalError, setFatalError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [success, setSuccess] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | 'archive'>(null);
  const [form, setForm] = useState({ title: '', description: '', assignee: '', deadline: '', priority: '2', estimate: '' });
  const [formError, setFormError] = useState('');
  const [editForm, setEditForm] = useState({ name: '', description: '', subject: '', deadline: '' });
  const [editError, setEditError] = useState('');
  const [q, setQ] = useState(params.get('q') ?? '');
  const loadVersion = useRef(0);
  const actionVersion = useRef(0);
  const pendingRef = useRef(false);
  const refreshingRef = useRef(false);
  const busy = pending !== null || refreshing;
  const appliedQ = params.get('q') ?? '';
  const [lastAppliedQ, setLastAppliedQ] = useState(appliedQ);
  if (lastAppliedQ !== appliedQ) { setLastAppliedQ(appliedQ); setQ(appliedQ); }
  const filters = useMemo(() => ({
    q: params.get('q') ?? '', status: params.get('status') ?? '', assignee: params.get('assignee') ?? '',
    priority: params.get('priority') ?? '', view: params.get('view') === 'board' ? 'board' : 'list' as 'list' | 'board',
  }), [params]);

  const clearPrivate = useCallback(() => {
    setWs(null); setFormOpen(false); setEditOpen(false); setConfirm(null);
    setForm({ title: '', description: '', assignee: '', deadline: '', priority: '2', estimate: '' });
    setEditForm({ name: '', description: '', subject: '', deadline: '' }); setEditError(''); setFormError('');
    setActionError(''); setSuccess(''); setRefreshError('');
  }, []);
  const invalidate = useCallback(() => {
    loadVersion.current++; actionVersion.current++; pendingRef.current = false; refreshingRef.current = false;
  }, []);

  const fetchWorkspace = useCallback(async (quiet = false) => {
    const version = ++loadVersion.current;
    try {
      const project = await projectsService.get(id);
      const [tasks, group] = await Promise.all([tasksService.list(id), groupsService.get(project.groupId)]);
      if (version !== loadVersion.current) return;
      let activity: ActivityDto[] = [], activityError = '';
      if (group.myRole === 'Leader') {
        try {
          const all = await groupsService.activity(project.groupId);
          if (version !== loadVersion.current) return;
          activity = all.filter(a => a.projectId === id);
        } catch (e: unknown) {
          if (status(e) === 403 || status(e) === 404) throw e;
          activityError = errMsg(e, 'Không tải được hoạt động.');
        }
      }
      if (version !== loadVersion.current) return;
      setWs({ project, tasks, members: group.members, myRole: group.myRole, groupName: group.name, activity, activityError });
      setFatalError('');
    } catch (e: unknown) {
      if (version !== loadVersion.current) return;
      const s = status(e);
      if (s === 403 || s === 404) { clearPrivate(); setFatalError(errMsg(e, 'Không tải được dự án')); }
      else if (!quiet) { setWs(null); setFatalError(errMsg(e, 'Không tải được dự án')); }
      else setRefreshError('Thao tác đã được lưu nhưng chưa tải lại được đầy đủ chi tiết. ' + errMsg(e, ''));
    } finally {
      if (version === loadVersion.current) { setLoading(false); setRefreshing(false); refreshingRef.current = false; }
    }
  }, [id, clearPrivate]);

  const reload = useCallback((quiet = false) => {
    if (!quiet) { setLoading(true); setWs(null); setFatalError(''); setSuccess(''); }
    setRefreshError('');
    if (quiet) { refreshingRef.current = true; setRefreshing(true); }
    return fetchWorkspace(quiet);
  }, [fetchWorkspace]);

  useEffect(() => {
    if (!authService.isLoggedIn()) { navigate('/login'); return; }
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) return fetchWorkspace(false); });
    return () => { cancelled = true; invalidate(); };
  }, [fetchWorkspace, invalidate, navigate]);

  async function mutate<T>(kind: string, request: () => Promise<T>, apply: (r: T) => void, notice: string, reloadAfter = true) {
    if (pendingRef.current || refreshingRef.current) return;
    pendingRef.current = true;
    const action = ++actionVersion.current;
    const version = loadVersion.current;
    setPending(kind); setSuccess(''); setRefreshError(''); setActionError('');
    try {
      const result = await request();
      if (action !== actionVersion.current || version !== loadVersion.current) return;
      apply(result); setSuccess(notice);
      if (reloadAfter) await reload(true);
    } catch (e: unknown) {
      if (action !== actionVersion.current || version !== loadVersion.current) return;
      const s = status(e);
      if (s === 403 || s === 404) {
        loadVersion.current++; clearPrivate();
        setFatalError(errMsg(e, 'Không thực hiện được thao tác')); setLoading(false);
      } else setActionError(errMsg(e, 'Không thực hiện được thao tác'));
    } finally {
      if (action === actionVersion.current) { pendingRef.current = false; setPending(null); }
    }
  }

  const updateFilters = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (!v) next.delete(k); else next.set(k, v); }
    setParams(next, { replace: true });
  };

  const createTask = () => {
    const n = form.title.trim();
    if (!n) { setFormError('Nhập tên công việc.'); return; }
    if (n.length > 200) { setFormError('Tên tối đa 200 ký tự.'); return; }
    if (form.estimate && (!Number.isFinite(+form.estimate) || +form.estimate < 0)) { setFormError('Ước lượng phải là số không âm.'); return; }
    if (form.deadline && Number.isNaN(Date.parse(form.deadline))) { setFormError('Hạn không hợp lệ.'); return; }
    void mutate('create', () => tasksService.create(id, {
      title: n, description: form.description.trim() || undefined,
      assigneeUserId: form.assignee || undefined, priority: +form.priority,
      deadlineAt: form.deadline ? new Date(`${form.deadline}T23:59:00+07:00`).toISOString() : undefined,
      estimateHours: form.estimate ? +form.estimate : undefined,
    }), (t) => {
      setWs(w => w ? { ...w, tasks: [...w.tasks, t] } : w);
      setForm({ title: '', description: '', assignee: '', deadline: '', priority: '2', estimate: '' }); setFormOpen(false);
    }, 'Đã tạo công việc.');
  };
  const saveEdit = () => {
    const n = editForm.name.trim();
    if (!n) { setEditError('Nhập tên dự án.'); return; }
    const deadlineAt = !editForm.deadline ? undefined
      : (ws?.project.deadlineAt && dayKey(ws.project.deadlineAt) === editForm.deadline)
        ? ws.project.deadlineAt
        : new Date(`${editForm.deadline}T23:59:00+07:00`).toISOString();
    void mutate('edit', () => projectsManage.update(id, {
      name: n, description: editForm.description.trim() || undefined, subject: editForm.subject.trim() || undefined,
      deadlineAt,
    }), (p) => setWs(w => w ? { ...w, project: { ...w.project, name: p.name, description: p.description, subject: p.subject, deadlineAt: p.deadlineAt } } : w), 'Đã cập nhật dự án.');
  };
  const archive = () => mutate('archive', () => projectsManage.archive(id),
    () => navigate(`/groups/${ws!.project.groupId}`), 'Đã lưu trữ dự án.', false);
  const changeStatus = (t: TaskSummaryDto, s: number) =>
    mutate(`status-${t.id}`, () => tasksService.changeStatus(t.id, s),
      (u) => setWs(w => w ? { ...w, tasks: w.tasks.map(x => x.id === t.id ? { ...x, ...u } : x) } : w),
      s === TaskStatus.Submitted ? 'Đã nộp để duyệt.' : 'Đã chuyển sang đang làm.');

  const project = ws?.project ?? null;
  const tasks = useMemo(() => ws?.tasks ?? [], [ws]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    const onFocus = () => setNow(Date.now());
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, []);
  const isLeader = ws?.myRole === 'Leader';

  const matchTask = useCallback((t: TaskSummaryDto) => {
    const f = filters;
    if (f.status && t.status !== f.status) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.assignee === 'unassigned' ? !!t.assigneeUserId : f.assignee && t.assigneeUserId !== f.assignee) return false;
    const q = f.q.trim().toLowerCase();
    if (q && !`${t.title} ${t.assigneeName ?? ''}`.toLowerCase().includes(q)) return false;
    return true;
  }, [filters]);

  const rows = useMemo(() => {
    const parents = tasks.filter(t => !t.parentTaskId);
    const children = tasks.filter(t => t.parentTaskId);
    const result: { task: TaskSummaryDto; children: TaskSummaryDto[]; viaChild?: boolean }[] = [];
    for (const p of parents) {
      const kids = children.filter(c => c.parentTaskId === p.id);
      const matchedKids = kids.filter(matchTask);
      if (matchTask(p)) result.push({ task: p, children: matchedKids.length ? matchedKids : kids.filter(matchTask) });
      else if (matchedKids.length) result.push({ task: p, children: matchedKids, viaChild: true });
    }
    for (const c of children) {
      if (!parents.some(p => p.id === c.parentTaskId) && matchTask(c))
        result.push({ task: c, children: [], viaChild: true });
    }
    return result;
  }, [tasks, matchTask]);

  const navState = { navigationSection: '/groups', returnTo: `/projects/${id}${params.size ? `?${params}` : ``}` };
  const taskLink = (t: TaskSummaryDto, label?: string) => (
    <Link to={`/tasks/${t.id}`} state={navState} title={t.title}
      className="line-clamp-2 min-w-0 font-medium text-slate-900 hover:text-primary-700 [overflow-wrap:anywhere]">{label ?? t.title}</Link>
  );
  const actions = (t: TaskSummaryDto) => (
    <span className="flex gap-2 flex-wrap">
      {t.status === 'ToDo' && t.assigneeUserId === userId && (
        <Button size="sm" className="workspace-primary min-h-9" disabled={busy} isLoading={pending === `status-${t.id}`} onClick={() => changeStatus(t, TaskStatus.InProgress)}>Bắt đầu</Button>)}
      {t.status === 'InProgress' && t.assigneeUserId === userId && (
        <Button size="sm" className="workspace-primary min-h-9" disabled={busy} isLoading={pending === `status-${t.id}`} onClick={() => changeStatus(t, TaskStatus.Submitted)}>Nộp để duyệt</Button>)}
      {t.status === 'Submitted' && isLeader && (
        <Link to={`/tasks/${t.id}`} state={navState} className="inline-flex min-h-9 items-center rounded-lg bg-primary-600 px-3 text-sm font-medium text-white hover:bg-primary-700">Xem và duyệt</Link>)}
      {t.status === 'ChangesRequested' && t.assigneeUserId === userId && (
        <Button size="sm" variant="secondary" className="min-h-9" disabled={busy} isLoading={pending === `status-${t.id}`} onClick={() => changeStatus(t, TaskStatus.InProgress)}>Làm lại</Button>)}
    </span>
  );
  const meta = (t: TaskSummaryDto) => (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      <span className="inline-flex items-center gap-1.5 text-slate-600 min-w-0">
        <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-semibold text-primary-700">{initials(t.assigneeName)}</span>
        <span className="min-w-0 [overflow-wrap:anywhere]">{t.assigneeName || 'Chưa giao'}</span>
      </span>
      <Badge value={t.priority} className={t.priority === 'Urgent' ? '!text-danger-700' : ''}>{PRIORITY_LABEL[t.priority] ?? t.priority}</Badge>
      <Badge value={t.status} className={t.status === 'ChangesRequested' ? '!text-danger-700' : ''}>{STATUS_LABEL[t.status] ?? t.status}</Badge>
      {t.deadlineAt && <span className="text-slate-600">{formatDate(t.deadlineAt)}</span>}
    </span>
  );

  const projectOverdue = project?.deadlineAt && project.status !== 'Completed' && timestamp(project.deadlineAt).getTime() < now;

  return (
    <div className="workspace-surface space-y-6">
      {loading ? <Skeleton label="Đang tải dự án…" />
        : fatalError || !project ? <ErrorState message={fatalError || 'Không tìm thấy dự án.'} onRetry={() => void reload(false)} backTo="/groups" backLabel="Về nhóm của tôi" />
        : (
          <>
            <Breadcrumb items={[{ label: 'Nhóm của tôi', to: '/groups' }, { label: ws!.groupName, to: `/groups/${project.groupId}` }, { label: project.name }]} />
            <header className="flex flex-wrap items-start justify-between gap-3 min-w-0">
              <div className="min-w-0">
                <h2 className="text-2xl font-bold text-slate-900 [overflow-wrap:anywhere]">{project.name}</h2>
                {project.subject && <p className="mt-0.5 text-sm text-slate-600">Môn: {project.subject}</p>}
                {project.description && <p className="mt-1 max-w-[65ch] text-base text-slate-600 [overflow-wrap:anywhere]">{project.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <Badge value={project.status}>{({ NotStarted: 'Chưa bắt đầu', InProgress: 'Đang làm', Completed: 'Hoàn thành', Archived: 'Đã lưu trữ' } as Record<string, string>)[project.status] ?? project.status}</Badge>
                  <span className="text-slate-600">{project.completedCount}/{project.taskCount} công việc hoàn thành</span>
                  {project.deadlineAt && <span className={projectOverdue ? 'text-danger-700 font-medium' : 'text-slate-600'}>{projectOverdue ? 'Quá hạn · ' : 'Hạn '}{formatDate(project.deadlineAt)}</span>}
                </div>
              </div>
              {isLeader && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => { setEditForm({ name: project.name, description: project.description ?? '', subject: project.subject ?? '', deadline: project.deadlineAt ? dayKey(project.deadlineAt) : '' }); setEditError(''); setEditOpen(v => !v); }}>Sửa dự án</Button>
                  <Button variant="secondary" className="min-h-11 text-danger-700" disabled={busy} onClick={() => setConfirm('archive')}>Lưu trữ</Button>
                </div>
              )}
            </header>
            {refreshing && <p role="status" className="sr-only">Đang tải lại…</p>}
            {refreshError && (
              <div><p role="alert" className="text-sm text-danger-700 [overflow-wrap:anywhere]">{refreshError}</p>
                <Button variant="secondary" className="mt-2 min-h-11" disabled={busy} isLoading={refreshing}
                  onClick={() => { if (!pendingRef.current && !refreshingRef.current) void reload(true); }}>Tải lại</Button></div>
            )}
            {success && <p role="status" className="text-sm font-medium text-success-700">{success}</p>}
            {actionError && <p role="alert" className="text-sm text-danger-700 [overflow-wrap:anywhere]">{actionError}</p>}

            {isLeader && editOpen && (
              <Card className="p-4 sm:p-6">
                <h3 className="font-semibold text-slate-900">Sửa dự án</h3>
                <form noValidate className="mt-3 grid gap-3 sm:grid-cols-2 items-end" onSubmit={e => { e.preventDefault(); saveEdit(); }}>
                  <Input id="pe-name" label="Tên dự án" maxLength={200} value={editForm.name} disabled={busy} error={editError} onChange={e => { setEditForm(x => ({ ...x, name: e.target.value })); setEditError(''); }} />
                  <Input id="pe-subject" label="Môn học" maxLength={100} value={editForm.subject} disabled={busy} onChange={e => setEditForm(x => ({ ...x, subject: e.target.value }))} />
                  <Input id="pe-deadline" label="Hạn" type="date" value={editForm.deadline} disabled={busy} onChange={e => setEditForm(x => ({ ...x, deadline: e.target.value }))} />
                  <Input id="pe-desc" label="Mô tả" maxLength={2000} value={editForm.description} disabled={busy} onChange={e => setEditForm(x => ({ ...x, description: e.target.value }))} />
                  <Button type="submit" className="workspace-primary min-h-11 sm:w-auto" disabled={busy} isLoading={pending === 'edit'}>Lưu</Button>
                </form>
              </Card>
            )}

            <div className="flex flex-wrap items-end gap-3">
              <form role="search" className="flex w-full min-w-0 flex-[1_1_18rem] items-end gap-2 sm:max-w-sm" onSubmit={e => { e.preventDefault(); updateFilters({ q: q.trim() || null }); }}>
                <div className="min-w-0 flex-1">
                  <label htmlFor="ptask-q" className="block text-sm font-medium text-slate-700 mb-1">Tìm công việc</label>
                  <input id="ptask-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Tên hoặc người phụ trách"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2" />
                </div>
                <Button type="submit" variant="secondary" className="min-h-11">Tìm</Button>
              </form>
              <select aria-label="Lọc trạng thái" value={filters.status} onChange={e => updateFilters({ status: e.target.value || null })}
                className="min-h-11 min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
                <option value="">Tất cả trạng thái</option>
                {COLUMNS.map(c => <option key={c} value={c}>{STATUS_LABEL[c]}</option>)}
              </select>
              <select aria-label="Lọc người phụ trách" value={filters.assignee} onChange={e => updateFilters({ assignee: e.target.value || null })}
                className="min-h-11 min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
                <option value="">Mọi người</option>
                <option value="unassigned">Chưa giao</option>
                {ws!.members.map(m => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
              </select>
              <select aria-label="Lọc ưu tiên" value={filters.priority} onChange={e => updateFilters({ priority: e.target.value || null })}
                className="min-h-11 min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
                <option value="">Mọi ưu tiên</option>
                {(['Low', 'Medium', 'High', 'Urgent'] as const).map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
              <div role="group" aria-label="Chế độ xem" className="flex gap-0 rounded-xl border border-slate-200 overflow-hidden">
                {(['list', 'board'] as const).map(v => (
                  <button key={v} type="button" aria-pressed={filters.view === v} onClick={() => updateFilters({ view: v === 'list' ? null : v })}
                    className={`min-h-11 px-3 text-sm font-medium ${filters.view === v ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                    {v === 'list' ? 'Danh sách' : 'Bảng'}
                  </button>
                ))}
              </div>
              {(filters.q || filters.status || filters.assignee || filters.priority) && (
                <button className="min-h-9 text-primary-700 font-medium hover:underline" onClick={() => { setQ(''); updateFilters({ q: null, status: null, assignee: null, priority: null }); }}>Xóa lọc</button>
              )}
              {isLeader && !formOpen && (
                <Button className="workspace-primary min-h-11 gap-1" disabled={busy} onClick={() => setFormOpen(true)}>
                  <Icon name="plus" size={15} />Thêm công việc</Button>
              )}
            </div>

            {isLeader && formOpen && (
              <Card className="p-4 sm:p-6">
                <h3 className="font-semibold text-slate-900">Công việc mới</h3>
                <form noValidate className="mt-3 grid gap-3 sm:grid-cols-2 items-end" onSubmit={e => { e.preventDefault(); createTask(); }}>
                  <Input id="nt-title" label="Tên công việc" maxLength={200} value={form.title} disabled={busy}
                    error={formError && (formError.includes('Tên') || formError.includes('tên')) ? formError : undefined}
                    onChange={e => { setForm(x => ({ ...x, title: e.target.value })); setFormError(''); }} />
                  <div>
                    <label htmlFor="nt-assignee" className="block text-sm font-medium text-slate-700 mb-1">Giao cho</label>
                    <select id="nt-assignee" value={form.assignee} disabled={busy} onChange={e => setForm(x => ({ ...x, assignee: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <option value="">Chưa giao</option>
                      {ws!.members.map(m => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="nt-priority" className="block text-sm font-medium text-slate-700 mb-1">Ưu tiên</label>
                    <select id="nt-priority" value={form.priority} disabled={busy} onChange={e => setForm(x => ({ ...x, priority: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <option value="1">Thấp</option><option value="2">Trung bình</option><option value="3">Cao</option><option value="4">Khẩn cấp</option>
                    </select>
                  </div>
                  <Input id="nt-deadline" label="Hạn (giờ Việt Nam)" type="date" value={form.deadline} disabled={busy} onChange={e => setForm(x => ({ ...x, deadline: e.target.value }))} />
                  <Input id="nt-est" label="Ước lượng (giờ, tuỳ chọn)" type="number" min="0" step="0.5" value={form.estimate} disabled={busy} onChange={e => setForm(x => ({ ...x, estimate: e.target.value }))} />
                  <Input id="nt-desc" label="Mô tả (tuỳ chọn)" maxLength={2000} value={form.description} disabled={busy} onChange={e => setForm(x => ({ ...x, description: e.target.value }))} />
                  {formError && !(formError.includes('Tên') || formError.includes('tên')) && (
                    <p role="alert" className="sm:col-span-2 text-sm text-danger-700 [overflow-wrap:anywhere]">{formError}</p>)}
                  <div className="flex gap-2 sm:col-span-2">
                    <Button type="submit" className="workspace-primary min-h-11" disabled={busy} isLoading={pending === 'create'}>Thêm công việc</Button>
                    <Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={() => setFormOpen(false)}>Hủy</Button>
                  </div>
                </form>
              </Card>
            )}

            <p role="status" aria-live="polite" className="text-sm text-slate-600">{rows.length ? `${rows.length} công việc` : '0 công việc phù hợp'}</p>
            {filters.view === 'list' ? (
              <Card className="p-0 overflow-hidden">
                {rows.length === 0 ? (
                  tasks.length === 0 ? <p className="py-8 text-center text-sm text-slate-600">Chưa có công việc nào trong dự án.</p>
                  : <p className="py-8 text-center text-sm text-slate-600">Không có công việc khớp bộ lọc. <button className="text-primary-700 font-medium hover:underline" onClick={() => { setQ(''); updateFilters({ q: null, status: null, assignee: null, priority: null }); }}>Xóa bộ lọc</button></p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {rows.map(({ task: t, children, viaChild }) => (
                      <li key={t.id} className="px-4 sm:px-5 py-4">
                        <div className="flex flex-wrap items-center gap-3 min-w-0">
                          <span className="min-w-0 flex-1">
                            {taskLink(t)}
                            {viaChild && <span className="ml-2 text-xs text-slate-600">(hiện vì công việc con khớp lọc)</span>}
                            <span className="mt-1.5 block">{meta(t)}</span>
                          </span>
                          {actions(t)}
                        </div>
                        {children.length > 0 && (
                          <ul className="mt-2 ml-4 border-l border-slate-200 pl-4 space-y-2">
                            {children.map(c => (
                              <li key={c.id} className="flex flex-wrap items-center gap-3 min-w-0">
                                <span className="min-w-0 flex-1">{taskLink(c)}<span className="mt-1 block">{meta(c)}</span></span>
                                {actions(c)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ) : (
              <div role="region" aria-label="Bảng công việc" tabIndex={0} className="overflow-x-auto pb-2">
                <div className="flex gap-3" style={{ minWidth: `${COLUMNS.length * 240}px` }}>
                  {COLUMNS.map(col => (
                    <div key={col} className="w-60 shrink-0 rounded-2xl bg-slate-100/80 p-3">
                      <h3 className="mb-3 text-sm font-semibold text-slate-700">{STATUS_LABEL[col]} ({tasks.filter(t => t.status === col && matchTask(t)).length})</h3>
                      {tasks.filter(t => t.status === col && matchTask(t)).map(t => (
                        <Card key={t.id} className="mb-2 p-3">
                          {taskLink(t)}
                          <span className="mt-1.5 block">{meta(t)}</span>
                          {actions(t)}
                        </Card>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
              <Card className="p-4 sm:p-6">
                <h3 className="font-semibold text-slate-900">Thành viên nhóm ({ws!.members.length})</h3>
                <ul className="mt-3 divide-y divide-slate-100">
                  {ws!.members.map(m => (
                    <li key={m.userId} className="flex items-center gap-2 py-2 min-w-0">
                      <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">{initials(m.displayName)}</span>
                      <span className="min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere]">{m.displayName}</span>
                      <Badge value={m.role}>{m.role === 'Leader' ? 'Trưởng nhóm' : 'Thành viên'}</Badge>
                    </li>
                  ))}
                </ul>
              </Card>
              {isLeader && (
                <Card className="p-4 sm:p-6">
                  <h3 className="font-semibold text-slate-900">Hoạt động dự án trong 50 hoạt động nhóm gần nhất</h3>
                  {ws!.activityError ? (
                    <div><p role="alert" className="mt-2 text-sm text-danger-700">{ws!.activityError}</p>
                      <Button variant="secondary" size="sm" className="mt-2 min-h-9" disabled={busy} onClick={() => void (async () => {
                        try { const all = await groupsService.activity(project!.groupId); setWs(w => w ? { ...w, activity: all.filter(a => a.projectId === id), activityError: '' } : w); }
                        catch (e: unknown) {
                          if (status(e) === 403 || status(e) === 404) { loadVersion.current++; clearPrivate(); setFatalError(errMsg(e, 'Không tải được hoạt động')); }
                          else setWs(w => w ? { ...w, activityError: 'Vẫn chưa tải được hoạt động.' } : w);
                        }
                      })()}>Thử lại</Button></div>)
                    : ws!.activity.length === 0 ? <p className="mt-2 text-sm text-slate-600">Chưa có hoạt động nào cho dự án này.</p>
                    : (
                      <ul className="mt-3 divide-y divide-slate-100">
                        {ws!.activity.map(a => (
                          <li key={a.id} className="py-2 text-sm min-w-0">
                            <span className="font-medium [overflow-wrap:anywhere]">{a.actorName}</span> — <span className="[overflow-wrap:anywhere]">{a.summary}</span>
                            <span className="ml-2 text-xs text-slate-600">{formatDateTime(a.createdAt)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                </Card>
              )}
            </div>

            <ConfirmationDialog open={confirm === 'archive'} busy={busy} onClose={() => { if (!busy) setConfirm(null); }} title="Lưu trữ dự án">
              <p>Lưu trữ dự án "{project.name}"? Dự án sẽ không còn nhận công việc mới.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" className="min-h-11 text-danger-700" disabled={busy} isLoading={pending === 'archive'} onClick={archive}>Lưu trữ</Button>
                <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => setConfirm(null)}>Hủy</Button>
              </div>
            </ConfirmationDialog>
          </>
        )}
    </div>
  );
}
