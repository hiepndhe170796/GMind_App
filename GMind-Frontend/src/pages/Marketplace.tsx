import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import '../components/workspace/workspace.css';
import { Breadcrumb, Skeleton, ErrorState, EmptyState } from '../components/workspace/WorkspaceUI';
import { errMsg, status } from '../components/workspace/utils';
import ConfirmationDialog from '../components/workspace/ConfirmationDialog';
import { marketplaceService, type MarketplaceDto } from '../services/marketplace';
import { groupsService, type GroupMemberDto } from '../services/groups';
import { projectsService, type ProjectDto } from '../services/projects';
import { tasksService, type TaskSummaryDto } from '../services/tasks';
import { authService } from '../services/auth';
import { formatDate, formatDateTime } from '../utils/presentation';

const TYPE_LABEL: Record<string, string> = { NeedHelp: 'Cần hỗ trợ', Transfer: 'Chuyển giao', Swap: 'Đổi task' };
const STATUS_VN: Record<string, string> = { Pending: 'Chờ duyệt', Approved: 'Đã duyệt', Rejected: 'Từ chối', Cancelled: 'Đã hủy' };
const PAGE = 8;

export default function Marketplace() {
  const { groupId } = useParams<{ groupId: string }>();
  const me = authService.currentUser();
  return <MainLayout><MarketplaceWorkspace key={`${groupId ?? ''}:${me?.id ?? ''}`} groupId={groupId ?? ''} userId={me?.id ?? ''} /></MainLayout>;
}

