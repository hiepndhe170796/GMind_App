import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import ResponsiveFilters from '../components/ui/ResponsiveFilters';
import { Breadcrumb, Skeleton, ErrorState, EmptyState } from '../components/workspace/WorkspaceUI';
import { errMsg, status } from '../components/workspace/utils';
import ConfirmationDialog from '../components/workspace/ConfirmationDialog';
import { marketplaceService, type MarketplaceDto, type SwapCandidateDto } from '../services/marketplace';
import { groupsService } from '../services/groups';
import { dashboardService } from '../services/dashboard';
import { qk } from '../services/query-keys';
import { useToast } from '../components/ui/Toast';
import { useCurrentUserId } from '../hooks/use-current-user-id';
import { formatDate, formatDateTime } from '../utils/presentation';

const TYPE_LABEL: Record<string, string> = { NeedHelp: 'Cần hỗ trợ', Transfer: 'Chuyển giao', Swap: 'Hoán đổi' };
const TYPE_NUM: Record<string, number> = { NeedHelp: 1, Transfer: 2, Swap: 3 };
const STATUS_VN: Record<string, string> = {
  Open: 'Đang mở', AwaitingRecipient: 'Chờ người nhận', Pending: 'Chờ duyệt',
  Approved: 'Đã duyệt', Rejected: 'Bị từ chối', Declined: 'Người nhận từ chối', Cancelled: 'Đã hủy',
};
const STATUS_TONE: Record<string, 'primary' | 'warning' | 'accent' | 'success' | 'danger' | 'neutral'> = {
  Open: 'primary', AwaitingRecipient: 'warning', Pending: 'accent',
  Approved: 'success', Rejected: 'danger', Declined: 'neutral', Cancelled: 'neutral',
};
const TABS = [
  { id: 'action', label: 'Cần bạn xử lý' },
  { id: 'open', label: 'Đang mở' },
  { id: 'mine', label: 'Của tôi' },
  { id: 'all', label: 'Tất cả' },
] as const;
const PAGE = 10;

const stepState = (s: string): { step: number; label: string; ended?: boolean } => {
  switch (s) {
    case 'Open': return { step: 2, label: 'chờ thành viên nhận' };
    case 'AwaitingRecipient': return { step: 2, label: 'chờ người nhận' };
    case 'Pending': return { step: 3, label: 'chờ Trưởng nhóm duyệt' };
    case 'Approved': return { step: 3, label: 'đã duyệt' };
    case 'Rejected': return { step: 3, label: 'bị từ chối', ended: true };
    case 'Declined': return { step: 2, label: 'người nhận từ chối', ended: true };
    default: return { step: 2, label: 'đã hủy', ended: true };
  }
};

export default function Marketplace() {
  const { groupId } = useParams<{ groupId: string }>();
  const me = useCurrentUserId();
  return <MainLayout><MarketplaceWorkspace key={`${groupId ?? ''}:${me ?? ''}`} groupId={groupId ?? ''} userId={me} /></MainLayout>;
}

