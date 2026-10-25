import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { groupsService } from '../services/groups';
import { authService } from '../services/auth';

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [group, setGroup] = useState<any>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authService.isLoggedIn()) { navigate('/login'); return; }
    groupsService.get(id!)
      .then(setGroup)
      .catch(e => setError(e?.message || 'Không tải được nhóm'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const createInvite = async () => {
    try {
      const inv = await groupsService.createInvite(id!);
      setInviteCode(inv.code);
    } catch (err: any) { setError(err?.message || 'Không tạo được mã mời'); }
  };

  if (loading) return <MainLayout><LoadingSpinner /></MainLayout>;
  if (error || !group) return <MainLayout><p className="text-danger-600">{error || 'Không tìm thấy nhóm'}</p></MainLayout>;

  return (
    <MainLayout>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{group.name}</h1>
          {group.description && <p className="text-neutral-600 dark:text-neutral-400 mt-1">{group.description}</p>}
        </div>
        <Badge variant={group.myRole === 'Leader' ? 'primary' : 'neutral'}>{group.myRole}</Badge>
      </div>

      {group.myRole === 'Leader' && (
        <Card className="mb-6">
          <div className="flex items-center gap-4 flex-wrap">
            <Button onClick={createInvite} variant="secondary">Tạo mã mời</Button>
            {inviteCode && (
              <span className="font-mono text-lg bg-neutral-100 dark:bg-neutral-800 px-3 py-1 rounded-lg">{inviteCode}</span>
            )}
          </div>
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
    </MainLayout>
  );
}
