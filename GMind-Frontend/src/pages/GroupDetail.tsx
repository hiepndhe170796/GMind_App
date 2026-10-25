import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { groupsService, type ActivityDto } from '../services/groups';
import { projectsService, type ProjectDto } from '../services/projects';
import { dashboardService, type GroupProgress } from '../services/dashboard';
import { authService } from '../services/auth';

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [group, setGroup] = useState<any>(null);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [progress, setProgress] = useState<GroupProgress | null>(null);
  const [activity, setActivity] = useState<ActivityDto[]>([]);
  const [inviteCode, setInviteCode] = useState('');
  const [projName, setProjName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reloadProjects = () => projectsService.list(id!).then(setProjects);

  useEffect(() => {
    if (!authService.isLoggedIn()) { navigate('/login'); return; }
    Promise.all([groupsService.get(id!), reloadProjects(), groupsService.activity(id!).then(setActivity)])
      .then(([g]) => {
        setGroup(g);
        if (g.myRole === 'Leader') {
          dashboardService.groupProgress(id!).then(setProgress).catch(() => {});
        }
      })
      .catch(e => setError(e?.message || 'Không tải được nhóm'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const createInvite = async () => {
    try { const inv = await groupsService.createInvite(id!); setInviteCode(inv.code); }
    catch (err: any) { setError(err?.message || 'Không tạo được mã mời'); }
  };

  const createProject = async () => {
    if (!projName.trim()) return;
    try { await projectsService.create(id!, projName); setProjName(''); await reloadProjects(); }
    catch (err: any) { setError(err?.message || 'Không tạo được project'); }
  };

  if (loading) return <MainLayout><LoadingSpinner /></MainLayout>;
  if (error || !group) return <MainLayout><p className="text-danger-600">{error || 'Không tìm thấy nhóm'}</p></MainLayout>;

  const isLeader = group.myRole === 'Leader';

  return (
    <MainLayout>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{group.name}</h1>
          {group.description && <p className="text-neutral-600 dark:text-neutral-400 mt-1">{group.description}</p>}
        </div>
        <Badge variant={isLeader ? 'primary' : 'neutral'}>{group.myRole}</Badge>
      </div>
      {error && <p className="mb-4 text-sm text-danger-600">{error}</p>}

      {isLeader && (
        <Card className="mb-6">
          <div className="flex items-center gap-4 flex-wrap">
            <Button onClick={createInvite} variant="secondary">Tạo mã mời</Button>
            {inviteCode && <span className="font-mono text-lg bg-neutral-100 dark:bg-neutral-800 px-3 py-1 rounded-lg">{inviteCode}</span>}
            <div className="flex items-end gap-2 ml-auto">
              <Input label="Project mới" value={projName} onChange={e => setProjName(e.target.value)} placeholder="Tên project" />
              <Button onClick={createProject}>Tạo</Button>
            </div>
          </div>
        </Card>
      )}

      <h2 className="text-xl font-semibold mb-3">Projects ({projects.length})</h2>
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        {projects.length === 0 && <Card><p className="text-neutral-500">Chưa có project nào.</p></Card>}
        {projects.map(p => (
          <Link key={p.id} to={`/projects/${p.id}`}>
            <Card variant="outlined" className="hover:shadow-md transition-shadow h-full">
              <div className="flex justify-between items-start">
                <h3 className="font-semibold">{p.name}</h3>
                <Badge variant="primary">{p.status}</Badge>
              </div>
              <p className="text-sm text-neutral-500 mt-2">{p.completedCount}/{p.taskCount} tasks hoàn thành</p>
              {p.deadlineAt && <p className="text-sm text-danger-600 mt-1">Hạn: {new Date(p.deadlineAt).toLocaleDateString('vi-VN')}</p>}
            </Card>
          </Link>
        ))}
      </div>

      {isLeader && progress && (
        <Card className="mb-8">
          <h2 className="font-semibold mb-3">Tiến độ thành viên ({progress.percentComplete}%)</h2>
          <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-3 mb-4">
            <div className="bg-primary-600 h-3 rounded-full" style={{ width: `${progress.percentComplete}%` }} />
          </div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-neutral-500">
              <th className="pb-2">Thành viên</th><th className="pb-2">Tổng</th><th className="pb-2">Đang làm</th><th className="pb-2">Chờ duyệt</th><th className="pb-2">Xong</th>
            </tr></thead>
            <tbody>
              {progress.members.map(m => (
                <tr key={m.userId} className="border-t border-neutral-200 dark:border-neutral-700">
                  <td className="py-2">{m.displayName}</td><td>{m.total}</td><td>{m.inProgress}</td><td>{m.submitted}</td><td>{m.completed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold mb-4">Thành viên ({group.members?.length ?? 0})</h2>
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-700">
          {group.members?.map((m: any) => (
            <li key={m.userId} className="py-3 flex items-center justify-between">
              <span>{m.displayName}</span>
              <Badge variant={m.role === 'Leader' ? 'primary' : 'neutral'}>{m.role}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-6">
        <h2 className="font-semibold mb-4">Hoạt động gần đây</h2>
        {activity.length === 0 && <p className="text-sm text-neutral-500">Chưa có hoạt động.</p>}
        <ul className="space-y-2">
          {activity.map(a => (
            <li key={a.id} className="text-sm border-l-2 border-neutral-300 pl-3">
              <b>{a.actorName}</b> — {a.summary}
              <span className="text-neutral-400 text-xs ml-2">{new Date(a.createdAt).toLocaleString('vi-VN')}</span>
            </li>
          ))}
        </ul>
      </Card>
    </MainLayout>
  );
}