function MarketplaceWorkspace({ groupId, userId }: { groupId: string; userId: string | null }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const type = params.get('type') ?? '';
  const statusF = params.get('status') ?? '';
  const q = params.get('q') ?? '';
  const [show, setShow] = useState(PAGE);

  const groupQ = useQuery({
    queryKey: qk.group(userId ?? '', groupId), queryFn: () => groupsService.get(groupId),
    enabled: !!userId && !!groupId, retry: (n, e) => status(e) !== 403 && status(e) !== 404 && n < 1,
  });
  const reqsQ = useQuery({
    queryKey: qk.marketplace(userId ?? '', groupId), queryFn: () => marketplaceService.list(groupId),
    enabled: !!userId && !!groupId, retry: (n, e) => status(e) !== 403 && status(e) !== 404 && n < 1,
  });
  const requests = useMemo(() => reqsQ.data ?? [], [reqsQ.data]);
  const isLeader = groupQ.data?.myRole === 'Leader';
  const members = useMemo(() => (groupQ.data?.members ?? []).filter(m => m.userId !== userId), [groupQ.data, userId]);

  const counts = useMemo(() => ({
    action: requests.filter(r => r.canRespond || r.canReview || r.canClaim).length,
    open: requests.filter(r => r.status === 'Open').length,
    mine: requests.filter(r => r.requestedByUserId === userId || r.targetUserId === userId).length,
    all: requests.length,
  }), [requests, userId]);
  const tab = tabParam && TABS.some(t => t.id === tabParam) ? tabParam : (counts.action > 0 ? 'action' : 'all');
  const setParam = (k: string, v: string) => setParams(prev => {
    const n = new URLSearchParams(prev);
    if (v) n.set(k, v); else n.delete(k);
    return n;
  }, { replace: true });
  const changeTab = (t: string) => { setShow(PAGE); setParam('tab', t === 'all' && counts.action === 0 ? '' : t); };
  const changeFilter = (k: string, v: string) => { setShow(PAGE); setParam(k, v); };

  const filtered = useMemo(() => {
    let rs = requests;
    if (tab === 'action') rs = rs.filter(r => r.canRespond || r.canReview || r.canClaim);
    else if (tab === 'open') rs = rs.filter(r => r.status === 'Open');
    else if (tab === 'mine') rs = rs.filter(r => r.requestedByUserId === userId || r.targetUserId === userId);
    if (type) rs = rs.filter(r => r.requestType === type);
    if (statusF) rs = rs.filter(r => r.status === statusF);
    if (q) { const s = q.toLowerCase(); rs = rs.filter(r => `${r.taskTitle} ${r.requestedByName} ${r.targetName ?? ''} ${r.reason}`.toLowerCase().includes(s)); }
    return rs;
  }, [requests, tab, type, statusF, q, userId]);
  const visible = filtered.slice(0, show);
  const filterCount = [type, statusF, q].filter(Boolean).length;

  const invalidate = (taskIds: string[] = []) => {
    void qc.invalidateQueries({ queryKey: qk.marketplace(userId ?? '', groupId) });
    void qc.invalidateQueries({ queryKey: qk.marketplaceIncoming(userId ?? '') });
    void qc.invalidateQueries({ queryKey: qk.leaderQueue(userId ?? '') });
    void qc.invalidateQueries({ queryKey: qk.myTasks(userId ?? '') });
    void qc.invalidateQueries({ queryKey: qk.helping(userId ?? '') });
    for (const t of taskIds) {
      void qc.invalidateQueries({ queryKey: qk.task(userId ?? '', t) });
      void qc.invalidateQueries({ queryKey: qk.taskHelpers(userId ?? '', t) });
    }
  };
  const failed = (e: unknown) => {
    if (status(e) === 409) { toast.error(errMsg(e, 'Yêu cầu đã thay đổi. Tải lại danh sách.')); void reqsQ.refetch(); }
    else toast.error(errMsg(e, 'Không thực hiện được thao tác.'));
  };

  type Dialog = null |
    { kind: 'decline'; req: MarketplaceDto } | { kind: 'claim'; req: MarketplaceDto } |
    { kind: 'approve'; req: MarketplaceDto } | { kind: 'reject'; req: MarketplaceDto } |
    { kind: 'cancel'; req: MarketplaceDto };
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogComment, setDialogComment] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const openDialog = (d: NonNullable<Dialog>) => { setDialogComment(''); setDialogError(''); setDialog(d); };
  const act = useMutation({
    mutationFn: async (d: NonNullable<Dialog>) => {
      const c = dialogComment.trim() || undefined;
      switch (d.kind) {
        case 'decline': return marketplaceService.respond(d.req.id, false, c);
        case 'claim': return marketplaceService.claim(d.req.id, c);
        case 'approve': return marketplaceService.approve(d.req.id, c);
        case 'reject': return marketplaceService.reject(d.req.id, dialogComment.trim());
        case 'cancel': return marketplaceService.cancel(d.req.id);
      }
    },
    onSuccess: (_r, d) => {
      const msg = d.kind === 'decline' ? 'Đã từ chối yêu cầu.' : d.kind === 'claim' ? 'Đã gửi nhận việc.' :
        d.kind === 'approve' ? 'Đã duyệt yêu cầu.' : d.kind === 'reject' ? 'Đã từ chối yêu cầu.' : 'Đã hủy yêu cầu.';
      toast.success(msg); setDialog(null);
      invalidate([d.req.taskId, ...(d.req.relatedTaskId ? [d.req.relatedTaskId] : [])]);
    },
    onError: e => { const s = status(e); if (s === 409) { setDialog(null); failed(e); } else setDialogError(errMsg(e, 'Không thực hiện được thao tác.')); },
  });
  const respondAccept = useMutation({
    mutationFn: (req: MarketplaceDto) => marketplaceService.respond(req.id, true),
    onSuccess: (_r, req) => { toast.success('Đã đồng ý yêu cầu.'); invalidate([req.taskId, ...(req.relatedTaskId ? [req.relatedTaskId] : [])]); },
    onError: failed,
  });

  const submitDialog = () => {
    if (!dialog) return;
    if (dialog.kind === 'reject' && !dialogComment.trim()) { setDialogError('Nhập lý do từ chối.'); return; }
    if (dialogComment.trim().length > 1000) { setDialogError('Bình luận tối đa 1.000 ký tự.'); return; }
    setDialogError(''); act.mutate(dialog);
  };

  const dialogTitle = dialog?.kind === 'decline' ? 'Từ chối yêu cầu' : dialog?.kind === 'claim' ? 'Nhận việc'
    : dialog?.kind === 'approve' ? 'Duyệt yêu cầu' : dialog?.kind === 'reject' ? 'Từ chối yêu cầu' : 'Hủy yêu cầu';
  const dialogBody = dialog ? (
    dialog.kind === 'decline' ? <p>Bạn có thể ghi chú lý do (tuỳ chọn). Người gửi sẽ được thông báo.</p>
      : dialog.kind === 'claim' ? <p>{dialog.req.requestType === 'Transfer'
          ? 'Bạn sẽ trở thành người phụ trách sau khi Trưởng nhóm duyệt.'
          : 'Bạn sẽ trở thành người hỗ trợ sau khi Trưởng nhóm duyệt.'}</p>
        : dialog.kind === 'approve' ? <p>{dialog.req.requestType === 'Transfer'
            ? `"${dialog.req.taskTitle}" sẽ chuyển cho ${dialog.req.targetName ?? 'người nhận'}.`
            : dialog.req.requestType === 'Swap'
              ? 'Hai công việc sẽ được hoán đổi.'
              : `${dialog.req.targetName ?? 'Người nhận'} sẽ được thêm làm người hỗ trợ.`}</p>
          : dialog.kind === 'reject' ? <p>Nhập lý do từ chối — bắt buộc.</p>
            : <p>Hủy yêu cầu này? Thao tác không hoàn tác được.</p>
  ) : null;

  return (
    <div className="space-y-6">
      <Breadcrumb hideCurrentBelowSm items={[{ label: 'Nhóm của tôi', to: '/groups' }, { label: groupQ.data?.name ?? 'Nhóm', to: `/groups/${groupId}` }, { label: 'Marketplace' }]} />
      {reqsQ.isPending || groupQ.isPending ? <Skeleton label="Đang tải marketplace…" />
        : reqsQ.isError || groupQ.isError || !groupQ.data ? (
          <ErrorState message={status(reqsQ.error ?? groupQ.error) === 403 ? 'Bạn không có quyền xem marketplace của nhóm này.' : errMsg(reqsQ.error ?? groupQ.error, 'Không tải được marketplace.')}
            onRetry={status(reqsQ.error ?? groupQ.error) === 403 || status(reqsQ.error ?? groupQ.error) === 404 ? undefined : () => { void reqsQ.refetch(); void groupQ.refetch(); }}
            backTo={`/groups/${groupId}`} backLabel="Về nhóm" />
        ) : (
          <>
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-title font-semibold text-ink">Marketplace</h2>
                <p className="mt-2 text-base text-ink-secondary">Nhờ hỗ trợ, chuyển giao hoặc hoán đổi công việc trong nhóm.</p>
              </div>
              <Button className="min-h-11 gap-1.5" onClick={() => setCreateOpen(true)}>
                <Icon name="plus" size={16} />Tạo yêu cầu
              </Button>
            </header>
            <ol className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface-subtle px-4 py-3 text-sm text-ink-secondary sm:flex-row sm:items-center sm:gap-4" aria-label="Quy trình">
              {[ 'Gửi yêu cầu', 'Người nhận đồng ý hoặc một thành viên nhận việc', 'Trưởng nhóm duyệt' ].map((label, i) => (
                <li key={label} className="flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent-50 text-caption font-semibold text-accent-700">{i + 1}</span>
                  {label}
                </li>
              ))}
              <li className="sm:ml-auto text-xs text-ink-muted">Người phụ trách chỉ thay đổi sau bước 3.</li>
            </ol>

            <div role="group" aria-label="Lọc theo nhóm yêu cầu"
              className="flex flex-nowrap gap-1 overflow-x-auto whitespace-nowrap rounded-xl border border-line bg-surface-subtle p-1 sm:flex-wrap">
              {TABS.map(t => (
                <button key={t.id} type="button" onClick={() => changeTab(t.id)} aria-pressed={tab === t.id}
                  className={`min-h-9 rounded-lg px-3 text-sm font-medium ${tab === t.id ? 'bg-surface text-ink shadow-sm' : 'text-ink-secondary hover:text-ink'}`}>
                  {t.label} ({counts[t.id]})
                </button>
              ))}
            </div>

            <ResponsiveFilters activeCount={filterCount} search={
              <div>
                <label htmlFor="mp-q" className="block text-sm font-medium text-ink-secondary mb-1">Tìm yêu cầu</label>
                <input id="mp-q" type="search" value={q} onChange={e => changeFilter('q', e.target.value)}
                  placeholder="Tên việc, người gửi, lý do"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary-600" />
              </div>
            }>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label htmlFor="mp-type" className="block text-sm font-medium text-ink-secondary mb-1">Loại</label>
                  <select id="mp-type" value={type} onChange={e => changeFilter('type', e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary-600">
                    <option value="">Tất cả loại</option>
                    {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="mp-status" className="block text-sm font-medium text-ink-secondary mb-1">Trạng thái</label>
                  <select id="mp-status" value={statusF} onChange={e => changeFilter('status', e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary-600">
                    <option value="">Tất cả trạng thái</option>
                    {Object.entries(STATUS_VN).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  {filterCount > 0 && (
                    <button type="button" className="min-h-9 text-sm font-medium text-primary-700 hover:underline"
                      onClick={() => { setShow(PAGE); setParams(new URLSearchParams(tabParam ? { tab: tabParam } : {}), { replace: true }); }}>
                      Xóa bộ lọc
                    </button>
                  )}
                </div>
              </div>
            </ResponsiveFilters>

            {filtered.length === 0 ? (
              <Card className="p-4 sm:p-6">
                <EmptyState illustration="search" title={requests.length === 0 ? 'Chưa có yêu cầu nào.' : 'Không có yêu cầu phù hợp.'}
                  body={requests.length === 0 ? 'Tạo yêu cầu đầu tiên để nhờ hỗ trợ, chuyển giao hoặc hoán đổi công việc.' : 'Thử nới bộ lọc hoặc đổi nhóm yêu cầu.'} />
              </Card>
            ) : (
              <ul className="space-y-4">
                {visible.map(r => (
                  <li key={r.id} className="min-w-0">
                    <RequestCard r={r} isLeader={isLeader}
                      onRespondAccept={() => respondAccept.mutate(r)}
                      onOpen={kind => openDialog({ kind, req: r })} busy={act.isPending || respondAccept.isPending} />
                  </li>
                ))}
              </ul>
            )}
            {filtered.length > show && (
              <div className="flex justify-center">
                <Button variant="secondary" className="min-h-11" onClick={() => setShow(s => s + PAGE)}>Hiện thêm</Button>
              </div>
            )}
          </>
        )}

      <ConfirmationDialog open={!!dialog} busy={act.isPending} onClose={() => { if (!act.isPending) setDialog(null); }} title={dialogTitle}>
        {dialogBody}
        {dialog && dialog.kind !== 'cancel' && (
          <div className="mt-3">
            <label htmlFor="mp-comment" className="block text-sm font-medium text-ink-secondary mb-1">
              {dialog.kind === 'reject' ? 'Lý do' : 'Bình luận (tuỳ chọn)'}
            </label>
            <textarea id="mp-comment" rows={2} maxLength={1000} value={dialogComment} disabled={act.isPending}
              onChange={e => { setDialogComment(e.target.value); if (dialogError) setDialogError(''); }}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary-600" />
          </div>
        )}
        {dialogError && <p role="alert" className="mt-2 text-sm text-danger-700">{dialogError}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant={dialog?.kind === 'reject' || dialog?.kind === 'cancel' ? 'danger' : 'primary'}
            className="min-h-11" disabled={act.isPending} isLoading={act.isPending} onClick={submitDialog}>
            {dialog?.kind === 'decline' ? 'Từ chối' : dialog?.kind === 'claim' ? 'Nhận việc' : dialog?.kind === 'approve' ? 'Duyệt' : dialog?.kind === 'reject' ? 'Từ chối' : 'Hủy yêu cầu'}
          </Button>
          <Button variant="secondary" className="min-h-11" disabled={act.isPending} onClick={() => setDialog(null)}>Đóng</Button>
        </div>
      </ConfirmationDialog>

      {(createOpen || !!TYPE_NUM[params.get('new') ?? '']) && (
        <CreateRequestDialog groupId={groupId} userId={userId} members={members}
          deepType={params.get('new')} deepTask={params.get('task')}
          onClose={() => { setCreateOpen(false); setParams(prev => { const n = new URLSearchParams(prev); n.delete('new'); n.delete('task'); return n; }, { replace: true }); }}
          onCreated={tid => { setCreateOpen(false); setParams(prev => { const n = new URLSearchParams(prev); n.delete('new'); n.delete('task'); return n; }, { replace: true }); toast.success('Đã tạo yêu cầu.'); invalidate([tid ?? '']); }} />
      )}
    </div>
  );
}

function RequestCard({ r, isLeader, onRespondAccept, onOpen, busy }: {
  r: MarketplaceDto; isLeader: boolean;
  onRespondAccept: () => void; onOpen: (kind: 'decline' | 'claim' | 'approve' | 'reject' | 'cancel') => void; busy: boolean;
}) {
  const st = stepState(r.status);
  const doneStep = r.status === 'Approved' ? 3 : st.step - 1;
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant="accent">{TYPE_LABEL[r.requestType] ?? r.requestType}</Badge>
          <Badge variant={STATUS_TONE[r.status] ?? 'neutral'}>{STATUS_VN[r.status] ?? r.status}</Badge>
        </div>
        <span className="text-xs text-ink-muted">{formatDateTime(r.createdAt)}{r.reviewedAt ? ` · Duyệt ${formatDateTime(r.reviewedAt)}` : ''}</span>
      </div>
      <h3 className="mt-2 min-w-0 text-base font-semibold text-ink">
        <Link to={`/tasks/${r.taskId}`} className="text-primary-700 hover:underline [overflow-wrap:anywhere]">{r.taskTitle}</Link>
        {r.requestType === 'Swap' && r.relatedTaskTitle && (
          <span className="text-ink-secondary"> ⇄ <Link to={`/tasks/${r.relatedTaskId}`} className="text-primary-700 hover:underline">{r.relatedTaskTitle}</Link></span>
        )}
      </h3>
      <p className="mt-0.5 text-sm text-ink-secondary">
        {[r.projectName, r.groupName, r.taskDeadlineAt ? `Hạn ${formatDate(r.taskDeadlineAt)}` : null].filter(Boolean).join(' · ')}
      </p>
      <p className="mt-2 text-sm text-ink">
        {r.requestedByName} → {r.targetName ?? 'Chưa có người nhận'}
      </p>
      {r.reason && <p className="mt-1.5 text-sm text-ink-secondary [overflow-wrap:anywhere]">{r.reason}</p>}
      {r.helpScope && <p className="mt-1 text-sm text-ink-secondary [overflow-wrap:anywhere]"><span className="font-medium text-ink">Phần cần hỗ trợ:</span> {r.helpScope}</p>}

      <ol className="mt-3 flex items-center gap-2" aria-label={`Bước ${Math.min(st.step, 3)}/3: ${st.label}`}>
        {['Gửi', 'Người nhận', 'Trưởng nhóm'].map((label, i) => {
          const n = i + 1;
          const cls = n <= doneStep ? 'bg-accent-600 text-white' : n === st.step && !st.ended ? 'border-2 border-accent-600 text-accent-700' : 'border border-line text-ink-muted';
          return (
            <li key={label} className="flex items-center gap-2">
              {i > 0 && <span className="h-px w-4 bg-line" aria-hidden />}
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${cls}`}>{n}</span>
              <span className={`text-xs ${n === st.step && !st.ended ? 'font-medium text-ink' : 'text-ink-muted'}`}>{label}</span>
            </li>
          );
        })}
      </ol>

      {isLeader && (r.requesterOpenTasks != null || r.targetOpenTasks != null) && (
        <p className="mt-2 text-xs text-ink-muted">
          Việc đang mở: {r.requestedByName} {r.requesterOpenTasks ?? 0} việc{r.targetName != null ? ` · ${r.targetName} ${r.targetOpenTasks ?? 0} việc` : ''}
        </p>
      )}
      {r.recipientComment && <p className="mt-1.5 text-sm text-ink-secondary">Phản hồi của {r.targetName ?? 'người nhận'}: {r.recipientComment}</p>}
      {r.reviewComment && <p className="mt-1 text-sm text-ink-secondary">Trưởng nhóm: {r.reviewComment}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {r.canRespond && (
          <>
            <Button size="sm" className="min-h-9" disabled={busy} onClick={onRespondAccept}>Đồng ý</Button>
            <Button size="sm" variant="secondary" className="min-h-9" disabled={busy} onClick={() => onOpen('decline')}>Từ chối</Button>
          </>
        )}
        {r.canClaim && <Button size="sm" variant="secondary" className="min-h-9 border-accent-300 text-accent-700" disabled={busy} onClick={() => onOpen('claim')}>Nhận việc</Button>}
        {r.canReview && <Button size="sm" className="min-h-9" disabled={busy} onClick={() => onOpen('approve')}>Duyệt</Button>}
        {r.canReject && <Button size="sm" variant="danger" className="min-h-9" disabled={busy} onClick={() => onOpen('reject')}>Từ chối</Button>}
        {r.canCancel && <Button size="sm" variant="secondary" className="min-h-9" disabled={busy} onClick={() => onOpen('cancel')}>Hủy yêu cầu</Button>}
        {r.status === 'Pending' && isLeader && !r.canReview && (
          <span className="text-xs text-ink-muted">Cần Trưởng nhóm khác duyệt</span>
        )}
      </div>
    </Card>
  );
}

const TYPE_CARDS: { id: string; title: string; desc: string }[] = [
  { id: 'NeedHelp', title: 'Cần hỗ trợ', desc: 'Bạn vẫn phụ trách, nhờ thêm một người cùng làm.' },
  { id: 'Transfer', title: 'Chuyển giao', desc: 'Giao công việc cho người khác hoặc đăng để thành viên tự nhận.' },
  { id: 'Swap', title: 'Hoán đổi', desc: 'Đổi công việc của bạn lấy một công việc của thành viên khác.' },
];

function CreateRequestDialog({ groupId, userId, members, deepType, deepTask, onClose, onCreated }: {
  groupId: string; userId: string | null; members: { userId: string; displayName: string }[];
  deepType: string | null; deepTask: string | null;
  onClose: () => void; onCreated: (taskId?: string) => void;
}) {
  const toast = useToast();
  const [type, setType] = useState(TYPE_NUM[deepType ?? ''] ? deepType! : 'NeedHelp');
  const [taskId, setTaskId] = useState(deepTask ?? '');
  const [target, setTarget] = useState('');
  const [related, setRelated] = useState('');
  const [scope, setScope] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const myTasksQ = useQuery({
    queryKey: qk.myTasks(userId ?? ''), queryFn: () => dashboardService.myTasks(),
    enabled: !!userId,
  });
  const eligible = useMemo(() => (myTasksQ.data ?? [])
    .filter(t => t.groupId === groupId && !t.parentTaskId && t.status !== 'Completed'), [myTasksQ.data, groupId]);
  const swapsQ = useQuery({
    queryKey: qk.swapCandidates(userId ?? '', groupId, target),
    queryFn: () => marketplaceService.swapCandidates(groupId, target),
    enabled: type === 'Swap' && !!target,
  });

  const outcome = () => {
    if (type === 'Swap') {
      const m = members.find(x => x.userId === target);
      const t = (swapsQ.data ?? []).find(x => x.id === related);
      return m && t ? `Yêu cầu sẽ chờ ${m.displayName} đồng ý, sau đó Trưởng nhóm duyệt.` : '';
    }
    const m = members.find(x => x.userId === target);
    return m
      ? `Yêu cầu sẽ chờ ${m.displayName} đồng ý, sau đó Trưởng nhóm duyệt.`
      : 'Yêu cầu sẽ được đăng để thành viên tự nhận, sau đó Trưởng nhóm duyệt.';
  };

  const createM = useMutation({
    mutationFn: () => marketplaceService.create(groupId, {
      requestType: TYPE_NUM[type], taskId, reason: reason.trim(),
      targetUserId: target || undefined,
      relatedTaskId: type === 'Swap' ? related || undefined : undefined,
      helpScope: type === 'NeedHelp' ? scope.trim() : null,
    }),
    onSuccess: r => onCreated(r.taskId),
    onError: e => {
      if (status(e) === 409) { toast.error(errMsg(e, 'Yêu cầu đã tồn tại hoặc đã thay đổi.')); onClose(); }
      else setErrors(x => ({ ...x, form: errMsg(e, 'Không tạo được yêu cầu.') }));
    },
  });

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!taskId) errs.taskId = 'Chọn công việc.';
    if (type === 'NeedHelp') {
      if (!scope.trim()) errs.scope = 'Nhập phần cần hỗ trợ.';
      else if (scope.trim().length > 500) errs.scope = 'Tối đa 500 ký tự.';
    }
    if (type === 'Swap') {
      if (!target) errs.target = 'Chọn thành viên.';
      else if (!related) errs.related = 'Chọn công việc để hoán đổi.';
    }
    if (!reason.trim()) errs.reason = 'Nhập lý do.';
    else if (reason.trim().length > 1000) errs.reason = 'Tối đa 1.000 ký tự.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    createM.mutate();
  };

  return (
    <ConfirmationDialog open busy={createM.isPending} onClose={onClose} title="Tạo yêu cầu" size="lg">
      <form noValidate className="space-y-4" onSubmit={e => { e.preventDefault(); submit(); }}>
        <fieldset>
          <legend className="text-sm font-medium text-ink-secondary">Loại yêu cầu</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {TYPE_CARDS.map(c => (
              <label key={c.id} className={`flex min-h-11 cursor-pointer flex-col gap-0.5 rounded-xl border p-3 text-left transition-colors
                ${type === c.id ? 'border-accent-600 bg-accent-50' : 'border-line hover:border-line-strong'}`}>
                <span className="flex items-center gap-2 text-sm font-semibold text-ink whitespace-nowrap">
                  <input type="radio" name="mp-type" checked={type === c.id} onChange={() => setType(c.id)} className="h-4 w-4 accent-accent-600" />
                  {c.title}
                </span>
                <span className="text-xs text-ink-secondary">{c.desc}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="cr-task" className="block text-sm font-medium text-ink-secondary mb-1">Công việc của bạn</label>
          {myTasksQ.isPending ? <p className="text-sm text-ink-secondary">Đang tải công việc…</p>
            : eligible.length === 0 ? <p className="text-sm text-ink-secondary">Bạn chưa có công việc nào có thể tạo yêu cầu.</p>
              : (
                <select id="cr-task" value={taskId} onChange={e => { setTaskId(e.target.value); if (errors.taskId) setErrors(x => ({ ...x, taskId: '' })); }}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary-600">
                  <option value="">Chọn công việc</option>
                  {eligible.map(t => (
                    <option key={t.id} value={t.id}>{t.title} · {t.projectName} · {t.deadlineAt ? `hạn ${formatDate(t.deadlineAt)}` : 'chưa đặt hạn'}</option>
                  ))}
                </select>
              )}
          {errors.taskId && <p role="alert" className="mt-1 text-sm text-danger-700">{errors.taskId}</p>}
        </div>

        {type === 'NeedHelp' && (
          <div>
            <label htmlFor="cr-scope" className="block text-sm font-medium text-ink-secondary mb-1">Phần cần hỗ trợ</label>
            <textarea id="cr-scope" rows={2} maxLength={500} value={scope} disabled={createM.isPending}
              aria-invalid={!!errors.scope}
              onChange={e => { setScope(e.target.value); if (errors.scope) setErrors(x => ({ ...x, scope: '' })); }}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary-600" />
            {errors.scope && <p role="alert" className="mt-1 text-sm text-danger-700">{errors.scope}</p>}
          </div>
        )}

        {type !== 'Swap' ? (
          <div>
            <label htmlFor="cr-target" className="block text-sm font-medium text-ink-secondary mb-1">
              {type === 'NeedHelp' ? 'Người hỗ trợ' : 'Người nhận'}
            </label>
            <select id="cr-target" value={target} onChange={e => setTarget(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary-600">
              <option value="">Đăng để thành viên tự nhận</option>
              {members.map(m => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
            </select>
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="cr-member" className="block text-sm font-medium text-ink-secondary mb-1">Thành viên</label>
              <select id="cr-member" value={target} onChange={e => { setTarget(e.target.value); setRelated(''); if (errors.target) setErrors(x => ({ ...x, target: '' })); }}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary-600">
                <option value="">Chọn thành viên</option>
                {members.map(m => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
              </select>
              {errors.target && <p role="alert" className="mt-1 text-sm text-danger-700">{errors.target}</p>}
            </div>
            <div>
              <label htmlFor="cr-related" className="block text-sm font-medium text-ink-secondary mb-1">Công việc của họ</label>
              {!target ? <p className="text-sm text-ink-secondary">Chọn thành viên trước.</p>
                : swapsQ.isPending ? <p className="text-sm text-ink-secondary">Đang tải…</p>
                  : (swapsQ.data ?? []).length === 0 ? <p className="text-sm text-ink-secondary">Thành viên này chưa có công việc nào để hoán đổi.</p>
                    : (
                      <select id="cr-related" value={related} onChange={e => { setRelated(e.target.value); if (errors.related) setErrors(x => ({ ...x, related: '' })); }}
                        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary-600">
                        <option value="">Chọn công việc</option>
                        {(swapsQ.data ?? []).map((t: SwapCandidateDto) => (
                          <option key={t.id} value={t.id}>{t.title} · {t.projectName} · {t.deadlineAt ? `hạn ${formatDate(t.deadlineAt)}` : 'chưa đặt hạn'}</option>
                        ))}
                      </select>
                    )}
              {errors.related && <p role="alert" className="mt-1 text-sm text-danger-700">{errors.related}</p>}
            </div>
          </>
        )}

        <div>
          <label htmlFor="cr-reason" className="block text-sm font-medium text-ink-secondary mb-1">Lý do</label>
          <textarea id="cr-reason" rows={2} maxLength={1000} value={reason} disabled={createM.isPending}
            aria-invalid={!!errors.reason}
            onChange={e => { setReason(e.target.value); if (errors.reason) setErrors(x => ({ ...x, reason: '' })); }}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary-600" />
          {errors.reason && <p role="alert" className="mt-1 text-sm text-danger-700">{errors.reason}</p>}
        </div>

        {outcome() && <p className="text-sm text-ink-secondary">{outcome()}</p>}
        {errors.form && <p role="alert" className="text-sm text-danger-700">{errors.form}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="min-h-11" disabled={createM.isPending} isLoading={createM.isPending}>Gửi yêu cầu</Button>
          <Button type="button" variant="secondary" className="min-h-11" disabled={createM.isPending} onClick={onClose}>Hủy</Button>
        </div>
      </form>
    </ConfirmationDialog>
  );
}
