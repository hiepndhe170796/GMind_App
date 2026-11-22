import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import AccountLayout from '../components/account/AccountLayout';
import UserAvatar from '../components/account/UserAvatar';
import PasswordField from '../components/account/PasswordField';
import ConfirmationDialog from '../components/workspace/ConfirmationDialog';
import { useToast } from '../components/ui/Toast';
import { authService, type PendingEmailChangeDto } from '../services/auth';
import { getSessionSnapshot, subscribeSession, updateSessionUser, type SessionRecord } from '../services/session';
import { qk } from '../services/query-keys';
import { accountError, isSafeAvatarUrl } from '../utils/account-form';
import { formatDateTime } from '../utils/presentation';
import { errMsg } from '../components/workspace/utils';

type Errors = { displayName?: string; avatarUrl?: string };
type EmailErrors = { newEmail?: string; currentPassword?: string; form?: string };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function EmailChangeDialog({ open, initialEmail, currentEmail, onClose, onRequested }: {
  open: boolean; initialEmail: string; currentEmail: string;
  onClose: () => void; onRequested: (pending: PendingEmailChangeDto) => void;
}) {
  const [newEmail, setNewEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<EmailErrors>({});
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const submit = async () => {
    if (busy) return;
    const invalid: EmailErrors = {};
    const trimmed = newEmail.trim();
    if (!trimmed) invalid.newEmail = 'Nhập email mới.';
    else if (!EMAIL_RE.test(trimmed)) invalid.newEmail = 'Email chưa đúng định dạng.';
    else if (trimmed.toLowerCase() === currentEmail.toLowerCase()) invalid.newEmail = 'Email mới phải khác email hiện tại.';
    if (!password) invalid.currentPassword = 'Nhập mật khẩu hiện tại.';
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      document.getElementById(invalid.newEmail ? 'newEmail' : 'emailChangePassword')?.focus();
      return;
    }
    setBusy(true);
    try {
      const pending = await authService.requestEmailChange(trimmed, password);
      if (!mounted.current) return;
      onRequested(pending);
    } catch (e) {
      if (!mounted.current) return;
      const failure = e as { status?: number; message?: string } | null;
      const message = failure?.message ?? '';
      if (failure?.status === 409 || /email/i.test(message)) setErrors({ newEmail: message || 'Email này đã được sử dụng.' });
      else if (failure?.status === 400 && /mật khẩu/i.test(message)) setErrors({ currentPassword: message });
      else setErrors({ form: errMsg(e, 'Không gửi được yêu cầu đổi email. Vui lòng thử lại.') });
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <ConfirmationDialog open={open} busy={busy} title="Đổi email đăng nhập" onClose={() => { if (!busy) onClose(); }}>
      <form noValidate onSubmit={e => { e.preventDefault(); void submit(); }} className="space-y-4">
        {errors.form && <p role="alert" className="rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700">{errors.form}</p>}
        <Input id="newEmail" label="Email mới" type="email" name="email" autoComplete="email" required
          value={newEmail} onChange={e => { setNewEmail(e.target.value); setErrors(p => ({ ...p, newEmail: undefined, form: undefined })); }}
          error={errors.newEmail} disabled={busy}
          hint="Liên kết xác minh sẽ được gửi tới địa chỉ này và có hiệu lực 60 phút." />
        <PasswordField id="emailChangePassword" label="Mật khẩu hiện tại" value={password}
          onChange={v => { setPassword(v); setErrors(p => ({ ...p, currentPassword: undefined, form: undefined })); }}
          error={errors.currentPassword} disabled={busy} current />
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={onClose}>Hủy</Button>
          <Button type="submit" className="min-h-11" isLoading={busy}>Gửi liên kết xác minh</Button>
        </div>
      </form>
    </ConfirmationDialog>
  );
}

function PendingEmailCard({ pending, onCancel, onResend }: {
  pending: PendingEmailChangeDto; onCancel: () => Promise<void>; onResend: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    try { await onCancel(); } finally { setBusy(false); }
  };
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">Đang chờ đổi email</h3>
          <p className="mt-1 text-sm text-ink-secondary">
            Đang chờ xác minh <span className="font-medium text-ink">{pending.pendingEmail}</span>.{' '}
            Liên kết hết hạn lúc {formatDateTime(pending.expiresAt)}.
          </p>
          {import.meta.env.DEV && (
            <p className="mt-2">
              <Link to="/dev/mailbox" className="text-sm font-medium text-primary-700 hover:underline">Mở Hộp thư dev</Link>
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" size="sm" disabled={busy} onClick={onResend}>Gửi lại</Button>
          <Button variant="danger" size="sm" disabled={busy} onClick={() => setConfirming(true)}>Hủy yêu cầu</Button>
        </div>
      </div>
      <ConfirmationDialog open={confirming} busy={busy} title="Hủy yêu cầu đổi email?"
        onClose={() => { if (!busy) setConfirming(false); }}>
        <p>Email đăng nhập giữ nguyên. Liên kết xác minh đã gửi sẽ không còn hiệu lực.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => setConfirming(false)}>Giữ yêu cầu</Button>
          <Button variant="danger" className="min-h-11" isLoading={busy} onClick={() => void cancel().then(() => setConfirming(false))}>Hủy yêu cầu</Button>
        </div>
      </ConfirmationDialog>
    </Card>
  );
}

function ProfileForm({ session }: { session: SessionRecord }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const uid = session.user.id;
  const [me, setMe] = useState(session.user);
  const [name, setName] = useState(me.displayName);
  const [url, setUrl] = useState(me.avatarUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [emailDialog, setEmailDialog] = useState<null | { initial: string }>(null);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = () => mounted.current && getSessionSnapshot()?.id === session.id;

  // Authoritative /api/me on mount — refresh stale session email/name after an email change.
  const meQ = useQuery({
    queryKey: qk.me(uid),
    queryFn: () => authService.validateSession(),
  });
  useEffect(() => {
    const fresh = meQ.data;
    if (!fresh) return;
    setMe(fresh);
    setName(prev => prev === me.displayName ? fresh.displayName : prev);
    if (fresh.email !== session.user.email || fresh.displayName !== session.user.displayName) {
      updateSessionUser(fresh, session.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once per fetched user object
  }, [meQ.data]);

  const pendingQ = useQuery({
    queryKey: qk.pendingEmailChange(uid),
    queryFn: () => authService.getPendingEmailChange(),
  });
  const pending = pendingQ.data ?? null;

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
      setMe(saved); setName(saved.displayName); setUrl(saved.avatarUrl ?? '');
      setOk('Đã lưu hồ sơ.');
    } catch (e) {
      if (current()) setError(accountError(e, 'Chưa lưu được hồ sơ. Thông tin bạn nhập vẫn được giữ; hãy thử lại.'));
    } finally {
      busyRef.current = false;
      if (current()) setBusy(false);
    }
  };

  const onRequested = (p: PendingEmailChangeDto) => {
    setEmailDialog(null);
    queryClient.setQueryData(qk.pendingEmailChange(uid), p);
    toast.success(`Đã gửi liên kết xác minh tới ${p.pendingEmail}.`);
  };

  const cancelPending = async () => {
    try {
      await authService.cancelEmailChange();
      if (!mounted.current) return;
      queryClient.setQueryData(qk.pendingEmailChange(uid), null);
      toast.success('Đã hủy yêu cầu đổi email.');
    } catch (e) {
      toast.error(errMsg(e, 'Không hủy được yêu cầu. Vui lòng thử lại.'));
    }
  };

  return (
    <>
      <Card className="p-0">
        <div className="flex items-center gap-4 border-b border-line p-5 sm:p-6">
          <UserAvatar name={me.displayName} url={me.avatarUrl} size={64} />
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-lg font-semibold text-ink [overflow-wrap:anywhere]">{me.displayName}</h3>
            <p className="mt-1 break-words text-sm text-ink-secondary [overflow-wrap:anywhere]">{me.email}</p>
          </div>
          <Button variant="secondary" size="sm" className="shrink-0" onClick={() => setEmailDialog({ initial: '' })}>
            Đổi email
          </Button>
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
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="secondary" disabled={!dirty || busy}
              onClick={() => { setName(me.displayName); setUrl(me.avatarUrl ?? ''); setErrors({}); setError(''); setOk(''); }}>Hủy</Button>
            <Button type="submit" disabled={!dirty} isLoading={busy}>Lưu thay đổi</Button>
          </div>
        </form>
      </Card>
      {pending && (
        <PendingEmailCard pending={pending}
          onCancel={cancelPending}
          onResend={() => setEmailDialog({ initial: pending.pendingEmail })} />
      )}
      {emailDialog !== null && <EmailChangeDialog
        open
        initialEmail={emailDialog.initial}
        currentEmail={me.email}
        onClose={() => setEmailDialog(null)}
        onRequested={onRequested} />}
    </>
  );
}

export default function Profile() {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot);
  if (!session) return null;
  return <AccountLayout page="profile"><ProfileForm key={session.id} session={session} /></AccountLayout>;
}
