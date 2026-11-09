import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import AccountLayout from '../components/account/AccountLayout';
import UserAvatar from '../components/account/UserAvatar';
import { authService } from '../services/auth';
import { getSessionSnapshot, subscribeSession, type SessionRecord } from '../services/session';
import { accountError, isSafeAvatarUrl } from '../utils/account-form';

type Errors = { displayName?: string; avatarUrl?: string };

function ProfileForm({ session }: { session: SessionRecord }) {
  const me = session.user;
  const [name, setName] = useState(me.displayName);
  const [url, setUrl] = useState(me.avatarUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const busyRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = () => mounted.current && getSessionSnapshot()?.id === session.id;
  const dirty = name !== me.displayName || url !== (me.avatarUrl ?? '');

  const edit = (field: keyof Errors, value: string) => {
    (field === 'displayName' ? setName : setUrl)(value);
    setErrors(prev => ({ ...prev, [field]: undefined }));
    setError(''); setOk('');
  };

  const save = async () => {
    if (busyRef.current || !current() || !dirty) return;
    const trimmed = name.trim(), trimmedUrl = url.trim();
    const invalid: Errors = {};
    if (!trimmed) invalid.displayName = 'Nhập tên hiển thị của bạn.';
    else if (trimmed.length > 100) invalid.displayName = 'Tên hiển thị tối đa 100 ký tự.';
    if (trimmedUrl && !isSafeAvatarUrl(trimmedUrl)) invalid.avatarUrl = 'Nhập URL ảnh http(s) hợp lệ, không chứa tài khoản/mật khẩu, tối đa 500 ký tự.';
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      document.getElementById(invalid.displayName ? 'displayName' : 'avatarUrl')?.focus();
      return;
    }
    busyRef.current = true; setBusy(true); setError(''); setOk('');
    try {
      const saved = await authService.updateProfile(trimmed, trimmedUrl || null);
      if (!current()) return;
      setName(saved.displayName); setUrl(saved.avatarUrl ?? '');
      setOk('Đã lưu hồ sơ.');
    } catch (e) {
      if (current()) setError(accountError(e, 'Chưa lưu được hồ sơ. Thông tin bạn nhập vẫn được giữ; hãy thử lại.'));
    } finally {
      busyRef.current = false;
      if (current()) setBusy(false);
    }
  };

  return (
    <>
        <div className="flex items-center gap-4 border-b border-slate-100 p-5 sm:p-6">
          <UserAvatar name={me.displayName} url={me.avatarUrl} size={64} />
          <div className="min-w-0">
            <h3 className="break-words text-lg font-semibold text-slate-900 [overflow-wrap:anywhere]">{me.displayName}</h3>
            <p className="mt-1 break-words text-sm text-slate-600 [overflow-wrap:anywhere]">{me.email}</p>
            <p className="mt-1 text-xs text-slate-600">Email đăng nhập · Chỉ xem</p>
          </div>
        </div>
        <form noValidate aria-busy={busy} className="space-y-5 p-5 sm:p-6" onSubmit={e => { e.preventDefault(); void save(); }}>
          {error && <p role="alert" className="rounded-xl bg-danger-50 px-4 py-2 text-sm text-danger-700">{error}</p>}
          {ok && <p role="status" className="rounded-xl bg-success-50 px-4 py-2 text-sm text-success-700">{ok}</p>}
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            <Input id="displayName" name="displayName" autoComplete="name" label="Tên hiển thị" required
              value={name} onChange={e => edit('displayName', e.target.value)} maxLength={100} error={errors.displayName}
              hint="Tên hiển thị với các thành viên trong nhóm. Tối đa 100 ký tự." />
            <Input id="avatarUrl" name="avatarUrl" type="url" autoComplete="url" label="URL ảnh đại diện (tuỳ chọn)"
              value={url} onChange={e => edit('avatarUrl', e.target.value)} maxLength={500} error={errors.avatarUrl}
              placeholder="https://example.com/anh-cua-ban.jpg"
              hint="Dùng đường dẫn ảnh http(s), tối đa 500 ký tự; xoá đường dẫn để dùng chữ viết tắt. GMind chưa hỗ trợ tải ảnh lên." />
          </fieldset>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button type="button" variant="secondary" disabled={!dirty || busy}
              onClick={() => { setName(me.displayName); setUrl(me.avatarUrl ?? ''); setErrors({}); setError(''); setOk(''); }}>Hủy</Button>
            <Button type="submit" className="account-primary" disabled={!dirty} isLoading={busy}>Lưu thay đổi</Button>
          </div>
        </form>
    </>
  );
}

export default function Profile() {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot);
  if (!session) return null;
  return <AccountLayout page="profile"><ProfileForm key={session.id} session={session} /></AccountLayout>;
}
