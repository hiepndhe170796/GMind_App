import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import ResponsiveFilters from '../components/ui/ResponsiveFilters';
import { ErrorState } from '../components/workspace/WorkspaceUI';
import { SubmitTaskDialog } from '../components/tasks/TaskDialogs';
import MyTaskRow from '../components/tasks/MyTaskRow';
import { useToast } from '../components/ui/Toast';
import { useCurrentUserId } from '../hooks/use-current-user-id';
import { qk } from '../services/query-keys';
import { dashboardService, type MyTaskDto } from '../services/dashboard';
import { tasksService, TaskStatus } from '../services/tasks';
import { deadlineState } from '../utils/task-time';
import { STATUS_LABEL, PRIORITY_LABEL, formatDate } from '../utils/presentation';

const errMsg = (e: unknown, fb: string) =>
  typeof (e as { message?: unknown })?.message === 'string' && (e as { message: string }).message ? (e as { message: string }).message : fb;

const SECTIONS: { kind: string; label: string }[] = [
  { kind: 'overdue', label: 'Quá hạn' },
  { kind: 'today', label: 'Hôm nay' },
  { kind: 'tomorrow', label: 'Ngày mai' },
  { kind: 'soon', label: '7 ngày tới' },
  { kind: 'later', label: 'Sau đó' },
  { kind: 'none', label: 'Không có hạn' },
];

