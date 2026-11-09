import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import '../components/workspace/workspace.css';
import { Breadcrumb, Skeleton, ErrorState, EmptyState } from '../components/workspace/WorkspaceUI';
import { errMsg, status, initials } from '../components/workspace/utils';
import ConfirmationDialog from '../components/workspace/ConfirmationDialog';
import { groupsService, groupsManage, type InviteDto, type ActivityDto } from '../services/groups';
import { projectsService } from '../services/projects';
import { loadGroupWorkspace } from '../services/workspace';
import { authService } from '../services/auth';
import { formatDate, formatDateTime } from '../utils/presentation';

type Workspace = Awaited<ReturnType<typeof loadGroupWorkspace>>;
type ActionKind = 'invite' | 'revoke' | 'project' | 'edit' | 'member' | 'leave' | null;
const PROJECT_STATUS: Record<string, string> = { NotStarted: 'Chưa bắt đầu', InProgress: 'Đang làm', Completed: 'Hoàn thành', Archived: 'Đã lưu trữ' };
const ROLE_NUM = { Leader: 1, Member: 2 } as const;
const RoleBadge = ({ role }: { role: string }) =>
  <Badge variant={role === 'Leader' ? 'primary' : 'neutral'}>{role === 'Leader' ? 'Trưởng nhóm' : 'Thành viên'}</Badge>;

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const me = authService.currentUser();
  return <MainLayout><GroupWorkspace key={`${id ?? ''}:${me?.id ?? ''}`} id={id ?? ''} userId={me?.id ?? ''} /></MainLayout>;
}

