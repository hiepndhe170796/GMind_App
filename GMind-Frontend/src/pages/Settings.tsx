import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Icon from '../components/ui/Icon';
import Switch from '../components/ui/Switch';
import AccountLayout from '../components/account/AccountLayout';
import PasswordField from '../components/account/PasswordField';
import ConfirmationDialog from '../components/workspace/ConfirmationDialog';
import { ErrorState } from '../components/workspace/WorkspaceUI';
import { useToast } from '../components/ui/Toast';
import { authService, type NotificationPreferenceDto, type SessionInfoDto } from '../services/auth';
import { clearSession, getSessionSnapshot, subscribeSession } from '../services/session';
import { qk } from '../services/query-keys';
import { accountError } from '../utils/account-form';
import { formatDateTime, formatRelative } from '../utils/presentation';
import { errMsg } from '../components/workspace/utils';

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
    <Card className="p-0">
      <form noValidate aria-busy={busy} className="space-y-5 p-5 sm:p-6" onSubmit={e => { e.preventDefault(); void submit(); }}>
        <div>
          <h3 className="text-lg font-semibold text-ink">Đổi mật khẩu</h3>
          <p className="mt-1 text-sm text-ink-secondary">Xác nhận mật khẩu hiện tại trước khi đặt mật khẩu mới.</p>
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
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => {
            setFields(EMPTY); setErrors({}); setError(''); setReset(v => v + 1);
          }}>Hủy</Button>
          <Button type="submit" isLoading={busy}>Đổi mật khẩu</Button>
        </div>
      </form>
    </Card>
  );
}

const isPhone = (os: string) => /ios|android/i.test(os);

function SessionRow({ session, onRevoke, busy }: { session: SessionInfoDto; onRevoke: (s: SessionInfoDto) => void; busy: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-subtle text-ink-muted">
        <Icon name={isPhone(session.os) ? 'device-phone' : 'device-desktop'} size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
          <span className="truncate">{session.deviceLabel}</span>
          {session.isCurrent && (
            <span className="rounded-full bg-primary-50 px-2 py-0.5 text-caption font-semibold text-primary-700">Thiết bị này</span>
          )}
        </p>
        <p className="mt-0.5 text-caption text-ink-muted">
          {session.ipAddress ? `IP ${session.ipAddress} · ` : ''}Đăng nhập {formatDateTime(session.createdAt)} · Hoạt động gần nhất {formatRelative(session.lastSeenAt)}
        </p>
      </div>
      <Button variant="secondary" size="sm" className="shrink-0" disabled={busy} onClick={() => onRevoke(session)}>
        Đăng xuất
      </Button>
    </li>
  );
}

