import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';
import { groupsService } from '../services/groups';

export default function JoinGroup() {
  const navigate = useNavigate();
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState<'create' | 'join' | null>(null);

  const create = async () => {
    if (!groupName.trim()) { setError('Vui lòng nhập tên nhóm'); return; }
    setLoading('create'); setError('');
    try {
      const g = await groupsService.create(groupName, description || undefined);
      navigate(`/groups/${g.id}`);
    } catch (err: any) { setError(err?.message || 'Tạo nhóm thất bại'); }
    finally { setLoading(null); }
  };

  const join = async () => {
    if (!code.trim()) { setError('Vui lòng nhập mã nhóm'); return; }
    setLoading('join'); setError('');
    try {
      const g = await groupsService.join(code);
      navigate(`/groups/${g.id}`);
    } catch (err: any) { setError(err?.message || 'Mã nhóm không hợp lệ'); }
    finally { setLoading(null); }
  };

  return (
    <MainLayout>
      <h1 className="text-3xl font-bold mb-6">Chào mừng đến GMind</h1>
      {error && <p className="mb-4 text-sm text-danger-600">{error}</p>}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <h2 className="text-lg font-semibold mb-4">Tạo nhóm mới</h2>
          <div className="space-y-3">
            <Input label="Tên nhóm" value={groupName} onChange={e => setGroupName(e.target.value)} />
            <Input label="Mô tả (tuỳ chọn)" value={description} onChange={e => setDescription(e.target.value)} />
            <Button onClick={create} isLoading={loading === 'create'}>Tạo nhóm</Button>
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold mb-4">Tham gia bằng mã</h2>
          <div className="space-y-3">
            <Input label="Mã mời" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="VD: AB12CD34" />
            <Button variant="secondary" onClick={join} isLoading={loading === 'join'}>Tham gia</Button>
          </div>
        </Card>
      </div>
    </MainLayout>
  );
}