function GroupWorkspace({ id, userId }: { id: string; userId: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const routeNotice = (location.state as { notice?: string } | null)?.notice;
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fatalError, setFatalError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [success, setSuccess] = useState('');
  const [actionErrors, setActionErrors] = useState<Partial<Record<'invite' | 'project' | 'edit' | 'member', string>>>({});
  const [invite, setInvite] = useState<InviteDto | null>(null);
  const [inviteConfirm, setInviteConfirm] = useState(false);
  const [pending, setPending] = useState<ActionKind>(null);
  const [projOpen, setProjOpen] = useState(false);
  const [proj, setProj] = useState({ name: '', description: '', subject: '', deadline: '' });
  const [projErrors, setProjErrors] = useState<{ name?: string; description?: string; subject?: string }>({});
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editError, setEditError] = useState('');
  const [dialog, setDialog] = useState<null | { kind: 'role' | 'remove' | 'leave'; memberId?: string; memberName?: string; toRole?: number }>(null);
  const loadVersion = useRef(0);
  const actionVersion = useRef(0);
  const pendingRef = useRef(false);
  const refreshingRef = useRef(false);
  const projNameRef = useRef<HTMLInputElement>(null);
  const busy = pending !== null || refreshing;

  const clearPrivate = useCallback(() => {
    setWorkspace(null); setInvite(null); setDialog(null); setInviteConfirm(false);
    setProj({ name: '', description: '', subject: '', deadline: '' }); setProjErrors({}); setProjOpen(false);
    setEditOpen(false); setEditName(''); setEditDesc(''); setEditError('');
    setActionErrors({}); setSuccess(''); setRefreshError('');
  }, []);
  const invalidate = useCallback(() => {
    loadVersion.current++; actionVersion.current++;
    pendingRef.current = false; refreshingRef.current = false;
  }, []);

  const fetchWorkspace = useCallback(async (quiet = false) => {
    const version = ++loadVersion.current;
    try {
      const data = await loadGroupWorkspace(id);
      if (version !== loadVersion.current) return;
      setWorkspace(data.group.myRole === 'Leader' ? data : { ...data, progress: null, activity: [] });
      setFatalError('');
    } catch (e: unknown) {
      if (version !== loadVersion.current) return;
      const s = status(e);
      if (s === 403 || s === 404 || !quiet) {
        if (s === 403 || s === 404) clearPrivate(); else setWorkspace(null);
        setFatalError(errMsg(e, 'Không tải được nhóm'));
      } else {
        setRefreshError('Thao tác đã được lưu nhưng chưa tải lại được đầy đủ chi tiết. ' + errMsg(e, ''));
      }
    } finally {
      if (version === loadVersion.current) { setLoading(false); setRefreshing(false); refreshingRef.current = false; }
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
    return () => { cancelled = true; invalidate(); };
  }, [fetchWorkspace, invalidate, navigate]);

  async function mutate<T>(kind: NonNullable<ActionKind>, request: () => Promise<T>, apply: (r: T) => void, notice: string,
    errKey: keyof typeof actionErrors = 'member', reloadAfter = true) {
    if (pendingRef.current || refreshingRef.current) return;
    pendingRef.current = true;
    const action = ++actionVersion.current;
    const version = loadVersion.current;
    setPending(kind); setSuccess(''); setRefreshError(''); setActionErrors(x => ({ ...x, [errKey]: undefined }));
    try {
      const result = await request();
      if (action !== actionVersion.current || version !== loadVersion.current) return;
      apply(result); setSuccess(notice);
      if (reloadAfter) await reload(true);
    } catch (e: unknown) {
      if (action !== actionVersion.current || version !== loadVersion.current) return;
      const s = status(e);
      if (s === 403 || s === 404) {
        loadVersion.current++;
        clearPrivate(); setFatalError(errMsg(e, 'Không thực hiện được thao tác')); setLoading(false);
      } else {
        setActionErrors(x => ({ ...x, [errKey]: errMsg(e, 'Không thực hiện được thao tác') }));
      }
    } finally {
      if (action === actionVersion.current) { pendingRef.current = false; setPending(null); }
    }
  }

  const createInvite = () => mutate('invite', () => groupsService.createInvite(id),
    (inv: InviteDto) => setInvite(inv), 'Đã tạo mã mời.', 'invite');
  const confirmRevoke = () => invite && mutate('revoke', () => groupsManage.revokeInvite(invite.id),
    () => { setInvite(null); setInviteConfirm(false); }, 'Đã thu hồi mã mời.', 'invite');
  const copyCode = async () => {
    if (!invite) return;
    try { await navigator.clipboard.writeText(invite.code); setSuccess('Đã sao chép mã mời.'); }
    catch { setActionErrors(x => ({ ...x, invite: 'Không sao chép được. Hãy chọn và chép mã thủ công.' })); }
  };
  const createProject = () => {
    const errs: typeof projErrors = {};
    const n = proj.name.trim(), d = proj.description.trim(), s = proj.subject.trim();
    if (!n) errs.name = 'Nhập tên dự án.';
    else if (n.length > 200) errs.name = 'Tên dự án tối đa 200 ký tự.';
    if (d.length > 2000) errs.description = 'Mô tả tối đa 2.000 ký tự.';
    if (s.length > 100) errs.subject = 'Môn học tối đa 100 ký tự.';
    setProjErrors(errs);
    if (errs.name || errs.description || errs.subject) { projNameRef.current?.focus(); return; }
    void mutate('project',
      () => projectsService.create(id, n, d || undefined, s || undefined,
        proj.deadline && Number.isFinite(Date.parse(proj.deadline)) ? new Date(`${proj.deadline}T23:59:00+07:00`).toISOString() : undefined),
      (p) => { setWorkspace(w => w ? { ...w, projects: [...w.projects, p] } : w); setProj({ name: '', description: '', subject: '', deadline: '' }); setProjOpen(false); },
      'Đã tạo dự án.', 'project');
  };
  const saveEdit = () => {
    const n = editName.trim();
    if (!n) { setEditError('Nhập tên nhóm.'); return; }
    void mutate('edit', () => groupsManage.update(id, n, editDesc.trim() || undefined),
      (g) => { setWorkspace(w => w ? { ...w, group: { ...w.group, name: g.name, description: g.description } } : w); setEditOpen(false); },
      'Đã cập nhật nhóm.', 'edit');
  };
  const confirmAction = () => {
    if (!dialog) return;
    if (dialog.kind === 'role' && dialog.memberId && dialog.toRole)
      void mutate('member', () => groupsManage.changeRole(id, dialog.memberId!, dialog.toRole!),
        () => {
          setWorkspace(w => w ? {
            ...w,
            group: {
              ...w.group,
              members: w.group.members.map(m => m.userId === dialog.memberId
                ? { ...m, role: dialog.toRole === ROLE_NUM.Leader ? 'Leader' : 'Member' }
                : m),
            },
          } : w);
          setDialog(null);
        }, 'Đã đổi vai trò thành viên.', 'member');
    if (dialog.kind === 'remove' && dialog.memberId)
      void mutate('member', () => groupsManage.removeMember(id, dialog.memberId!),
        () => {
          setWorkspace(w => w ? { ...w, group: { ...w.group, members: w.group.members.filter(m => m.userId !== dialog.memberId) } } : w);
          setDialog(null);
        }, 'Đã xóa thành viên.', 'member');
    if (dialog.kind === 'leave')
      void mutate('leave', () => groupsManage.leave(id),
        () => navigate('/groups'), 'Đã rời nhóm.', 'member', false);
  };

  const group = workspace?.group ?? null;
  const projects = workspace?.projects ?? [];
  const progress = workspace?.progress ?? null;
  const activity = workspace?.activity ?? [];
  const isLeader = group?.myRole === 'Leader';
  const leaderCount = group?.members.filter(m => m.role === 'Leader').length ?? 0;

  return (
    <div className="workspace-surface space-y-6">
      <Breadcrumb items={[{ label: 'Nhóm của tôi', to: '/groups' }, { label: group?.name ?? 'Nhóm' }]} />
      {loading ? <Skeleton label="Đang tải nhóm…" />
        : fatalError || !group ? <ErrorState message={fatalError || 'Không tìm thấy nhóm.'} onRetry={() => void reload(false)} backTo="/groups" backLabel="Về nhóm của tôi" />
        : (
          <>
            <header className="flex flex-wrap items-start justify-between gap-3 min-w-0">
              <div className="min-w-0">
                <h2 className="text-2xl font-bold text-slate-900 [overflow-wrap:anywhere]">{group.name}</h2>
                {group.description && <p className="mt-1 text-base text-slate-600 [overflow-wrap:anywhere] max-w-[65ch]">{group.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <RoleBadge role={group.myRole} />
                  <span className="text-sm text-slate-600">{group.members.length} thành viên</span>
                </div>
              </div>
              <div className="flex flex-col items-start gap-1 sm:items-end">
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Link to={`/groups/${id}/marketplace`} className="min-h-11 inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">Marketplace</Link>
                  {isLeader && <Button variant="secondary" className="min-h-11" disabled={busy}
                    onClick={() => { setEditName(group.name); setEditDesc(group.description ?? ''); setEditError(''); setEditOpen(v => !v); }}>Sửa nhóm</Button>}
                  <Button variant="secondary" className="min-h-11 text-danger-700" disabled={busy || (isLeader && leaderCount <= 1)}
                    onClick={() => setDialog({ kind: 'leave' })}>Rời nhóm</Button>
                </div>
                {isLeader && leaderCount <= 1 && <p className="text-xs text-slate-600 sm:text-right">Bạn là Trưởng nhóm duy nhất — không thể rời hoặc hạ vai trò chính mình.</p>}
              </div>
            </header>
            {routeNotice && <p role="status" className="text-sm font-medium text-success-700">{routeNotice}</p>}
            {refreshing && <p role="status" className="sr-only">Đang tải lại…</p>}
            {refreshError && (
              <div>
                <p role="alert" className="text-sm text-danger-700 [overflow-wrap:anywhere]">{refreshError}</p>
                <Button variant="secondary" className="mt-2 min-h-11" disabled={busy} isLoading={refreshing}
                  onClick={() => { if (!pendingRef.current && !refreshingRef.current) void reload(true); }}>Tải lại</Button>
              </div>
            )}
            {success && <p role="status" className="text-sm font-medium text-success-700">{success}</p>}

            {isLeader && editOpen && (
              <Card className="p-4 sm:p-6">
                <h3 className="font-semibold text-slate-900">Sửa thông tin nhóm</h3>
                <form noValidate className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end" onSubmit={e => { e.preventDefault(); saveEdit(); }}>
                  <Input id="edit-name" label="Tên nhóm" maxLength={200} value={editName} disabled={busy} error={editError}
                    onChange={e => { setEditName(e.target.value); setEditError(''); }} />
                  <Input id="edit-desc" label="Mô tả" maxLength={1000} value={editDesc} disabled={busy} onChange={e => setEditDesc(e.target.value)} />
                  <Button type="submit" className="workspace-primary min-h-11" disabled={busy} isLoading={pending === 'edit'}>Lưu</Button>
                  {actionErrors.edit && <p role="alert" className="sm:col-span-3 text-sm text-danger-700 [overflow-wrap:anywhere]">{actionErrors.edit}</p>}
                </form>
              </Card>
            )}

            <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <section aria-labelledby="projects-h" className="min-w-0 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 id="projects-h" className="text-lg font-semibold text-slate-900">Dự án ({projects.length})</h3>
                  {isLeader && !projOpen && (
                    <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => setProjOpen(true)}>Tạo dự án</Button>
                  )}
                </div>
                {isLeader && projOpen && (
                  <Card className="p-4">
                    <form noValidate className="grid gap-3 sm:grid-cols-2 items-end" onSubmit={e => { e.preventDefault(); createProject(); }}>
                      <Input id="proj-name" ref={projNameRef} label="Tên dự án" maxLength={200} value={proj.name} disabled={busy} error={projErrors.name}
                        onChange={e => { setProj(x => ({ ...x, name: e.target.value })); if (projErrors.name) setProjErrors(x => ({ ...x, name: undefined })); }} />
                      <Input id="proj-subject" label="Môn học (tuỳ chọn)" maxLength={100} value={proj.subject} disabled={busy} error={projErrors.subject}
                        onChange={e => { setProj(x => ({ ...x, subject: e.target.value })); if (projErrors.subject) setProjErrors(x => ({ ...x, subject: undefined })); }} />
                      <Input id="proj-deadline" label="Hạn (giờ Việt Nam, tuỳ chọn)" type="date" value={proj.deadline} disabled={busy}
                        onChange={e => setProj(x => ({ ...x, deadline: e.target.value }))} />
                      <Input id="proj-desc" label="Mô tả (tuỳ chọn)" maxLength={2000} value={proj.description} disabled={busy} error={projErrors.description}
                        onChange={e => { setProj(x => ({ ...x, description: e.target.value })); if (projErrors.description) setProjErrors(x => ({ ...x, description: undefined })); }} />
                      {actionErrors.project && <p role="alert" className="sm:col-span-2 text-sm text-danger-700 [overflow-wrap:anywhere]">{actionErrors.project}</p>}
                      <div className="flex gap-2 sm:col-span-2">
                        <Button type="submit" className="workspace-primary min-h-11" disabled={busy} isLoading={pending === 'project'}>Tạo dự án</Button>
                        <Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={() => setProjOpen(false)}>Hủy</Button>
                      </div>
                    </form>
                  </Card>
                )}
                {projects.length === 0 ? (
                  <Card className="p-4 sm:p-6"><EmptyState title="Chưa có dự án" body={isLeader ? 'Tạo dự án đầu tiên cho nhóm.' : 'Trưởng nhóm sẽ tạo dự án cho nhóm.'} /></Card>
                ) : (
                  <ul className="grid gap-4 md:grid-cols-2">
                    {projects.map(p => (
                      <li key={p.id} className="min-w-0">
                        <Link to={`/projects/${p.id}`} className="group block h-full rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600">
                          <Card className="h-full p-4 transition-colors group-hover:border-primary-300">
                            <div className="flex items-start justify-between gap-2 min-w-0">
                              <h4 className="min-w-0 font-semibold text-slate-900 line-clamp-2 [overflow-wrap:anywhere] group-hover:text-primary-700">{p.name}</h4>
                              <Badge variant="neutral">{PROJECT_STATUS[p.status] ?? p.status}</Badge>
                            </div>
                            {p.subject && <p className="mt-1 text-sm text-slate-600">Môn: {p.subject}</p>}
                            <p className="mt-1 text-sm text-slate-600">{p.completedCount}/{p.taskCount} công việc hoàn thành{p.deadlineAt ? ` · Hạn ${formatDate(p.deadlineAt)}` : ''}</p>
                          </Card>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}

                {isLeader && progress && (
                  <Card className="p-4 sm:p-6">
                    <h3 className="font-semibold text-slate-900">Tiến độ thành viên</h3>
                    <p className="mt-1 text-sm text-slate-600">Tỷ lệ công việc hoàn thành: {progress.completedTasks}/{progress.totalTasks} ({Math.round(progress.percentComplete)}%)</p>
                    <ul className="mt-3 divide-y divide-slate-100">
                      {progress.members.map(m => (
                        <li key={m.userId} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm min-w-0">
                          <span className="font-medium [overflow-wrap:anywhere]">{m.displayName}</span>
                          <span className="text-slate-600">{m.total} tổng · {m.inProgress} đang làm · {m.submitted} chờ duyệt · {m.completed} xong</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
                {isLeader && (
                  <Card className="p-4 sm:p-6">
                    <h3 className="font-semibold text-slate-900">Hoạt động gần đây</h3>
                    {activity.length === 0 ? <p className="mt-2 text-sm text-slate-600">Chưa có hoạt động.</p> : (
                      <ul className="mt-3 divide-y divide-slate-100">
                        {activity.map((a: ActivityDto) => (
                          <li key={a.id} className="py-2 text-sm min-w-0">
                            <span className="font-medium [overflow-wrap:anywhere]">{a.actorName}</span> — <span className="[overflow-wrap:anywhere]">{a.summary}</span>
                            <span className="ml-2 text-xs text-slate-600">{formatDateTime(a.createdAt)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                )}
              </section>

              <aside className="min-w-0 space-y-6">
                <Card className="p-4 sm:p-6">
                  <h3 className="font-semibold text-slate-900">Thành viên ({group.members.length})</h3>
                  <ul className="mt-3 divide-y divide-slate-100">
                    {group.members.map(m => {
                      const isMe = m.userId === userId;
                      const soleLeader = m.role === 'Leader' && leaderCount <= 1;
                      return (
                        <li key={m.userId} className="flex flex-wrap items-center gap-2 py-2.5 min-w-0">
                          <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">{initials(m.displayName)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium [overflow-wrap:anywhere]">{m.displayName}{isMe ? ' (bạn)' : ''}</span>
                            <RoleBadge role={m.role} />
                            {isMe && soleLeader && <span className="mt-0.5 block text-xs text-slate-600">Trưởng nhóm duy nhất — không thể hạ vai trò hoặc rời.</span>}
                          </span>
                          {isLeader && !isMe && (
                            <span className="flex w-full flex-wrap justify-end gap-1.5 pl-10">
                              <Button size="sm" variant="secondary" className="min-h-11" disabled={busy}
                                onClick={() => setDialog({ kind: 'role', memberId: m.userId, memberName: m.displayName, toRole: m.role === 'Leader' ? ROLE_NUM.Member : ROLE_NUM.Leader })}>
                                {m.role === 'Leader' ? 'Hạ vai trò' : 'Làm trưởng nhóm'}
                              </Button>
                              <Button size="sm" variant="secondary" className="min-h-11 text-danger-700" disabled={busy || soleLeader}
                                onClick={() => setDialog({ kind: 'remove', memberId: m.userId, memberName: m.displayName })}>Xóa</Button>
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {isLeader && (
                    <div className="mt-4 border-t border-slate-200 pt-4">
                      <h4 className="text-sm font-semibold text-slate-900">Mã mời</h4>
                      <p className="mt-1 text-xs text-slate-600">Chỉ mã vừa tạo trong phiên này được hiển thị.</p>
                      {invite ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <code className="rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-base tracking-wider">{invite.code}</code>
                          <Button size="sm" variant="secondary" className="min-h-9" onClick={() => void copyCode()}>Sao chép mã</Button>
                          <Button size="sm" variant="secondary" className="min-h-9 text-danger-700" disabled={busy} onClick={() => setInviteConfirm(true)}>Thu hồi</Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="secondary" className="mt-2 min-h-11" disabled={busy} isLoading={pending === 'invite'} onClick={createInvite}>Tạo mã mời</Button>
                      )}
                      {actionErrors.invite && !inviteConfirm && <p role="alert" className="mt-1 text-sm text-danger-700">{actionErrors.invite}</p>}
                    </div>
                  )}
                </Card>
              </aside>
            </div>

            <ConfirmationDialog open={!!dialog} busy={busy} onClose={() => { if (!busy) setDialog(null); }}
              title={dialog?.kind === 'leave' ? 'Rời nhóm' : dialog?.kind === 'remove' ? 'Xóa thành viên' : 'Đổi vai trò'}>
              {dialog?.kind === 'leave' && <p>Bạn sẽ rời nhóm "{group.name}". Công việc được giao cho bạn <b>không</b> được tự động giao lại.</p>}
              {dialog?.kind === 'remove' && <p>Xóa {dialog.memberName} khỏi nhóm? Công việc đã giao cho họ <b>không</b> được tự động giao lại.</p>}
              {dialog?.kind === 'role' && <p>{dialog.toRole === ROLE_NUM.Member ? `Hạ ${dialog.memberName} xuống Thành viên?` : `Nâng ${dialog.memberName} lên Trưởng nhóm?`}</p>}
              {actionErrors.member && <p role="alert" className="mt-3 text-sm text-danger-700 [overflow-wrap:anywhere]">{actionErrors.member}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button className="workspace-primary min-h-11" disabled={busy} isLoading={pending === 'member' || pending === 'leave'} onClick={confirmAction}>Xác nhận</Button>
                <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => setDialog(null)}>Hủy</Button>
              </div>
            </ConfirmationDialog>

            <ConfirmationDialog open={inviteConfirm} busy={busy} onClose={() => { if (!busy) setInviteConfirm(false); }} title="Thu hồi mã mời">
              <p>Thu hồi mã "{invite?.code}"? Người có mã cũ sẽ không tham gia được — cần tạo mã mới nếu đổi ý.</p>
              {actionErrors.invite && <p role="alert" className="mt-3 text-sm text-danger-700 [overflow-wrap:anywhere]">{actionErrors.invite}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" className="min-h-11 text-danger-700" disabled={busy} isLoading={pending === 'revoke'} onClick={confirmRevoke}>Thu hồi</Button>
                <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => setInviteConfirm(false)}>Hủy</Button>
              </div>
            </ConfirmationDialog>
          </>
        )}
    </div>
  );
}