function SessionsCard() {
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const uid = getSessionSnapshot()?.user.id ?? '';
  const [confirm, setConfirm] = useState<SessionInfoDto | null>(null);
  const [confirmOthers, setConfirmOthers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const sessionsQ = useQuery({
    queryKey: qk.sessions(uid),
    queryFn: () => authService.listSessions(),
    enabled: !!uid,
  });
  const sessions = sessionsQ.data;
  const others = sessions?.filter(s => !s.isCurrent) ?? [];

  const doLogout = async () => {
    const result = await authService.logout();
    if (getSessionSnapshot()) return;
    navigate('/login', {
      replace: true,
      state: result.serverRevoked ? undefined : { logoutWarning: 'Đã đăng xuất trên trình duyệt này. Chưa thể xác nhận thu hồi phiên trên máy chủ; vui lòng kiểm tra kết nối.' },
    });
  };

  const revoke = async () => {
    const target = confirm;
    if (!target || busy) return;
    // The current session uses the normal logout flow only — revoking it first
    // would 401 the logout call and produce a misleading "cannot confirm" warning.
    if (target.isCurrent) {
      setConfirm(null);
      await doLogout();
      return;
    }
    setBusy(true); setError('');
    try {
      await authService.revokeSession(target.id);
      setConfirm(null);
      await queryClient.invalidateQueries({ queryKey: qk.sessions(uid) });
      toast.success(`Đã đăng xuất phiên trên ${target.deviceLabel}.`);
    } catch (e) {
      setError(errMsg(e, 'Không đăng xuất được phiên này. Vui lòng thử lại.'));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const revokeOthers = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const n = await authService.revokeOtherSessions();
      setConfirmOthers(false);
      await queryClient.invalidateQueries({ queryKey: qk.sessions(uid) });
      toast.success(`Đã đăng xuất ${n} thiết bị khác.`);
    } catch (e) {
      setError(errMsg(e, 'Không đăng xuất được các phiên khác. Vui lòng thử lại.'));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-5 pb-4 sm:p-6 sm:pb-4">
        <h3 className="text-lg font-semibold text-ink">Phiên đăng nhập</h3>
        <p className="mt-1 text-sm text-ink-secondary">Các thiết bị đang đăng nhập tài khoản của bạn.</p>
      </div>
      {sessionsQ.isPending && (
        <ul aria-hidden="true" className="divide-y divide-line border-t border-line">
          {[1, 2].map(i => (
            <li key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5 motion-safe:animate-pulse">
              <span className="h-10 w-10 rounded-xl bg-surface-subtle" />
              <span className="flex-1 space-y-2"><span className="block h-4 w-1/2 rounded bg-surface-subtle" /><span className="block h-3 w-2/3 rounded bg-surface-subtle" /></span>
            </li>
          ))}
        </ul>
      )}
      {sessionsQ.isError && (
        <div className="border-t border-line p-5 sm:p-6">
          <ErrorState message="Không tải được danh sách phiên đăng nhập." onRetry={() => void sessionsQ.refetch()} />
        </div>
      )}
      {sessions && (
        <>
          <ul className="divide-y divide-line border-t border-line">
            {sessions.map(s => <SessionRow key={s.id} session={s} busy={busy} onRevoke={(s) => { setError(''); setConfirm(s); }} />)}
          </ul>
          <div className="border-t border-line p-4 sm:px-5">
            <Button variant="danger" disabled={busy || others.length === 0} onClick={() => { setError(''); setConfirmOthers(true); }}>
              Đăng xuất khỏi các thiết bị khác
            </Button>
          </div>
        </>
      )}
      <ConfirmationDialog open={!!confirm} busy={busy} title="Đăng xuất phiên này?"
        onClose={() => { if (!busy) { setError(''); setConfirm(null); } }}>
        <p>
          {confirm?.isCurrent
            ? 'Phiên trên thiết bị này sẽ kết thúc và bạn cần đăng nhập lại.'
            : `Phiên trên ${confirm?.deviceLabel} sẽ kết thúc ngay.`}
        </p>
        {error && <p role="alert" className="mt-3 rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => { setError(''); setConfirm(null); }}>Hủy</Button>
          <Button className="min-h-11" isLoading={busy} onClick={() => void revoke()}>Đăng xuất</Button>
        </div>
      </ConfirmationDialog>
      <ConfirmationDialog open={confirmOthers} busy={busy} title="Đăng xuất các thiết bị khác?"
        onClose={() => { if (!busy) { setError(''); setConfirmOthers(false); } }}>
        <p>Mọi phiên đăng nhập trên các thiết bị khác sẽ kết thúc. Phiên trên thiết bị này vẫn hoạt động.</p>
        {error && <p role="alert" className="mt-3 rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => { setError(''); setConfirmOthers(false); }}>Hủy</Button>
          <Button variant="danger" className="min-h-11" isLoading={busy} onClick={() => void revokeOthers()}>Đăng xuất tất cả</Button>
        </div>
      </ConfirmationDialog>
    </Card>
  );
}

const PREF_ROWS: { key: keyof NotificationPreferenceDto; label: string; description: string }[] = [
  { key: 'reminder3Days', label: '3 ngày trước hạn', description: 'Nhắc một lần trong khoảng 3 đến 1 ngày trước hạn chót.' },
  { key: 'reminder1Day', label: '1 ngày trước hạn', description: 'Nhắc một lần trong khoảng 1 ngày đến 3 giờ trước hạn chót.' },
  { key: 'reminder3Hours', label: '3 giờ trước hạn', description: 'Nhắc một lần trong 3 giờ cuối trước hạn chót.' },
  { key: 'overdueAlert', label: 'Khi quá hạn', description: 'Nhắc mỗi ngày khi công việc đã quá hạn và chưa hoàn thành.' },
];

function PreferencesCard({ sessionId }: { sessionId: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const uid = getSessionSnapshot()?.user.id ?? '';
  const [draft, setDraft] = useState<NotificationPreferenceDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = () => mounted.current && getSessionSnapshot()?.id === sessionId;

  const prefsQ = useQuery({
    queryKey: qk.notificationPreferences(uid),
    queryFn: () => authService.getNotificationPreferences(),
    enabled: !!uid,
  });
  const server = prefsQ.data;
  const shown = draft ?? server ?? null;
  const dirty = !!draft && !!server
    && PREF_ROWS.some(r => draft[r.key] !== server[r.key]);

  const save = async () => {
    if (!draft || !dirty || busy || !current()) return;
    setBusy(true); setError('');
    try {
      const saved = await authService.updateNotificationPreferences(draft);
      if (!current()) return;
      queryClient.setQueryData(qk.notificationPreferences(uid), saved);
      setDraft(null);
      toast.success('Đã lưu tùy chọn thông báo.');
    } catch (e) {
      if (current()) setError(errMsg(e, 'Chưa lưu được tùy chọn. Vui lòng thử lại.'));
    } finally {
      if (current()) setBusy(false);
    }
  };

  return (
    <Card className="p-5 sm:p-6">
      <h3 className="text-lg font-semibold text-ink">Thông báo nhắc hạn</h3>
      <p className="mt-1 text-sm text-ink-secondary">
        Áp dụng cho thông báo trong ứng dụng. Cảnh báo rủi ro và nhắc của Trưởng nhóm luôn được gửi.
      </p>
      {error && <p role="alert" className="mt-3 rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700">{error}</p>}
      {prefsQ.isPending && (
        <div aria-hidden="true" className="mt-4 space-y-4 motion-safe:animate-pulse">
          {[1, 2, 3, 4].map(i => <span key={i} className="block h-7 w-2/3 rounded bg-surface-subtle" />)}
        </div>
      )}
      {prefsQ.isError && (
        <div className="mt-4"><ErrorState message="Không tải được tùy chọn thông báo." onRetry={() => void prefsQ.refetch()} /></div>
      )}
      {shown && (
        <div className="mt-4 space-y-4">
          {PREF_ROWS.map(row => (
            <Switch key={row.key} id={`pref-${row.key}`} checked={shown[row.key]} disabled={busy}
              label={row.label} description={row.description}
              onChange={next => setDraft({ ...shown, [row.key]: next })} />
          ))}
        </div>
      )}
      {shown && (
        <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" disabled={!dirty || busy} onClick={() => { setDraft(null); setError(''); }}>Hủy</Button>
          <Button disabled={!dirty} isLoading={busy} onClick={() => void save()}>Lưu</Button>
        </div>
      )}
    </Card>
  );
}

export default function Settings() {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot);
  if (!session) return null;
  return (
    <AccountLayout page="settings">
      <PasswordForm key={`pw-${session.id}`} sessionId={session.id} />
      <SessionsCard key={`sess-${session.id}`} />
      <PreferencesCard key={`prefs-${session.id}`} sessionId={session.id} />
    </AccountLayout>
  );
}