export default function MyTasks() {
  const me = useCurrentUserId() ?? '';
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [submitTask, setSubmitTask] = useState<MyTaskDto | null>(null);

  const filters = useMemo(() => ({
    status: params.get('status') ?? '',
    project: params.get('project') ?? '',
    priority: params.get('priority') ?? '',
    done: params.get('done') === '1',
  }), [params]);
  const updateFilters = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (!v) next.delete(k); else next.set(k, v); }
    setParams(next, { replace: true });
  };

  const tasksQ = useQuery({
    queryKey: [...qk.myTasks(me), filters.done] as const,
    queryFn: () => dashboardService.myTasks(filters.done),
    enabled: !!me,
  });

  const helpingQ = useQuery({
    queryKey: qk.helping(me), queryFn: () => dashboardService.helping(), enabled: !!me,
  });
  const helping = helpingQ.data ?? [];

  const transitionM = useMutation({
    mutationFn: ({ task, target, comment }: { task: MyTaskDto; target: string; comment?: string }) =>
      tasksService.changeStatus(task.id, target === 'Submitted' ? TaskStatus.Submitted : TaskStatus.InProgress, comment),
    onSuccess: (_d, { target }) => {
      toast.success(target === 'Submitted' ? 'Đã nộp công việc để duyệt.' : 'Đã chuyển sang đang làm.');
    },
    onError: (e) => toast.error(errMsg(e, 'Không chuyển được trạng thái công việc.')),
    onSettled: (_d, _e, { task }) => {
      void qc.invalidateQueries({ queryKey: qk.myTasks(me) });
      void qc.invalidateQueries({ queryKey: qk.task(me, task.id) });
      void qc.invalidateQueries({ queryKey: qk.projectTasks(me, task.projectId) });
    },
  });

  const items = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);
  const projects = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of items) if (!map.has(t.projectId)) map.set(t.projectId, t.projectName);
    return [...map.entries()];
  }, [items]);

  const visible = items.filter(t => {
    if (filters.status && t.status !== filters.status) return false;
    if (filters.project && t.projectId !== filters.project) return false;
    if (filters.priority && t.priority !== filters.priority) return false;
    return true;
  });

  const sections = SECTIONS.map(s => ({
    ...s,
    tasks: visible.filter(t => deadlineState(t.deadlineAt, t.status).kind === s.kind),
  })).filter(s => s.tasks.length > 0);

  const activeFilterCount = [filters.status, filters.project, filters.priority].filter(Boolean).length;
  const navState = { navigationSection: '/my-tasks', returnTo: `/my-tasks${params.size ? `?${params}` : ''}` };

  const quickAction = (t: MyTaskDto) => {
    const allowed = t.permissions?.allowedTransitions ?? [];
    if (t.status === 'ToDo' && allowed.includes('InProgress')) {
      return <Button size="sm" className="min-h-9" disabled={transitionM.isPending}
        onClick={() => transitionM.mutate({ task: t, target: 'InProgress' })}>Bắt đầu</Button>;
    }
    if (t.status === 'ChangesRequested' && allowed.includes('InProgress')) {
      return <Button size="sm" variant="secondary" className="min-h-9" disabled={transitionM.isPending}
        onClick={() => transitionM.mutate({ task: t, target: 'InProgress' })}>Làm lại</Button>;
    }
    if (t.status === 'InProgress' && allowed.includes('Submitted')) {
      return <Button size="sm" className="min-h-9" disabled={transitionM.isPending}
        onClick={() => setSubmitTask(t)}>Nộp</Button>;
    }
    return null;
  };

  return (
    <MainLayout>
      <div className="max-w-5xl space-y-6">
        <header>
          <h2 className="text-title font-semibold text-ink">Việc của tôi</h2>
          <p className="mt-1 text-small text-ink-muted">Các công việc được giao cho bạn, sắp xếp theo hạn.</p>
        </header>

        <ResponsiveFilters activeCount={activeFilterCount} search={
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-small font-medium text-ink">
            <input type="checkbox" checked={filters.done}
              onChange={e => updateFilters({ done: e.target.checked ? '1' : null })}
              className="h-4 w-4 rounded border-line accent-primary-600" />
            Hiện việc đã hoàn thành
          </label>
        }>
          <div className="flex flex-wrap items-end gap-3">
            <select aria-label="Lọc trạng thái" value={filters.status} onChange={e => updateFilters({ status: e.target.value || null })}
              className="min-h-11 min-w-0 max-w-full rounded-xl border border-line bg-white px-3 py-2">
              <option value="">Tất cả trạng thái</option>
              {Object.keys(STATUS_LABEL).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <select aria-label="Lọc dự án" value={filters.project} onChange={e => updateFilters({ project: e.target.value || null })}
              className="min-h-11 min-w-0 max-w-full rounded-xl border border-line bg-white px-3 py-2">
              <option value="">Mọi dự án</option>
              {projects.map(([pid, name]) => <option key={pid} value={pid}>{name}</option>)}
            </select>
            <select aria-label="Lọc ưu tiên" value={filters.priority} onChange={e => updateFilters({ priority: e.target.value || null })}
              className="min-h-11 min-w-0 max-w-full rounded-xl border border-line bg-white px-3 py-2">
              <option value="">Mọi ưu tiên</option>
              {(['Low', 'Medium', 'High', 'Urgent'] as const).map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
            {activeFilterCount > 0 && (
              <button type="button" className="min-h-9 text-small font-medium text-primary-700 hover:underline"
                onClick={() => updateFilters({ status: null, project: null, priority: null })}>Xóa lọc</button>
            )}
          </div>
        </ResponsiveFilters>

        {tasksQ.isPending ? (
          <div className="space-y-4">
            <p role="status" className="sr-only">Đang tải công việc…</p>
            <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
              {[0, 1, 2].map(i => <div key={i} className="h-28 rounded-2xl bg-surface-subtle" />)}
            </div>
          </div>
        ) : tasksQ.isError ? (
          <ErrorState message={errMsg(tasksQ.error, 'Không tải được công việc.')} onRetry={() => void tasksQ.refetch()} />
        ) : items.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-small text-ink-muted">
              {filters.done ? 'Chưa có công việc nào được giao cho bạn.' : 'Chưa có công việc nào đang mở được giao cho bạn.'}
            </p>
          </Card>
        ) : sections.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-small text-ink-muted">Không có công việc khớp bộ lọc.{' '}
              <button type="button" className="font-medium text-primary-700 hover:underline"
                onClick={() => updateFilters({ status: null, project: null, priority: null })}>Xóa bộ lọc</button></p>
          </Card>
        ) : (
          sections.map(s => (
            <section key={s.kind} aria-labelledby={`sec-${s.kind}`}>
              <h3 id={`sec-${s.kind}`} className={`text-section font-semibold ${s.kind === 'overdue' ? 'text-danger-700' : 'text-ink'}`}>
                {s.label} <span className="tabular-nums font-normal text-ink-muted">({s.tasks.length})</span>
              </h3>
              <Card className="mt-2 p-0 overflow-hidden">
                <ul className="divide-y divide-line">
                  {s.tasks.map(t => <MyTaskRow key={t.id} task={t} navState={navState} action={quickAction(t)} />)}
                </ul>
              </Card>
            </section>
          ))
        )}

        {helping.length > 0 && (
          <section aria-labelledby="sec-helping">
            <h3 id="sec-helping" className="text-section font-semibold text-ink">
              Bạn đang hỗ trợ <span className="tabular-nums font-normal text-ink-muted">({helping.length})</span>
            </h3>
            <Card className="mt-2 p-0 overflow-hidden">
              <ul className="divide-y divide-line">
                {helping.map(h => (
                  <li key={h.helperRowId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
                    <span className="min-w-0 flex-1 basis-56">
                      <Link to={`/tasks/${h.taskId}`} state={navState}
                        className="font-medium text-primary-700 hover:underline [overflow-wrap:anywhere]">{h.title}</Link>
                      <span className="block text-small text-ink-secondary">{h.projectName} · {h.groupName}</span>
                      <span className="block text-caption text-ink-muted">Phụ trách: {h.assigneeName || 'Chưa giao'}</span>
                      <span className="mt-0.5 block text-small text-ink-secondary line-clamp-2">{h.scope}</span>
                    </span>
                    <span className="flex shrink-0 flex-wrap items-center gap-2">
                      <Badge value={h.status}>{STATUS_LABEL[h.status] ?? h.status}</Badge>
                      <span className="text-small text-ink-muted whitespace-nowrap">
                        {h.deadlineAt ? formatDate(h.deadlineAt) : 'Chưa đặt hạn'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}
      </div>

      {submitTask && (
        <SubmitTaskDialog busy={transitionM.isPending}
          onClose={() => setSubmitTask(null)}
          onSubmit={(note) => transitionM.mutate(
            { task: submitTask, target: 'Submitted', comment: note || undefined },
            { onSuccess: () => setSubmitTask(null) },
          )} />
      )}
    </MainLayout>
  );
}