function MarketplaceWorkspace({ groupId, userId }: { groupId: string; userId: string }) {
  const navigate = useNavigate();
  const [group, setGroup] = useState<{ name: string; myRole: string } | null>(null);
  const [members, setMembers] = useState<GroupMemberDto[]>([]);
  const [requests, setRequests] = useState<MarketplaceDto[]>([]);
  const [allTasks, setAllTasks] = useState<{ task: TaskSummaryDto; project: ProjectDto }[]>([]);
  const [tasksError, setTasksError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fatalError, setFatalError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [success, setSuccess] = useState('');
  const [actionError, setActionError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ type: 1, taskId: '', targetUserId: '', relatedTaskId: '', reason: '' });
  const [formError, setFormError] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | { kind: 'reject' | 'cancel' | 'approve'; req: MarketplaceDto }>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [page, setPage] = useState(1);
  const loadVersion = useRef(0);
  const actionVersion = useRef(0);
  const pendingRef = useRef(false);
  const refreshingRef = useRef(false);
  const busy = pending !== null || refreshing;
  const rejectRef = useRef<HTMLTextAreaElement>(null);

  const clearPrivate = useCallback(() => {
    setGroup(null); setMembers([]); setRequests([]); setAllTasks([]);
    setForm({ type: 1, taskId: '', targetUserId: '', relatedTaskId: '', reason: '' });
    setFormOpen(false); setDialog(null); setActionError(''); setSuccess(''); setRefreshError('');
  }, []);
  const invalidate = useCallback(() => {
    loadVersion.current++; actionVersion.current++; pendingRef.current = false; refreshingRef.current = false;
  }, []);

  const fetchAll = useCallback(async (quiet = false) => {
    const version = ++loadVersion.current;
    try {
      const [g, reqs] = await Promise.all([groupsService.get(groupId), marketplaceService.list(groupId)]);
      if (version !== loadVersion.current) return;
      setGroup({ name: g.name, myRole: g.myRole });
      setMembers(g.members); setRequests(reqs);
      if (!quiet || allTasks.length === 0) {
        try {
          const projects = await projectsService.list(groupId);
          const lists = await Promise.all(projects.map(async p => ({ p, ts: await tasksService.list(p.id) })));
          if (version !== loadVersion.current) return;
          setAllTasks(lists.flatMap(({ p, ts }) => ts.map(t => ({ task: t, project: p }))));
          setTasksError('');
        } catch (e: unknown) {
          if (status(e) === 403 || status(e) === 404) throw e;
          setTasksError(errMsg(e, 'Chưa tải được danh sách công việc để tạo yêu cầu.'));
        }
      }
      setFatalError('');
    } catch (e: unknown) {
      if (version !== loadVersion.current) return;
      const s = status(e);
      if (s === 403 || s === 404) { clearPrivate(); setFatalError(errMsg(e, 'Không tải được marketplace')); }
      else if (!quiet) { setRequests([]); setFatalError(errMsg(e, 'Không tải được marketplace')); }
      else setRefreshError('Thao tác đã được lưu nhưng chưa tải lại được đầy đủ chi tiết. ' + errMsg(e, ''));
    } finally {
      if (version === loadVersion.current) { setLoading(false); setRefreshing(false); refreshingRef.current = false; }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, clearPrivate]);

  const reload = useCallback((quiet = false) => {
    if (!quiet) { setLoading(true); setRequests([]); setFatalError(''); setSuccess(''); }
    setRefreshError('');
    if (quiet) { refreshingRef.current = true; setRefreshing(true); }
    return fetchAll(quiet);
  }, [fetchAll]);

  useEffect(() => {
    if (!authService.isLoggedIn()) { navigate('/login'); return; }
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) return fetchAll(false); });
    return () => { cancelled = true; invalidate(); };
  }, [fetchAll, invalidate, navigate]);

  async function mutate<T>(kind: string, request: () => Promise<T>, apply: (r: T) => void, notice: string, errTarget: 'form' | 'action' | 'reject' = 'action', reloadAfter = true) {
    if (pendingRef.current || refreshingRef.current) return;
    pendingRef.current = true;
    const action = ++actionVersion.current;
    const version = loadVersion.current;
    setPending(kind); setSuccess(''); setRefreshError(''); setActionError(''); setFormError('');
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
      } else if (errTarget === 'form') setFormError(errMsg(e, 'Không tạo được yêu cầu'));
      else if (errTarget === 'reject') setRejectError(errMsg(e, 'Không thực hiện được thao tác'));
      else setActionError(errMsg(e, 'Không thực hiện được thao tác'));
    } finally {
      if (action === actionVersion.current) { pendingRef.current = false; setPending(null); }
    }
  }

  const myTasks = allTasks.filter(x => x.task.assigneeUserId === userId && x.task.status !== 'Completed');
  const targetTasks = allTasks.filter(x => x.task.assigneeUserId === form.targetUserId && x.task.status !== 'Completed');
  const taskLabel = (x: { task: TaskSummaryDto; project: ProjectDto }) =>
    `${x.task.title} · ${x.project.name}${x.task.deadlineAt ? ` · hạn ${formatDate(x.task.deadlineAt)}` : ''}`;

  const create = () => {
    const f = form;
    if (!f.taskId) { setFormError('Chọn công việc của bạn.'); return; }
    if ((f.type === 2 || f.type === 3) && !f.targetUserId) { setFormError('Chọn thành viên nhận.'); return; }
    if (f.type === 3 && !f.relatedTaskId) { setFormError('Chọn công việc của thành viên để đổi.'); return; }
    if (!f.reason.trim() || f.reason.trim().length > 1000) { setFormError('Nhập lý do tối đa 1.000 ký tự.'); return; }
    void mutate('create', () => marketplaceService.create(groupId, {
      requestType: f.type, taskId: f.taskId,
      targetUserId: f.targetUserId || undefined,
      relatedTaskId: f.type === 3 ? f.relatedTaskId : undefined,
      reason: f.reason.trim(),
    }), () => {
      setForm({ type: 1, taskId: '', targetUserId: '', relatedTaskId: '', reason: '' }); setFormOpen(false);
    }, form.type === 1 ? 'Đã gửi yêu cầu hỗ trợ — chờ Leader duyệt.' : 'Đã gửi yêu cầu. Chỉ thay đổi người phụ trách sau khi Leader duyệt.', 'form');
  };

  const approve = () => dialog && mutate(`a-${dialog.req.id}`, () => marketplaceService.approve(dialog.req.id),
    (u) => { setRequests(rs => rs.map(x => x.id === u.id ? { ...x, ...u } : x)); setDialog(null); setAllTasks([]); },
    'Đã duyệt yêu cầu.', 'action');
  const confirmReject = () => {
    const note = rejectNote.trim();
    if (!note) { setRejectError('Nhập lý do từ chối.'); rejectRef.current?.focus(); return; }
    if (note.length > 1000) { setRejectError('Lý do tối đa 1.000 ký tự.'); rejectRef.current?.focus(); return; }
    void mutate(`r-${dialog!.req.id}`, () => marketplaceService.reject(dialog!.req.id, note),
      (u) => { setRequests(rs => rs.map(x => x.id === u.id ? { ...x, ...u } : x)); setDialog(null); setRejectNote(''); setRejectError(''); },
      'Đã từ chối yêu cầu.', 'reject');
  };
  const confirmCancel = () => mutate(`c-${dialog!.req.id}`, () => marketplaceService.cancel(dialog!.req.id),
    () => { setRequests(rs => rs.filter(x => x.id !== dialog!.req.id)); setDialog(null); }, 'Đã hủy yêu cầu.');

  const filtered = useMemo(() => requests.filter(r => {
    if (scope === 'mine' && r.requestedByUserId !== userId) return false;
    if (typeFilter && r.requestType !== typeFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    const s = search.trim().toLowerCase();
    if (s && !`${r.taskTitle} ${r.requestedByName} ${r.reason}`.toLowerCase().includes(s)) return false;
    return true;
  }), [requests, scope, typeFilter, statusFilter, search, userId]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
  const curPage = Math.min(page, pageCount);
  if (curPage !== page) setPage(curPage);
  const pageItems = filtered.slice((curPage - 1) * PAGE, curPage * PAGE);
  const isLeader = group?.myRole === 'Leader';

  const taskLinkOf = () => ({ navigationSection: '/groups' });

  return (
    <div className="workspace-surface space-y-6">
      {loading ? <Skeleton label="Đang tải marketplace…" />
        : fatalError || !group ? <ErrorState message={fatalError || 'Không tải được marketplace.'} onRetry={() => void reload(false)} backTo="/groups" backLabel="Về nhóm của tôi" />
        : (
          <>
            <Breadcrumb items={[{ label: 'Nhóm của tôi', to: '/groups' }, { label: group.name, to: `/groups/${groupId}` }, { label: 'Marketplace' }]} />
            <header className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-2xl font-bold text-slate-900">Marketplace</h2>
                <p className="mt-2 text-base text-slate-600">Yêu cầu hỗ trợ, chuyển giao hoặc đổi công việc — chỉ có hiệu lực sau khi Leader duyệt.</p>
              </div>
              <Button className="workspace-primary min-h-11" disabled={busy || !!tasksError} onClick={() => setFormOpen(v => !v)}>
                {formOpen ? 'Đóng biểu mẫu' : 'Tạo yêu cầu'}
              </Button>
            </header>
            {tasksError && (
              <div>
                <p role="alert" className="text-sm text-danger-700">{tasksError} Không thể tạo yêu cầu nhưng vẫn xem được danh sách.</p>
                <Button variant="secondary" className="mt-2 min-h-11" disabled={busy} onClick={() => { setAllTasks([]); void reload(true); }}>Thử lại</Button>
              </div>
            )}
            {refreshError && (
              <div><p role="alert" className="text-sm text-danger-700 [overflow-wrap:anywhere]">{refreshError}</p>
                <Button variant="secondary" className="mt-2 min-h-11" disabled={busy} isLoading={refreshing}
                  onClick={() => { if (!pendingRef.current && !refreshingRef.current) void reload(true); }}>Tải lại</Button></div>
            )}
            {success && <p role="status" className="text-sm font-medium text-success-700">{success}</p>}
            {actionError && <p role="alert" className="text-sm text-danger-700 [overflow-wrap:anywhere]">{actionError}</p>}

            <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <section aria-label="Danh sách yêu cầu" className={`order-2 min-w-0 space-y-4 xl:order-1 xl:row-start-1 ${formOpen ? 'xl:col-start-1' : 'xl:col-span-2'}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <form role="search" className="flex items-end gap-2 min-w-0 w-full sm:flex-1 sm:max-w-sm" onSubmit={e => { e.preventDefault(); setSearch(q.trim()); setPage(1); }}>
                    <div className="min-w-0 flex-1">
                      <label htmlFor="mk-q" className="block text-sm font-medium text-slate-700 mb-1">Tìm yêu cầu</label>
                      <input id="mk-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Công việc, người yêu cầu, lý do"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2" />
                    </div>
                    <Button type="submit" variant="secondary" className="min-h-11">Tìm</Button>
                  </form>
                  <select aria-label="Lọc loại" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
                    className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <option value="">Mọi loại</option>
                    <option value="NeedHelp">Cần hỗ trợ</option><option value="Transfer">Chuyển giao</option><option value="Swap">Đổi task</option>
                  </select>
                  <select aria-label="Lọc trạng thái" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                    className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <option value="">Mọi trạng thái</option>
                    <option value="Pending">Chờ duyệt</option><option value="Approved">Đã duyệt</option>
                    <option value="Rejected">Từ chối</option><option value="Cancelled">Đã hủy</option>
                  </select>
                  {(search || typeFilter || statusFilter || scope === 'mine') && (
                    <button type="button" className="min-h-9 text-primary-700 font-medium hover:underline"
                      onClick={() => { setQ(''); setSearch(''); setTypeFilter(''); setStatusFilter(''); setScope('all'); setPage(1); }}>Xóa bộ lọc</button>
                  )}
                  <div role="group" aria-label="Phạm vi" className="flex gap-0 rounded-xl border border-slate-200 overflow-hidden">
                    {([['all', 'Tất cả'], ['mine', 'Của tôi']] as const).map(([v, l]) => (
                      <button key={v} type="button" aria-pressed={scope === v} onClick={() => { setScope(v); setPage(1); }}
                        className={`min-h-11 px-3 text-sm font-medium ${scope === v ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-50'}`}>{l}</button>
                    ))}
                  </div>
                </div>
                <p role="status" aria-live="polite" className="text-sm text-slate-600">
                  {filtered.length ? `${filtered.length} yêu cầu` : '0 yêu cầu phù hợp'} · hiển thị tối đa 100 yêu cầu gần nhất
                </p>
                {pageItems.length === 0 ? (
                  <Card className="p-4 sm:p-6"><EmptyState title="Không có yêu cầu nào" body={requests.length === 0 ? 'Chưa có yêu cầu nào trong nhóm.' : 'Thử đổi bộ lọc.'} /></Card>
                ) : (
                  <ul className="space-y-3">
                    {pageItems.map(r => (
                      <li key={r.id}>
                        <Card className="p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3 min-w-0">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="neutral">{TYPE_LABEL[r.requestType] ?? r.requestType}</Badge>
                                <Badge variant={r.status === 'Rejected' || r.status === 'Cancelled' ? 'danger' : r.status === 'Approved' ? 'success' : 'warning'}>{STATUS_VN[r.status] ?? r.status}</Badge>
                              </div>
                              <p className="mt-2 min-w-0 font-medium text-slate-900 [overflow-wrap:anywhere]">
                                <Link to={`/tasks/${r.taskId}`} state={taskLinkOf()} className="text-primary-700 hover:underline">{r.taskTitle}</Link>
                                {r.relatedTaskTitle && <> ⇄ <span className="[overflow-wrap:anywhere]">{r.relatedTaskTitle}</span></>}
                              </p>
                              <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap [overflow-wrap:anywhere]">{r.reason}</p>
                              <p className="mt-1 text-xs text-slate-600 [overflow-wrap:anywhere]">
                                {r.requestedByName}{r.targetName ? ` → ${r.targetName}` : ''} · {formatDateTime(r.createdAt)}
                                {r.reviewedAt ? ` · duyệt ${formatDateTime(r.reviewedAt)}` : ''}
                                {r.reviewComment ? ` · Nhận xét: ${r.reviewComment}` : ''}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                              {r.status === 'Pending' && isLeader && (
                                <>
                                  <Button size="sm" className="workspace-primary min-h-9" disabled={busy} onClick={() => setDialog({ kind: 'approve', req: r })}>Duyệt</Button>
                                  <Button size="sm" variant="secondary" className="min-h-9 text-danger-700" disabled={busy}
                                    onClick={() => { setDialog({ kind: 'reject', req: r }); setRejectNote(''); setRejectError(''); }}>Từ chối</Button>
                                </>
                              )}
                              {r.status === 'Pending' && r.requestedByUserId === userId && (
                                <Button size="sm" variant="secondary" className="min-h-9" disabled={busy}
                                  onClick={() => setDialog({ kind: 'cancel', req: r })}>Hủy yêu cầu</Button>
                              )}
                            </div>
                          </div>
                        </Card>
                      </li>
                    ))}
                  </ul>
                )}
                {pageCount > 1 && (
                  <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                    <Button variant="secondary" size="sm" aria-label="Trang trước" className="min-h-11" disabled={curPage <= 1} onClick={() => setPage(p => p - 1)}>Trang trước</Button>
                    <span className="text-sm text-slate-600 whitespace-nowrap">Trang {curPage} / {pageCount}</span>
                    <Button variant="secondary" size="sm" aria-label="Trang sau" className="min-h-11" disabled={curPage >= pageCount} onClick={() => setPage(p => p + 1)}>Trang sau</Button>
                  </div>
                )}
              </section>

              {formOpen && (
                <aside aria-label="Tạo yêu cầu" className="order-1 min-w-0 xl:order-2 xl:col-start-2 xl:row-start-1">
                  <Card className="p-4 sm:p-6">
                    <h3 className="font-semibold text-slate-900">Tạo yêu cầu</h3>
                    <form noValidate className="mt-3 space-y-3" onSubmit={e => { e.preventDefault(); create(); }}>
                      <div>
                        <label htmlFor="mk-type" className="block text-sm font-medium text-slate-700 mb-1">Loại yêu cầu</label>
                        <select id="mk-type" value={form.type} disabled={busy}
                          onChange={e => setForm(f => ({ ...f, type: +e.target.value, targetUserId: +e.target.value === 1 ? '' : f.targetUserId, relatedTaskId: '' }))}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <option value={1}>Cần hỗ trợ</option><option value={2}>Chuyển giao</option><option value={3}>Đổi task</option>
                        </select>
                        <p className="mt-1 text-xs text-slate-600">
                          {form.type === 1 ? 'Xin Leader duyệt hỗ trợ trên công việc của bạn (không tự đổi người phụ trách).'
                            : 'Chỉ thay đổi người phụ trách sau khi Leader duyệt.'}
                        </p>
                      </div>
                      <div>
                        <label htmlFor="mk-task" className="block text-sm font-medium text-slate-700 mb-1">Công việc của bạn</label>
                        <select id="mk-task" value={form.taskId} disabled={busy} onChange={e => setForm(f => ({ ...f, taskId: e.target.value }))}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <option value="">Chọn công việc…</option>
                          {myTasks.map(x => <option key={x.task.id} value={x.task.id}>{taskLabel(x)}</option>)}
                        </select>
                      </div>
                      {(form.type === 2 || form.type === 3) && (
                        <div>
                          <label htmlFor="mk-target" className="block text-sm font-medium text-slate-700 mb-1">Thành viên nhận</label>
                          <select id="mk-target" value={form.targetUserId} disabled={busy}
                            onChange={e => setForm(f => ({ ...f, targetUserId: e.target.value, relatedTaskId: '' }))}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <option value="">Chọn thành viên…</option>
                            {members.filter(m => m.userId !== userId).map(m => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
                          </select>
                        </div>
                      )}
                      {form.type === 3 && (
                        <div>
                          <label htmlFor="mk-related" className="block text-sm font-medium text-slate-700 mb-1">Công việc của thành viên để đổi</label>
                          <select id="mk-related" value={form.relatedTaskId} disabled={busy || !form.targetUserId}
                            onChange={e => setForm(f => ({ ...f, relatedTaskId: e.target.value }))}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <option value="">{form.targetUserId ? 'Chọn công việc…' : 'Chọn thành viên trước'}</option>
                            {targetTasks.map(x => <option key={x.task.id} value={x.task.id}>{taskLabel(x)}</option>)}
                          </select>
                        </div>
                      )}
                      <div>
                        <label htmlFor="mk-reason" className="block text-sm font-medium text-slate-700 mb-1">Lý do</label>
                        <textarea id="mk-reason" rows={3} maxLength={1000} value={form.reason} disabled={busy}
                          aria-invalid={!!formError} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-base focus:outline-none focus:ring-2" />
                        <p className="mt-1 text-xs text-slate-600">Bắt buộc, tối đa 1.000 ký tự.</p>
                      </div>
                      {formError && <p role="alert" className="text-sm text-danger-700 [overflow-wrap:anywhere]">{formError}</p>}
                      <Button type="submit" className="workspace-primary min-h-11 w-full" disabled={busy || !!tasksError || myTasks.length === 0} isLoading={pending === 'create'}>Gửi yêu cầu</Button>
                    </form>
                  </Card>
                </aside>
              )}
            </div>

            <ConfirmationDialog open={!!dialog} busy={busy}
              onClose={() => { if (!busy) { setDialog(null); setRejectError(''); } }}
              title={dialog?.kind === 'reject' ? 'Từ chối yêu cầu' : dialog?.kind === 'approve' ? 'Duyệt yêu cầu' : 'Hủy yêu cầu'}>
              {dialog?.kind === 'reject' && (
                <>
                  <p>Từ chối yêu cầu "{dialog.req.taskTitle}" của {dialog.req.requestedByName}? Công việc giữ nguyên người phụ trách.</p>
                  <label htmlFor="reject-note" className="mt-3 block text-sm font-medium text-slate-700">Lý do từ chối</label>
                  <textarea id="reject-note" ref={rejectRef} rows={3} maxLength={1000} value={rejectNote} disabled={busy}
                    aria-invalid={!!rejectError} aria-describedby={rejectError ? 'reject-note-error' : undefined}
                    onChange={e => { setRejectNote(e.target.value); setRejectError(''); }}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-base focus:outline-none focus:ring-2" />
                  {rejectError && <p id="reject-note-error" role="alert" className="mt-1 text-sm text-danger-700">{rejectError}</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="secondary" className="min-h-11 text-danger-700" disabled={busy} isLoading={pending?.startsWith('r-')} onClick={confirmReject}>Từ chối</Button>
                    <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => setDialog(null)}>Đóng</Button>
                  </div>
                </>
              )}
              {dialog?.kind === 'approve' && (
                <>
                  {dialog.req.requestType === 'NeedHelp'
                    ? <p>Duyệt yêu cầu hỗ trợ "{dialog.req.taskTitle}" của {dialog.req.requestedByName}? Chỉ ghi nhận phê duyệt — người phụ trách giữ nguyên.</p>
                    : dialog.req.requestType === 'Transfer'
                      ? <p>Duyệt chuyển giao "{dialog.req.taskTitle}" của {dialog.req.requestedByName} cho {dialog.req.targetName}?</p>
                      : <p>Duyệt đổi "{dialog.req.taskTitle}" của {dialog.req.requestedByName} với "{dialog.req.relatedTaskTitle}" của {dialog.req.targetName}?</p>}
                  {actionError && <p role="alert" className="mt-3 text-sm text-danger-700 [overflow-wrap:anywhere]">{actionError}</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button className="workspace-primary min-h-11" disabled={busy} isLoading={pending?.startsWith('a-')} onClick={approve}>Duyệt</Button>
                    <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => setDialog(null)}>Đóng</Button>
                  </div>
                </>
              )}
              {dialog?.kind === 'cancel' && (
                <>
                  <p>Hủy yêu cầu "{dialog.req.taskTitle}"? Hệ thống sẽ xóa yêu cầu đang chờ này.</p>
                  {actionError && <p role="alert" className="mt-3 text-sm text-danger-700 [overflow-wrap:anywhere]">{actionError}</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="secondary" className="min-h-11 text-danger-700" disabled={busy} isLoading={pending?.startsWith('c-')} onClick={confirmCancel}>Hủy yêu cầu</Button>
                    <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => setDialog(null)}>Đóng</Button>
                  </div>
                </>
              )}
            </ConfirmationDialog>
          </>
        )}
    </div>
  );
}
