import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Icon from '../components/ui/Icon';
import StatusBar from '../components/ui/StatusBar';
import ResponsiveFilters from '../components/ui/ResponsiveFilters';
import { Breadcrumb, ErrorState } from '../components/workspace/WorkspaceUI';
import ConfirmationDialog from '../components/workspace/ConfirmationDialog';
import { SubmitTaskDialog, RequestChangesDialog } from '../components/tasks/TaskDialogs';
import KanbanBoard, { BOARD_COLUMNS } from '../components/tasks/KanbanBoard';
import StatusTransitionMenu, { transitionLabel } from '../components/tasks/StatusTransitionMenu';
import { useToast } from '../components/ui/Toast';
import { useCurrentUserId } from '../hooks/use-current-user-id';
import { qk } from '../services/query-keys';
import { projectsService, projectsManage, projectLinks, type ProjectDto } from '../services/projects';
import { tasksService, TaskStatus, type TaskSummaryDto } from '../services/tasks';
import { groupsService, type ActivityDto } from '../services/groups';
import { filesService } from '../services/files';
import ProjectDocuments from '../components/projects/ProjectDocuments';
import ProjectDiscussion from '../components/projects/ProjectDiscussion';
import { deadlineState } from '../utils/task-time';
import { formatDate, formatDateTime, STATUS_LABEL, PRIORITY_LABEL, dayKey } from '../utils/presentation';

const errMsg = (e: unknown, fb: string) =>
  typeof (e as { message?: unknown })?.message === 'string' && (e as { message: string }).message ? (e as { message: string }).message : fb;
