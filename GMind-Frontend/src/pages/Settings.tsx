import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import AccountLayout from '../components/account/AccountLayout';
import PasswordField from '../components/account/PasswordField';
import { authService } from '../services/auth';
import { clearSession, getSessionSnapshot, subscribeSession } from '../services/session';
import { accountError } from '../utils/account-form';

type Fields = { currentPassword: string; newPassword: string; confirmPassword: string };
type Errors = Partial<Fields>;
const EMPTY: Fields = { currentPassword: '', newPassword: '', confirmPassword: '' };

function PasswordForm({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = () => mounted.current && getSessionSnapshot()?.id === sessionId;
  useEffect(() => {
    if (!busy && errors.currentPassword) document.getElementById('currentPassword')?.focus();
  }, [busy, errors.currentPassword]);

  const submit = async () => {
    if (busyRef.current || !current()) return;
    const invalid: Errors = {};
    if (!fields.currentPassword) invalid.currentPassword = 'Nhập mật khẩu hiện tại.';
    if (!fields.newPassword) invalid.newPassword = 'Nhập mật khẩu mới.';
    else if (fields.newPassword.length < 8) invalid.newPassword = 'Mật khẩu mới cần ít nhất 8 ký tự.';
    if (!fields.confirmPassword) invalid.confirmPassword = 'Nhập lại mật khẩu mới để xác nhận.';
    else if (fields.confirmPassword !== fields.newPassword) invalid.confirmPassword = 'Mật khẩu xác nhận không khớp.';
    setErrors(invalid); setError('');
    if (Object.keys(invalid).length) {
      document.getElementById(Object.keys(invalid)[0])?.focus();
      return;
    }
    busyRef.current = true; setBusy(true);
    try {
      await authService.changePassword(fields.currentPassword, fields.newPassword, fields.confirmPassword);
      if (!current()) return;
      setFields(EMPTY);
      // Publish the reason atomically so the auth guard and explicit navigation agree.
      clearSession(sessionId, 'passwordChanged');
      navigate('/login', { replace: true, state: { passwordChanged: true } });
    } catch (e) {
      if (!current()) return;
      const failure = e as { status?: number; message?: string } | null;
      if (failure?.status === 400 && failure.message === 'Current password is incorrect') {
        setErrors({ currentPassword: 'Mật khẩu hiện tại không đúng. Kiểm tra rồi thử lại.' });
      } else {
        setError(accountError(e, 'Chưa đổi được mật khẩu. Hãy kiểm tra thông tin và thử lại.'));
      }
    } finally {
      busyRef.current = false;
      if (current()) setBusy(false);
    }
  };

  const edit = (field: keyof Fields, value: string) => {
    setFields(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined })); setError('');
  };
  return (
    <form noValidate aria-busy={busy} className="space-y-5 p-5 sm:p-6" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Đổi mật khẩu</h3>
        <p className="mt-1 text-sm text-slate-600">Xác nhận mật khẩu hiện tại trước khi đặt mật khẩu mới.</p>
      </div>
      {error && <p role="alert" className="rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700">{error}</p>}
      <fieldset disabled={busy} className="min-w-0 space-y-5">
        <PasswordField key={`current:${reset}`} id="currentPassword" label="Mật khẩu hiện tại" value={fields.currentPassword}
          onChange={v => edit('currentPassword', v)} error={errors.currentPassword} disabled={busy} current />
        <div className="grid gap-5 md:grid-cols-2">
          <PasswordField key={`new:${reset}`} id="newPassword" label="Mật khẩu mới" value={fields.newPassword}
            onChange={v => edit('newPassword', v)} error={errors.newPassword} disabled={busy} hint="Ít nhất 8 ký tự." />
          <PasswordField key={`confirm:${reset}`} id="confirmPassword" label="Xác nhận mật khẩu mới" value={fields.confirmPassword}
            onChange={v => edit('confirmPassword', v)} error={errors.confirmPassword} disabled={busy} />
        </div>
      </fieldset>
      <p className="rounded-xl bg-warning-50 px-4 py-3 text-sm text-warning-700">
        Đổi mật khẩu sẽ kết thúc các phiên đăng nhập. Bạn cần đăng nhập lại bằng mật khẩu mới.
      </p>
      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <Button type="button" variant="secondary" disabled={busy} onClick={() => {
          setFields(EMPTY); setErrors({}); setError(''); setReset(v => v + 1);
        }}>Hủy</Button>
        <Button type="submit" className="account-primary" isLoading={busy}>Đổi mật khẩu</Button>
      </div>
    </form>
  );
}

export default function Settings() {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot);
  if (!session) return null;
  return (
    <AccountLayout page="settings">
      <PasswordForm key={session.id} sessionId={session.id} />
    </AccountLayout>
  );
}
