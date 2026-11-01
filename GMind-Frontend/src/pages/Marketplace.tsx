import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { marketplaceService, type MarketplaceDto } from '../services/marketplace';
import { groupsService, type GroupMemberDto } from '../services/groups';
import { projectsService } from '../services/projects';
import { tasksService, type TaskSummaryDto } from '../services/tasks';
import { authService } from '../services/auth';

const TYPE_LABEL: Record<string, string> = { NeedHelp: 'Cần hỗ trợ', Transfer: 'Chuyển giao', Swap: 'Đổi task' };

export default function Marketplace() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const me = authService.currentUser();
  const [requests, setRequests] = useState<MarketplaceDto[]>([]);
  const [myTasks, setMyTasks] = useState<TaskSummaryDto[]>([]);
  const [members, setMembers] = useState<GroupMemberDto[]>([]);
  const [myRole, setMyRole] = useState('Member');
  const [form, setForm] = useState({ type: 1, taskId: '', targetUserId: '', reason: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accessDenied, setAccessDenied] = useState(false);

  const handleError = (e: unknown, fallback: string) => {
    const failure = e as { status?: number; message?: string };
    if (failure?.status === 403 || failure?.status === 404) {
      setRequests([]); setMyTasks([]); setMembers([]); setMyRole('Member');
      setForm({ type: 1, taskId: '', targetUserId: '', reason: '' }); setAccessDenied(true);
    }
    setError(failure?.message || fallback);
  };

  const reload = () => marketplaceService.list(groupId!).then(setRequests);

  useEffect(() => {
    if (!authService.isLoggedIn()) { navigate('/login'); return; }
    groupsService.get(groupId!)
      .then(async g => {
        setMembers(g.members); setMyRole(g.myRole);
        const projects = await projectsService.list(groupId!);
        const allTasks: TaskSummaryDto[] = [];
        for (const p of projects) allTasks.push(...await tasksService.list(p.id));
        setMyTasks(allTasks.filter(t => t.assigneeUserId === me?.id && t.status !== 'Completed'));
        await reload();
      })
      .catch(e => handleError(e, 'Lỗi tải dữ liệu'))
      .finally(() => setLoading(false));
  }, [groupId, navigate]);

  const create = async () => {
    if (!form.taskId || !form.reason.trim()) { setError('Chọn task và nhập lý do'); return; }
    setError('');
    try {
      await marketplaceService.create(groupId!, {
        requestType: form.type, taskId: form.taskId,
        targetUserId: form.targetUserId || undefined, reason: form.reason,
      });
      setForm({ type: 1, taskId: '', targetUserId: '', reason: '' });
      await reload();
    } catch (e: any) { handleError(e, 'Tạo yêu cầu thất bại'); }
  };

  const review = async (id: string, approve: boolean) => {
    try {
      if (approve) {
        await marketplaceService.approve(id);
      } else {
        const comment = prompt('Lý do từ chối (bắt buộc):') ?? '';
        if (!comment.trim()) return;
        await marketplaceService.reject(id, comment);
      }
      await reload();
    } catch (e: any) { handleError(e, 'Thao tác thất bại'); }
  };

  const cancel = async (id: string) => {
    try { await marketplaceService.cancel(id); await reload(); }
    catch (e: any) { handleError(e, 'Hủy thất bại'); }
  };

  if (loading) return <MainLayout><LoadingSpinner /></MainLayout>;
  if (accessDenied) return (
    <MainLayout>
      <p role="alert" className="text-sm text-danger-600">{error || 'Bạn không có quyền truy cập marketplace của nhóm này.'}</p>
      <Link to="/dashboard" className="text-sm text-primary-600 hover:underline">Về trang tổng quan</Link>
    </MainLayout>
  );
  const isLeader = myRole === 'Leader';

  return (
    <MainLayout>
      <h1 className="text-3xl font-bold mb-6">Marketplace</h1>
      {error && <p className="mb-4 text-sm text-danger-600">{error}</p>}

      <Card className="mb-6">
        <h2 className="font-semibold mb-3">Tạo yêu cầu</h2>
        <div className="flex flex-wrap gap-2 items-end">
          <select className="border rounded-lg px-3 py-2 text-sm dark:bg-neutral-900" value={form.type} onChange={e => setForm({ ...form, type: +e.target.value })}>
            <option value={1}>Cần hỗ trợ</option>
            <option value={2}>Chuyển giao</option>
            <option value={3}>Đổi task</option>
          </select>
          <select className="border rounded-lg px-3 py-2 text-sm dark:bg-neutral-900" value={form.taskId} onChange={e => setForm({ ...form, taskId: e.target.value })}>
            <option value="">Task của bạn...</option>
            {myTasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          {(form.type === 2 || form.type === 3) && (
            <select className="border rounded-lg px-3 py-2 text-sm dark:bg-neutral-900" value={form.targetUserId} onChange={e => setForm({ ...form, targetUserId: e.target.value })}>
              <option value="">Thành viên...</option>
              {members.filter(m => m.userId !== me?.id).map(m => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
            </select>
          )}
          <input className="border rounded-lg px-3 py-2 text-sm dark:bg-neutral-900 flex-1 min-w-40" placeholder="Lý do..." value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
          <Button onClick={create}>Gửi</Button>
        </div>
        {form.type === 3 && <p className="text-xs text-neutral-500 mt-2">Swap: chọn task của bạn + thành viên mục tiêu (hệ thống dùng task đầu tiên của họ — chi tiết chọn task đối phương sẽ bổ sung).</p>}
      </Card>

      <div className="space-y-3">
        {requests.length === 0 && <Card><p className="text-neutral-500">Chưa có yêu cầu nào.</p></Card>}
        {requests.map(r => (
          <Card key={r.id} variant="outlined">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">{TYPE_LABEL[r.requestType] ?? r.requestType} — <span className="text-primary-600">{r.taskTitle}</span></p>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">{r.reason}</p>
                <p className="text-xs text-neutral-400 mt-1">
                  {r.requestedByName}{r.targetName && ` → ${r.targetName}`} · {new Date(r.createdAt).toLocaleString('vi-VN')}
                  {r.reviewComment && ` · Nhận xét: ${r.reviewComment}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={r.status === 'Approved' ? 'success' : r.status === 'Rejected' ? 'danger' : 'warning'}>{r.status}</Badge>
                {r.status === 'Pending' && isLeader && <>
                  <Button size="sm" variant="success" onClick={() => review(r.id, true)}>Duyệt</Button>
                  <Button size="sm" variant="danger" onClick={() => review(r.id, false)}>Từ chối</Button>
                </>}
                {r.status === 'Pending' && r.requestedByName === me?.displayName && (
                  <Button size="sm" variant="ghost" onClick={() => cancel(r.id)}>Hủy</Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </MainLayout>
  );
}
