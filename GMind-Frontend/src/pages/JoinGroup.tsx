import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';
import '../components/workspace/workspace.css';
import { Breadcrumb } from '../components/workspace/WorkspaceUI';
import { errMsg } from '../components/workspace/utils';
import { groupsService } from '../services/groups';

export default function JoinGroup() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<{ create?: string; join?: string; name?: string; description?: string; code?: string }>({});
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [pending, setPending] = useState<'create' | 'join' | null>(null);
  const pendingRef = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const busy = pending !== null;

  const create = async () => {
    if (pendingRef.current) return;
    const n = name.trim(), d = description.trim();
    const errs: typeof errors = {};
    if (!n) errs.name = 'Nhập tên nhóm.';
    else if (n.length > 200) errs.name = 'Tên nhóm tối đa 200 ký tự.';
    if (d.length > 1000) errs.description = 'Mô tả tối đa 1.000 ký tự.';
    setErrors(x => ({ ...x, name: errs.name, description: errs.description }));
    if (errs.name || errs.description) { (errs.name ? nameRef : descRef).current?.focus(); return; }
    pendingRef.current = true; setPending('create');
    try {
      const g = await groupsService.create(n, d || undefined);
      if (!mounted.current) return;
      navigate(`/groups/${g.id}`, { state: { notice: `Đã tạo nhóm "${g.name}". Bạn là Trưởng nhóm.` } });
    } catch (e: unknown) {
      if (!mounted.current) return;
      setErrors(x => ({ ...x, name: errMsg(e, 'Không tạo được nhóm. Thử lại.') }));
      nameRef.current?.focus();
    } finally { pendingRef.current = false; if (mounted.current) setPending(null); }
  };

  const join = async () => {
    if (pendingRef.current) return;
    const c = code.trim().toUpperCase();
    const errs: typeof errors = {};
    if (!c) errs.code = 'Nhập mã mời.';
    else if (!/^[A-Z0-9]{8}$/.test(c)) errs.code = 'Mã mời gồm đúng 8 ký tự chữ và số.';
    setErrors(x => ({ ...x, code: errs.code }));
    if (errs.code) { codeRef.current?.focus(); return; }
    pendingRef.current = true; setPending('join');
    try {
      const g = await groupsService.join(c);
      if (!mounted.current) return;
      navigate(`/groups/${g.id}`, { state: { notice: `Đã tham gia nhóm "${g.name}". Bạn là Thành viên.` } });
    } catch (e: unknown) {
      if (!mounted.current) return;
      setErrors(x => ({ ...x, code: errMsg(e, 'Mã mời không hợp lệ hoặc đã hết hạn.') }));
      codeRef.current?.focus();
    } finally { pendingRef.current = false; if (mounted.current) setPending(null); }
  };

  return (
    <MainLayout>
      <div className="workspace-surface space-y-6">
        <Breadcrumb items={[{ label: 'Nhóm của tôi', to: '/groups' }, { label: 'Tạo hoặc tham gia' }]} />
        <header>
          <h2 className="text-2xl font-bold text-slate-900">Tạo hoặc tham gia nhóm</h2>
          <p className="mt-2 text-base text-slate-600">Tạo nhóm mới để làm Trưởng nhóm, hoặc nhập mã mời để tham gia với vai trò Thành viên.</p>
        </header>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-slate-900">Tạo nhóm mới</h3>
            <p className="mt-1 text-sm text-slate-600">Bạn sẽ là Trưởng nhóm và quản lý dự án, thành viên.</p>
            <form noValidate className="mt-4 space-y-4" onSubmit={e => { e.preventDefault(); void create(); }}>
              <Input id="create-name" ref={nameRef} label="Tên nhóm" maxLength={200} value={name} disabled={busy}
                error={errors.name} onChange={e => { setName(e.target.value); if (errors.name) setErrors(x => ({ ...x, name: undefined })); }} />
              <div>
                <label htmlFor="create-desc" className="block text-sm font-medium text-slate-700 mb-1">Mô tả (tuỳ chọn)</label>
                <textarea id="create-desc" ref={descRef} rows={3} maxLength={1000} value={description} disabled={busy}
                  aria-invalid={!!errors.description} aria-describedby={errors.description ? 'create-desc-error' : undefined}
                  onChange={e => { setDescription(e.target.value); if (errors.description) setErrors(x => ({ ...x, description: undefined })); }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-base focus:outline-none focus:ring-2" />
                {errors.description && <p id="create-desc-error" role="alert" className="mt-1 text-sm text-danger-700">{errors.description}</p>}
              </div>
              <Button type="submit" className="workspace-primary min-h-11" disabled={busy} isLoading={pending === 'create'}>Tạo nhóm</Button>
            </form>
          </Card>
          <Card className="p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-slate-900">Tham gia bằng mã mời</h3>
            <p className="mt-1 text-sm text-slate-600">Bạn sẽ tham gia với vai trò Thành viên.</p>
            <form noValidate className="mt-4 space-y-4" onSubmit={e => { e.preventDefault(); void join(); }}>
              <Input id="join-code" ref={codeRef} label="Mã mời" maxLength={8} value={code} disabled={busy}
                placeholder="VD: AB12CD34" hint="8 ký tự chữ và số do Trưởng nhóm cung cấp." error={errors.code}
                onChange={e => { setCode(e.target.value.toUpperCase()); if (errors.code) setErrors(x => ({ ...x, code: undefined })); }} />
              <Button type="submit" variant="secondary" className="min-h-11" disabled={busy} isLoading={pending === 'join'}>Tham gia</Button>
            </form>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