const errStatus = (e: unknown) => (e as { status?: number })?.status;
const initials = (n?: string | null) => (n || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const vnToIso = (v: string) => (v ? new Date(`${v}:00+07:00`).toISOString() : undefined);

const STATUS_NUM: Record<string, number> = {
  ToDo: TaskStatus.ToDo, InProgress: TaskStatus.InProgress, Submitted: TaskStatus.Submitted,
  ChangesRequested: TaskStatus.ChangesRequested, Completed: TaskStatus.Completed,
};
const SORTS: [string, string][] = [['deadline', 'Hạn gần nhất'], ['created', 'Mới tạo'], ['priority', 'Ưu tiên']];
const PRIORITY_ORDER: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
const PROJECT_STATUS_LABEL: Record<string, string> = {
  NotStarted: 'Chưa bắt đầu', InProgress: 'Đang làm', Completed: 'Hoàn thành', Archived: 'Đã lưu trữ',
};

type DialogKind =
  | { kind: 'submit' | 'changes'; task: TaskSummaryDto }
  | { kind: 'edit' | 'archive' | 'create' }
  | null;

type ProjectTab = 'tasks' | 'discussion' | 'files';
const TAB_ORDER: ProjectTab[] = ['tasks', 'discussion', 'files'];
const TAB_LABEL: Record<ProjectTab, string> = { tasks: 'Công việc', discussion: 'Thảo luận', files: 'Tài liệu' };
const parseTab = (v: string | null): ProjectTab => v === 'discussion' || v === 'files' ? v : 'tasks';

export default function ProjectDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const me = useCurrentUserId() ?? '';
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [justApprovedId, setJustApprovedId] = useState<string | null>(null);

  /* ---------- queries ---------- */
  const projectQ = useQuery({
    queryKey: qk.project(me, id), queryFn: () => projectsService.get(id), enabled: !!me && !!id,
  });
  const tasksQ = useQuery({
    queryKey: qk.projectTasks(me, id), queryFn: () => tasksService.list(id), enabled: !!me && !!id,
  });
  const groupId = projectQ.data?.groupId;
  const groupQ = useQuery({
    queryKey: qk.groupWorkspace(me, groupId ?? ''), queryFn: () => groupsService.get(groupId!),
    enabled: !!me && !!groupId,
  });
  const linksQ = useQuery({
    queryKey: qk.projectLinks(me, id), queryFn: () => projectLinks.links(id), enabled: !!me && !!id,
  });
  const filesQ = useQuery({
    queryKey: qk.projectFiles(me, id), queryFn: () => filesService.listProjectFiles(id), enabled: !!me && !!id,
  });
  const isLeader = groupQ.data?.myRole === 'Leader';
  const activityQ = useQuery({
    queryKey: ['u', me, 'group', groupId, 'activity'] as const,
    queryFn: async () => (await groupsService.activity(groupId!)).filter(a => a.projectId === id),
    enabled: !!me && !!groupId && !!isLeader && !!id,
  });
  const contribQ = useQuery({
    queryKey: qk.projectContributions(me, id),
    queryFn: () => projectsService.contributions(id),
    enabled: !!me && !!id,
    retry: (n, e) => errStatus(e) !== 403 && n < 1,
  });

  /* ---------- filters (URL-persisted) ---------- */
  const filters = useMemo(() => ({
    q: params.get('q') ?? '',
    status: params.get('status') ?? '',
    assignee: params.get('assignee') ?? '',
    priority: params.get('priority') ?? '',
    sort: params.get('sort') ?? 'deadline',
    view: params.get('view') === 'board' ? 'board' : 'list',
  }), [params]);
  const updateFilters = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (!v) next.delete(k); else next.set(k, v); }
    setParams(next, { replace: true });
  };
  const clearFilters = () => updateFilters({ q: null, status: null, assignee: null, priority: null, sort: null });
  const activeFilterCount = [filters.q, filters.status, filters.assignee, filters.priority].filter(Boolean).length;

  /* ---------- tabs (URL-synced, roving tabindex) ---------- */
  const activeTab = parseTab(params.get('tab'));
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const setTab = (t: ProjectTab) => {
    const next = new URLSearchParams(params);
    if (t === 'tasks') next.delete('tab'); else next.set('tab', t);
    setParams(next, { replace: true });
  };
  const onTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    let next = -1;
    if (e.key === 'ArrowRight') next = (index + 1) % TAB_ORDER.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + TAB_ORDER.length) % TAB_ORDER.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TAB_ORDER.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TAB_ORDER[next]);
    tabRefs.current[next]?.focus();
  };
  const docsCount = (linksQ.data?.length ?? 0) + (filesQ.data?.length ?? 0);
  const docsCountLoaded = !linksQ.isPending && !filesQ.isPending;

  /* ---------- derived rows ---------- */
  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const matchTask = (t: TaskSummaryDto) => {
    if (filters.status && t.status !== filters.status) return false;
    if (filters.priority && t.priority !== filters.priority) return false;
    if (filters.assignee === 'unassigned' ? !!t.assigneeUserId : filters.assignee && t.assigneeUserId !== filters.assignee) return false;
    const q = filters.q.trim().toLowerCase();
    if (q && !`${t.title} ${t.assigneeName ?? ''}`.toLowerCase().includes(q)) return false;
    return true;
  };

  const sortKey = (a: TaskSummaryDto, b: TaskSummaryDto) => {
    if (filters.sort === 'priority') {
      const d = (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
      if (d !== 0) return d;
    }
    if (filters.sort === 'created') {
      return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
    }
    // 'deadline' — soonest first, no deadline last
    const ad = a.deadlineAt ?? '9999', bd = b.deadlineAt ?? '9999';
    return ad.localeCompare(bd);
  };

  const parents = tasks.filter(t => !t.parentTaskId);
  const allChildren = tasks.filter(t => t.parentTaskId);
  const rows: { task: TaskSummaryDto; children: TaskSummaryDto[]; viaChild?: boolean }[] = [];
  for (const p of parents) {
    const matchedKids = allChildren.filter(c => c.parentTaskId === p.id && matchTask(c));
    if (matchTask(p)) rows.push({ task: p, children: matchedKids });
    else if (matchedKids.length) rows.push({ task: p, children: matchedKids, viaChild: true });
  }
  for (const c of allChildren) {
    if (!parents.some(p => p.id === c.parentTaskId) && matchTask(c))
      rows.push({ task: c, children: [], viaChild: true });
  }
  rows.sort((x, y) => sortKey(x.task, y.task));

  const boardTasks = parents.filter(matchTask).sort(sortKey);

  /* ---------- status counts for StatusBar (top-level only) ---------- */
  const topLevel = useMemo(() => tasks.filter(t => !t.parentTaskId), [tasks]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of topLevel) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [topLevel]);
  const overdueCount = useMemo(
    () => topLevel.filter(t => deadlineState(t.deadlineAt, t.status).kind === 'overdue').length,
    [topLevel],
  );
  const completedCount = counts['Completed'] ?? 0;
  const pct = topLevel.length ? Math.round((completedCount / topLevel.length) * 100) : 0;

  /* ---------- mutations ---------- */
  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: qk.projectTasks(me, id) });
    void qc.invalidateQueries({ queryKey: qk.myTasks(me) });
  };

  const transitionM = useMutation({
    mutationFn: ({ task, target, comment }: { task: TaskSummaryDto; target: string; comment?: string }) =>
      tasksService.changeStatus(task.id, STATUS_NUM[target], comment),
    onMutate: async ({ task, target }) => {
      await qc.cancelQueries({ queryKey: qk.projectTasks(me, id) });
      const prev = qc.getQueryData<TaskSummaryDto[]>(qk.projectTasks(me, id));
      qc.setQueryData<TaskSummaryDto[]>(qk.projectTasks(me, id), old =>
        old?.map(t => (t.id === task.id ? { ...t, status: target } : t)));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.projectTasks(me, id), ctx.prev);
      const s = errStatus(e);
      if (s === 403 || s === 404) void qc.invalidateQueries({ queryKey: qk.projectTasks(me, id) });
      else toast.error(errMsg(e, 'Không chuyển được trạng thái công việc.'));
    },
    onSuccess: (_d, { task, target }) => {
      if (target === 'Completed') {
        toast.success('Đã duyệt công việc.');
        setJustApprovedId(task.id);
        setTimeout(() => setJustApprovedId(null), 1600);
      } else if (target === 'Submitted') toast.success('Đã nộp công việc để duyệt.');
      else if (target === 'ChangesRequested') toast.success('Đã gửi yêu cầu chỉnh sửa.');
      else toast.success(`Đã chuyển: ${transitionLabel(task.status, target)}.`);
      void qc.invalidateQueries({ queryKey: qk.task(me, task.id) });
    },
    onSettled: invalidateAll,
  });

  const requestTransition = (task: TaskSummaryDto, target: string) => {
    if (target === 'Submitted') setDialog({ kind: 'submit', task });
    else if (target === 'ChangesRequested') setDialog({ kind: 'changes', task });
    else transitionM.mutate({ task, target });
  };

  const archiveM = useMutation({
    mutationFn: () => projectsManage.archive(id),
    onSuccess: () => {
      toast.success('Đã lưu trữ dự án.');
      navigate(`/groups/${groupId ?? ''}`);
    },
    onError: (e) => {
      if (errStatus(e) === 403 || errStatus(e) === 404) {
        void qc.invalidateQueries();
      } else toast.error(errMsg(e, 'Không lưu trữ được dự án.'));
    },
  });

  /* ---------- render ---------- */
  const project = projectQ.data;
  const loadErr = projectQ.error ?? tasksQ.error;
  const loading = projectQ.isPending || tasksQ.isPending || (!!groupId && groupQ.isPending);

  const fatalMessage = () => {
    const s = errStatus(loadErr);
    if (s === 404 || s === 403) return s === 404 ? 'Không tìm thấy dự án.' : errMsg(loadErr, 'Bạn không có quyền xem dự án này.');
    if (loadErr) return errMsg(loadErr, 'Không tải được dự án.');
    return '';
  };
  const fatal = loading ? '' : fatalMessage() || (!project ? 'Không tìm thấy dự án.' : '');

  const members = groupQ.data?.members ?? [];
  const dl = project ? deadlineState(project.deadlineAt, project.status === 'Completed' || project.status === 'Archived' ? 'Completed' : undefined) : null;
  const navState = { navigationSection: '/groups', returnTo: `/projects/${id}${params.size ? `?${params}` : ''}` };

  return (
    <MainLayout>
      {loading ? (
        <div className="mx-auto max-w-6xl space-y-6">
          <p role="status" className="sr-only">Đang tải dự án…</p>
          <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
            <div className="h-8 w-56 rounded bg-surface-subtle" />
            <div className="grid gap-4 sm:grid-cols-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl bg-surface-subtle" />)}</div>
          </div>
        </div>
      ) : fatal || !project ? (
        <ErrorState message={fatal || 'Không tìm thấy dự án.'} onRetry={() => { void projectQ.refetch(); void tasksQ.refetch(); }} backTo="/groups" backLabel="Về nhóm của tôi" />
      ) : (
        <div className="mx-auto max-w-6xl space-y-6">
          <Breadcrumb hideCurrentBelowSm items={[
            { label: 'Nhóm của tôi', to: '/groups' },
            { label: groupQ.data?.name ?? 'Nhóm', to: `/groups/${project.groupId}` },
            { label: project.name },
          ]} />

          <header className="flex flex-wrap items-start justify-between gap-4 min-w-0">
            <div className="min-w-0">
              <h2 className="text-title font-semibold text-ink [overflow-wrap:anywhere]">{project.name}</h2>
              {project.subject && <p className="mt-0.5 text-small text-ink-muted">Môn: {project.subject}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge value={project.status}>{PROJECT_STATUS_LABEL[project.status] ?? project.status}</Badge>
                {project.deadlineAt && (
                  <span className={dl?.kind === 'overdue' ? 'text-small font-medium text-danger-700' : 'text-small text-ink-muted'}>
                    Hạn {formatDate(project.deadlineAt)}{dl?.kind === 'overdue' || dl?.kind === 'today' ? ` · ${dl.label}` : ''}
                  </span>
                )}
              </div>
              {project.description && <p className="mt-2 max-w-[65ch] text-body text-ink-secondary [overflow-wrap:anywhere]">{project.description}</p>}
            </div>
            {isLeader && (
              <div className="flex flex-wrap gap-2">
                <Button className="min-h-11 gap-1" onClick={() => setDialog({ kind: 'create' })}>
                  <Icon name="plus" size={15} />Thêm công việc
                </Button>
                <Button variant="secondary" className="min-h-11" onClick={() => setDialog({ kind: 'edit' })}>Sửa dự án</Button>
                {project.status !== 'Archived' && (
                  <Button variant="danger" className="min-h-11" onClick={() => setDialog({ kind: 'archive' })}>Lưu trữ</Button>
                )}
              </div>
            )}
          </header>

          <Card className="p-4 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-section font-semibold text-ink">Tiến độ dự án</h3>
              <span className="text-small tabular-nums text-ink-secondary">{completedCount}/{topLevel.length} hoàn thành · {pct}%</span>
            </div>
            <div className="mt-3">
              <StatusBar counts={counts} overdue={overdueCount} />
            </div>
          </Card>

          {/* ---------- tabs ---------- */}
          <div role="tablist" aria-label="Nội dung dự án" className="flex gap-1 overflow-x-auto border-b border-line">
            {TAB_ORDER.map((t, i) => (
              <button key={t} ref={el => { tabRefs.current[i] = el; }}
                id={`ptab-${t}`} role="tab" type="button"
                aria-selected={activeTab === t} aria-controls={`ppanel-${t}`}
                tabIndex={activeTab === t ? 0 : -1}
                onClick={() => setTab(t)} onKeyDown={e => onTabKeyDown(e, i)}
                className={`min-h-11 shrink-0 border-b-2 px-3 text-small font-medium transition-colors sm:px-4 ${
                  activeTab === t
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-ink-secondary hover:text-ink'}`}>
                {t === 'files' && docsCountLoaded ? `Tài liệu (${docsCount})` : TAB_LABEL[t]}
              </button>
            ))}
          </div>

          {activeTab === 'discussion' && (
            <div id="ppanel-discussion" role="tabpanel" aria-labelledby="ptab-discussion" tabIndex={0}>
              <ProjectDiscussion projectId={id} members={members} />
            </div>
          )}
          {activeTab === 'files' && (
            <div id="ppanel-files" role="tabpanel" aria-labelledby="ptab-files" tabIndex={0}>
              <ProjectDocuments projectId={id} uid={me} canAdd busy={transitionM.isPending} />
            </div>
          )}
          {activeTab === 'tasks' && (
          <div id="ppanel-tasks" role="tabpanel" aria-labelledby="ptab-tasks" tabIndex={0} className="space-y-6">
          {/* ---------- filters + view toggle ---------- */}
          <ResponsiveFilters activeCount={activeFilterCount} search={
            <form role="search" onSubmit={e => e.preventDefault()}>
              <label htmlFor="ptask-q" className="sr-only">Tìm công việc</label>
              <input id="ptask-q" type="search" value={filters.q}
                onChange={e => updateFilters({ q: e.target.value || null })}
                placeholder="Tên hoặc người phụ trách"
                className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-body" />
            </form>
          }>
            <div className="flex flex-wrap items-end gap-3">
              <select aria-label="Lọc trạng thái" value={filters.status} onChange={e => updateFilters({ status: e.target.value || null })}
                className="min-h-11 min-w-0 max-w-full rounded-xl border border-line bg-white px-3 py-2">
                <option value="">Tất cả trạng thái</option>
                {BOARD_COLUMNS.map(c => <option key={c} value={c}>{STATUS_LABEL[c]}</option>)}
              </select>
              <select aria-label="Lọc người phụ trách" value={filters.assignee} onChange={e => updateFilters({ assignee: e.target.value || null })}
                className="min-h-11 min-w-0 max-w-full rounded-xl border border-line bg-white px-3 py-2">
                <option value="">Mọi người</option>
                <option value="unassigned">Chưa giao</option>
                {members.map(m => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
              </select>
              <select aria-label="Lọc ưu tiên" value={filters.priority} onChange={e => updateFilters({ priority: e.target.value || null })}
                className="min-h-11 min-w-0 max-w-full rounded-xl border border-line bg-white px-3 py-2">
                <option value="">Mọi ưu tiên</option>
                {(['Low', 'Medium', 'High', 'Urgent'] as const).map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
              <select aria-label="Sắp xếp" value={filters.sort} onChange={e => updateFilters({ sort: e.target.value === 'deadline' ? null : e.target.value })}
                className="min-h-11 min-w-0 max-w-full rounded-xl border border-line bg-white px-3 py-2">
                {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <div role="group" aria-label="Chế độ xem" className="flex overflow-hidden rounded-xl border border-line">
                {(['list', 'board'] as const).map(v => (
                  <button key={v} type="button" aria-pressed={filters.view === v}
                    onClick={() => updateFilters({ view: v === 'list' ? null : v })}
                    className={`min-h-11 px-3 text-small font-medium ${filters.view === v ? 'bg-primary-50 text-primary-700' : 'text-ink-secondary hover:bg-surface-subtle'}`}>
                    {v === 'list' ? 'Danh sách' : 'Bảng'}
                  </button>
                ))}
              </div>
              {activeFilterCount > 0 && (
                <button type="button" className="min-h-9 text-small font-medium text-primary-700 hover:underline" onClick={clearFilters}>Xóa lọc</button>
              )}
            </div>
          </ResponsiveFilters>

          <p role="status" aria-live="polite" className="text-small text-ink-muted">
            {rows.length ? `${rows.length} công việc` : '0 công việc phù hợp'}
          </p>

          {/* ---------- list or board ---------- */}
          {filters.view === 'list' ? (
            <Card className="p-0 overflow-hidden">
              {rows.length === 0 ? (
                tasks.length === 0
                  ? <p className="py-8 text-center text-small text-ink-muted">Chưa có công việc nào trong dự án.</p>
                  : <p className="py-8 text-center text-small text-ink-muted">Không có công việc khớp bộ lọc.{' '}
                      <button type="button" className="font-medium text-primary-700 hover:underline" onClick={clearFilters}>Xóa bộ lọc</button></p>
              ) : (
                <ul className="divide-y divide-line">
                  {rows.map(({ task: t, children, viaChild }) => {
                    const open = expanded[t.id] ?? !!viaChild;
                    return (
                      <TaskRow key={t.id} task={t} childrenTasks={children} viaChild={viaChild}
                        expanded={open}
                        onToggle={() => setExpanded(x => ({ ...x, [t.id]: !open }))}
                        navState={navState} busy={transitionM.isPending}
                        onTransition={requestTransition} />
                    );
                  })}
                </ul>
              )}
            </Card>
          ) : (
            <KanbanBoard tasks={boardTasks} busy={transitionM.isPending}
              justApprovedId={justApprovedId} onTransition={requestTransition} />
          )}

          {/* ---------- members + activity + contributions ---------- */}
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
            <section aria-labelledby="contrib-h">
            <Card className="p-4 sm:p-6">
              <h3 id="contrib-h" className="text-section font-semibold text-ink">Điểm đóng góp</h3>
              {contribQ.isPending ? (
                <p role="status" className="mt-3 text-small text-ink-muted">Đang tải điểm đóng góp…</p>
              ) : contribQ.isError ? (
                <div>
                  <p role="alert" className="mt-2 text-small text-danger-700">{errMsg(contribQ.error, 'Không tải được điểm đóng góp.')}</p>
                  <Button variant="secondary" size="sm" className="mt-2 min-h-9" onClick={() => void contribQ.refetch()}>Thử lại</Button>
                </div>
              ) : contribQ.data && (
                contribQ.data.isLeader ? (
                  <>
                    <p className="mt-1 text-small text-ink-secondary">
                      Đã duyệt {contribQ.data.totalCredited} / dự kiến {contribQ.data.totalPlanned} điểm.
                    </p>
                    {contribQ.data.members.length === 0 || contribQ.data.members.every(m => m.creditedPoints === 0 && m.plannedPoints === 0) ? (
                      <p className="mt-3 text-small text-ink-muted">Chưa có công việc nào có điểm được duyệt.</p>
                    ) : (
                      <ul className="mt-3 divide-y divide-line">
                        {contribQ.data.members.map(m => (
                          <li key={m.userId} className="py-2.5 min-w-0">
                            <div className="flex items-baseline justify-between gap-2 min-w-0">
                              <span className="truncate text-small font-medium text-ink">{m.displayName}</span>
                              <span className="shrink-0 text-small font-semibold tabular-nums text-accent-700">{m.creditedPoints} điểm</span>
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-subtle" role="img"
                                aria-label={`${m.displayName}: ${m.percent}% điểm đã duyệt của dự án`}>
                                <span className="block h-1.5 rounded-full bg-accent-500" style={{ width: `${Math.min(100, m.percent)}%` }} />
                              </span>
                              <span className="shrink-0 text-caption tabular-nums text-ink-muted">{m.percent}%</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-small text-ink">
                    Bạn: <span className="font-semibold text-accent-700">{contribQ.data.members[0]?.creditedPoints ?? 0} điểm</span>
                    {' · '}{contribQ.data.members[0]?.percent ?? 0}% điểm đã duyệt của dự án
                  </p>
                )
              )}
              <p className="mt-4 border-t border-line pt-3 text-caption text-ink-muted">
                Điểm của công việc được cộng cho người phụ trách khi Trưởng nhóm duyệt; tỷ lệ = điểm của thành viên / tổng điểm đã duyệt của dự án.
              </p>
            </Card>
            </section>
            <Card className="p-4 sm:p-6">
              <h3 className="text-section font-semibold text-ink">Thành viên nhóm ({members.length})</h3>
              <ul className="mt-3 divide-y divide-line">
                {members.map(m => (
                  <li key={m.userId} className="flex items-center gap-2 py-2 min-w-0">
                    <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-caption font-semibold text-primary-700">{initials(m.displayName)}</span>
                    <span className="min-w-0 flex-1 text-small font-medium [overflow-wrap:anywhere]">{m.displayName}</span>
                    {typeof m.openTaskCount === 'number' && (
                      <span className="text-caption tabular-nums text-ink-muted">{m.openTaskCount} việc</span>
                    )}
                    <Badge value={m.role}>{m.role === 'Leader' ? 'Trưởng nhóm' : 'Thành viên'}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
            {isLeader && (
              <Card className="p-4 sm:p-6">
                <h3 className="text-section font-semibold text-ink">Hoạt động dự án</h3>
                {activityQ.isPending ? (
                  <p role="status" className="mt-3 text-small text-ink-muted">Đang tải hoạt động…</p>
                ) : activityQ.isError ? (
                  <div>
                    <p role="alert" className="mt-2 text-small text-danger-700">{errMsg(activityQ.error, 'Không tải được hoạt động.')}</p>
                    <Button variant="secondary" size="sm" className="mt-2 min-h-9" onClick={() => void activityQ.refetch()}>Thử lại</Button>
                  </div>
                ) : (activityQ.data ?? []).length === 0 ? (
                  <p className="mt-3 text-small text-ink-muted">Chưa có hoạt động nào cho dự án này.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-line">
                    {(activityQ.data ?? []).slice(0, 50).map((a: ActivityDto) => (
                      <li key={a.id} className="py-2 text-small min-w-0">
                        <span className="font-medium [overflow-wrap:anywhere]">{a.actorName}</span> — <span className="[overflow-wrap:anywhere]">{a.summary}</span>
                        <span className="ml-2 text-caption text-ink-muted">{formatDateTime(a.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>
          </div>
          )}
        </div>
      )}

      {/* ---------- dialogs ---------- */}
      {dialog?.kind === 'submit' && (
        <SubmitTaskDialog busy={transitionM.isPending}
          blockedReason={(() => {
            const open = (dialog.task.subtaskCount ?? 0) - (dialog.task.subtasksCompleted ?? 0);
            return open > 0 ? 'Hoàn thành tất cả công việc con trước khi nộp.' : undefined;
          })()}
          onClose={() => setDialog(null)}
          onSubmit={(note) => transitionM.mutate({ task: dialog.task, target: 'Submitted', comment: note || undefined }, { onSuccess: () => setDialog(null) })} />
      )}
      {dialog?.kind === 'changes' && (
        <RequestChangesDialog busy={transitionM.isPending}
          onClose={() => setDialog(null)}
          onSubmit={(comment) => transitionM.mutate({ task: dialog.task, target: 'ChangesRequested', comment }, { onSuccess: () => setDialog(null) })} />
      )}
      {dialog?.kind === 'create' && project && (
        <CreateTaskDialog projectId={id} members={members} parents={topLevel}
          onClose={() => setDialog(null)} invalidate={invalidateAll} />
      )}
      {dialog?.kind === 'edit' && project && (
        <EditProjectDialog project={project} onClose={() => setDialog(null)}
          invalidate={() => void qc.invalidateQueries({ queryKey: qk.project(me, id) })} />
      )}
      <ConfirmationDialog open={dialog?.kind === 'archive'} title="Lưu trữ dự án" busy={archiveM.isPending} onClose={() => setDialog(null)}>
        <p>Lưu trữ dự án “{project?.name}”? Dự án sẽ không còn nhận công việc mới.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" disabled={archiveM.isPending} onClick={() => setDialog(null)}>Hủy</Button>
          <Button variant="danger" isLoading={archiveM.isPending} onClick={() => archiveM.mutate()}>Lưu trữ</Button>
        </div>
      </ConfirmationDialog>
    </MainLayout>
  );
}

/* ---------- list row ---------- */
function TaskRow({ task: t, childrenTasks, viaChild, expanded, onToggle, navState, busy, onTransition }: {
  task: TaskSummaryDto; childrenTasks: TaskSummaryDto[]; viaChild?: boolean; expanded: boolean;
  onToggle: () => void; navState: { navigationSection: string; returnTo: string };
  busy: boolean; onTransition: (task: TaskSummaryDto, target: string) => void;
}) {
  const meta = (task: TaskSummaryDto) => {
    const d = deadlineState(task.deadlineAt, task.status);
    return (
      <span className="flex flex-wrap items-center gap-2 text-small">
        <span className="inline-flex items-center gap-1.5 text-ink-muted min-w-0">
          <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-semibold text-primary-700">{initials(task.assigneeName)}</span>
          <span className="min-w-0 [overflow-wrap:anywhere]">{task.assigneeName || 'Chưa giao'}</span>
        </span>
        {d.label && <span className={d.kind === 'overdue' ? 'font-medium text-danger-700' : d.kind === 'today' ? 'font-medium text-warning-700' : 'text-ink-muted'}>{d.label}</span>}
        <Badge value={task.priority}>{PRIORITY_LABEL[task.priority] ?? task.priority}</Badge>
        <Badge value={task.status}>{STATUS_LABEL[task.status] ?? task.status}</Badge>
      </span>
    );
  };
  const childRow = (c: TaskSummaryDto) => (
    <li key={c.id} className="flex flex-wrap items-center gap-3 min-w-0">
      <span className="min-w-0 flex-1">
        <Link to={`/tasks/${c.id}`} state={navState} title={c.title}
          className="line-clamp-2 min-w-0 text-small font-medium text-ink hover:text-primary-700 [overflow-wrap:anywhere]">{c.title}</Link>
        <span className="mt-1 block">{meta(c)}</span>
      </span>
      <StatusTransitionMenu current={c.status} targets={c.permissions?.allowedTransitions ?? []} busy={busy}
        onChoose={(t) => onTransition(c, t)} />
    </li>
  );
  return (
    <li className="px-4 sm:px-5 py-4">
      <div className="flex flex-wrap items-center gap-3 min-w-0">
        {(t.subtaskCount ?? 0) > 0 && (
          <button type="button" aria-expanded={expanded} aria-controls={`subs-${t.id}`}
            aria-label={expanded ? `Thu gọn công việc con của ${t.title}` : `Mở công việc con của ${t.title}`}
            onClick={onToggle}
            className="shrink-0 rounded-md p-1 text-ink-muted hover:bg-surface-subtle">
            <Icon name="chevron-down" size={14} className={`transition-transform ${expanded ? 'rotate-180' : '-rotate-90'}`} />
          </button>
        )}
        <span className="min-w-0 flex-1">
          <Link to={`/tasks/${t.id}`} state={navState} title={t.title}
            className="line-clamp-2 min-w-0 font-medium text-ink hover:text-primary-700 [overflow-wrap:anywhere]">{t.title}</Link>
          {viaChild && <span className="ml-2 text-caption text-ink-muted">(hiện vì công việc con khớp lọc)</span>}
          <span className="mt-1.5 block">{meta(t)}</span>
        </span>
        {(t.subtaskCount ?? 0) > 0 && (
          <span className="text-caption tabular-nums text-ink-muted">{t.subtasksCompleted ?? 0}/{t.subtaskCount} con</span>
        )}
        <StatusTransitionMenu current={t.status} targets={t.permissions?.allowedTransitions ?? []} busy={busy}
          onChoose={(target) => onTransition(t, target)} />
      </div>
      {expanded && childrenTasks.length > 0 && (
        <ul id={`subs-${t.id}`} className="mt-2 ml-4 space-y-2 border-l border-line pl-4">
          {childrenTasks.map(childRow)}
        </ul>
      )}
    </li>
  );
}

/* ---------- create task dialog ---------- */
const PRIORITY_OPTIONS: [number, string][] = [[1, 'Thấp'], [2, 'Trung bình'], [3, 'Cao'], [4, 'Khẩn cấp']];

function CreateTaskDialog({ projectId, members, parents, onClose, invalidate }: {
  projectId: string;
  members: { userId: string; displayName: string }[];
  parents: TaskSummaryDto[];
  onClose: () => void;
  invalidate: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState('');
  const [parent, setParent] = useState('');
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState(2);
  const [estimate, setEstimate] = useState('');
  const [error, setError] = useState('');
  const sentRef = useRef(false);

  const createM = useMutation({
    mutationFn: () => tasksService.create(projectId, {
      title: title.trim(),
      description: description.trim() || undefined,
      assigneeUserId: assignee || undefined,
      parentTaskId: parent || undefined,
      priority,
      deadlineAt: vnToIso(deadline),
      estimateHours: estimate ? +estimate : undefined,
    }),
    onSuccess: () => { invalidate(); toast.success('Đã tạo công việc.'); onClose(); },
    onError: (e) => {
      const s = errStatus(e);
      if (s === 403 || s === 404) { onClose(); invalidate(); return; }
      setError(errMsg(e, 'Không tạo được công việc.'));
      sentRef.current = false;
    },
  });

  const submit = () => {
    if (sentRef.current || createM.isPending) return;
    const n = title.trim();
    if (!n) { setError('Nhập tên công việc.'); return; }
    if (n.length > 200) { setError('Tên tối đa 200 ký tự.'); return; }
    if (estimate && (!Number.isFinite(+estimate) || +estimate < 0)) { setError('Ước lượng phải là số không âm.'); return; }
    if (deadline && Number.isNaN(Date.parse(deadline))) { setError('Hạn không hợp lệ.'); return; }
    sentRef.current = true;
    createM.mutate();
  };

  return (
    <ConfirmationDialog open title="Thêm công việc" busy={createM.isPending} onClose={onClose}>
      <form noValidate onSubmit={e => { e.preventDefault(); submit(); }} className="mt-1 grid gap-3 sm:grid-cols-2">
        <Input id="nt-title" label="Tên công việc" maxLength={200} value={title} disabled={createM.isPending}
          error={error && (error.includes('Tên') || error.includes('tên')) ? error : undefined}
          onChange={e => { setTitle(e.target.value); setError(''); }} />
        <div>
          <label htmlFor="nt-parent" className="block text-small font-semibold text-ink-secondary mb-1.5">Thuộc công việc (không bắt buộc)</label>
          <select id="nt-parent" value={parent} disabled={createM.isPending} onChange={e => setParent(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2">
            <option value="">Công việc chính</option>
            {parents.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="nt-assignee" className="block text-small font-semibold text-ink-secondary mb-1.5">Giao cho</label>
          <select id="nt-assignee" value={assignee} disabled={createM.isPending} onChange={e => setAssignee(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2">
            <option value="">Chưa giao</option>
            {members.map(m => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="nt-priority" className="block text-small font-semibold text-ink-secondary mb-1.5">Ưu tiên</label>
          <select id="nt-priority" value={priority} disabled={createM.isPending} onChange={e => setPriority(+e.target.value)}
            className="min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2">
            {PRIORITY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <Input id="nt-deadline" label="Hạn (giờ Việt Nam)" type="datetime-local" value={deadline}
          disabled={createM.isPending} onChange={e => setDeadline(e.target.value)} />
        <Input id="nt-est" label="Ước lượng (giờ, tuỳ chọn)" type="number" min="0" step="0.5" value={estimate}
          disabled={createM.isPending} onChange={e => setEstimate(e.target.value)} />
        <div className="sm:col-span-2">
          <label htmlFor="nt-desc" className="block text-small font-semibold text-ink-secondary mb-1.5">Mô tả (tuỳ chọn)</label>
          <textarea id="nt-desc" rows={3} maxLength={2000} value={description} disabled={createM.isPending}
            onChange={e => setDescription(e.target.value)}
            className="w-full rounded-xl border border-line bg-white px-3 py-2 text-body" />
        </div>
        {error && !(error.includes('Tên') || error.includes('tên')) && (
          <p role="alert" className="sm:col-span-2 text-small text-danger-700 [overflow-wrap:anywhere]">{error}</p>
        )}
      </form>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" disabled={createM.isPending} onClick={onClose}>Hủy</Button>
        <Button isLoading={createM.isPending} onClick={submit}>Thêm công việc</Button>
      </div>
    </ConfirmationDialog>
  );
}

/* ---------- edit project dialog ---------- */
function EditProjectDialog({ project, onClose, invalidate }: {
  project: ProjectDto; onClose: () => void; invalidate: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [subject, setSubject] = useState(project.subject ?? '');
  const [deadline, setDeadline] = useState(project.deadlineAt ? dayKey(project.deadlineAt) : '');
  const [error, setError] = useState('');
  const sentRef = useRef(false);

  const editM = useMutation({
    mutationFn: () => projectsManage.update(project.id, {
      name: name.trim(),
      description: description.trim() || undefined,
      subject: subject.trim() || undefined,
      deadlineAt: !deadline ? undefined
        : (project.deadlineAt && dayKey(project.deadlineAt) === deadline)
          ? project.deadlineAt
          : new Date(`${deadline}T23:59:00+07:00`).toISOString(),
    }),
    onSuccess: () => { invalidate(); toast.success('Đã cập nhật dự án.'); onClose(); },
    onError: (e) => {
      const s = errStatus(e);
      if (s === 403 || s === 404) { onClose(); invalidate(); return; }
      setError(errMsg(e, 'Không cập nhật được dự án.'));
      sentRef.current = false;
    },
  });

  const submit = () => {
    if (sentRef.current || editM.isPending) return;
    if (!name.trim()) { setError('Nhập tên dự án.'); return; }
    sentRef.current = true;
    editM.mutate();
  };

  return (
    <ConfirmationDialog open title="Sửa dự án" busy={editM.isPending} onClose={onClose}>
      <form noValidate onSubmit={e => { e.preventDefault(); submit(); }} className="mt-1 grid gap-3 sm:grid-cols-2">
        <Input id="pe-name" label="Tên dự án" maxLength={200} value={name} disabled={editM.isPending}
          error={error} onChange={e => { setName(e.target.value); setError(''); }} />
        <Input id="pe-subject" label="Môn học" maxLength={100} value={subject} disabled={editM.isPending}
          onChange={e => setSubject(e.target.value)} />
        <Input id="pe-deadline" label="Hạn" type="date" value={deadline} disabled={editM.isPending}
          onChange={e => setDeadline(e.target.value)} />
        <div className="sm:col-span-2">
          <label htmlFor="pe-desc" className="block text-small font-semibold text-ink-secondary mb-1.5">Mô tả</label>
          <textarea id="pe-desc" rows={3} maxLength={2000} value={description} disabled={editM.isPending}
            onChange={e => setDescription(e.target.value)}
            className="w-full rounded-xl border border-line bg-white px-3 py-2 text-body" />
        </div>
      </form>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" disabled={editM.isPending} onClick={onClose}>Hủy</Button>
        <Button isLoading={editM.isPending} onClick={submit}>Lưu</Button>
      </div>
    </ConfirmationDialog>
  );
}
