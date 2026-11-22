import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import { authService } from '../services/auth';
import { getSessionSnapshot, updateSessionUser } from '../services/session';

type State = 'missing' | 'verifying' | 'success' | 'failed';

/** Read `#token=` once and strip it from the address bar immediately (no token in history). */
function takeToken(): string {
  const match = /^#token=(.+)$/.exec(window.location.hash);
  if (!match) return '';
  const token = decodeURIComponent(match[1]);
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return token;
}

export default function VerifyEmail() {
  const [token] = useState(takeToken);
  const [state, setState] = useState<State>(token ? 'verifying' : 'missing');
  const [message, setMessage] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const started = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    void (async () => {
      try {
        const res = await authService.verifyEmailChange(token);
        if (!mounted.current) return;
        const session = getSessionSnapshot();
        if (session) {
          try {
            const me = await authService.validateSession();
            updateSessionUser(me, session.id);
          } catch {
            updateSessionUser({ ...session.user, email: res.email }, session.id);
          }
        }
        if (!mounted.current) return;
        setNewEmail(res.email);
        setState('success');
      } catch (e) {
        if (!mounted.current) return;
        const failure = e as { message?: string } | null;
        setMessage(failure?.message || 'Liên kết đã hết hạn hoặc không còn hiệu lực.');
        setState('failed');
      }
    })();
  }, [token]);

  const loggedIn = !!getSessionSnapshot();
  const action = loggedIn
    ? <Link to="/profile"><Button variant="primary" className="min-w-40">Về hồ sơ</Button></Link>
    : <Link to="/login"><Button variant="primary" className="min-w-40">Đăng nhập</Button></Link>;

  return (
    <AuthLayout>
      <div className="space-y-5 text-center">
        {state === 'missing' && (
          <>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-warning-50 text-warning-700"><Icon name="mail-open" size={28} /></span>
            <h1 className="text-title font-semibold text-ink">Liên kết xác minh không hợp lệ.</h1>
            <p className="text-sm text-ink-secondary">Đường dẫn này thiếu mã xác minh. Mở lại liên kết đầy đủ trong email của bạn.</p>
          </>
        )}
        {state === 'verifying' && (
          <>
            <span className="mx-auto flex h-14 w-14 items-center justify-center" role="status" aria-label="Đang xác minh">
              <span className="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-primary-600" />
            </span>
            <h1 className="text-title font-semibold text-ink">Đang xác minh email</h1>
            <p className="text-sm text-ink-secondary">Vui lòng chờ trong giây lát…</p>
          </>
        )}
        {state === 'success' && (
          <>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success-50 text-success-700"><Icon name="check" size={28} /></span>
            <h1 className="text-title font-semibold text-ink">Email đăng nhập của bạn đã đổi thành {newEmail}.</h1>
            <p className="text-sm text-ink-secondary">Từ giờ hãy đăng nhập bằng địa chỉ email mới.</p>
          </>
        )}
        {state === 'failed' && (
          <>
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-50 text-danger-700"><Icon name="mail-open" size={28} /></span>
            <h1 className="text-title font-semibold text-ink">Không xác minh được</h1>
            <p role="alert" className="rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700">{message}</p>
          </>
        )}
        <div className="pt-1">{action}</div>
      </div>
    </AuthLayout>
  );
}
