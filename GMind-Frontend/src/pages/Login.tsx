import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import LoginLayout from '../layouts/LoginLayout';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { authService } from '../services/auth';
import { validateAuthFields, focusAuthError, authErrorMessage, type AuthFieldErrors } from '../utils/auth-form';

function safeReturnPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  if ([...value].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return null;
  const target = new URL(value, window.location.origin);
  if (target.origin !== window.location.origin) return null;
  if (['/login', '/register', '/forgot-password', '/reset-password'].includes(target.pathname)) return null;
  return target.pathname + target.search + target.hash;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { from?: unknown; sessionExpired?: boolean; logoutWarning?: string; passwordReset?: boolean } | null;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    const errors = validateAuthFields({ email, password });
    setFieldErrors(errors);
    if (Object.keys(errors).length) { focusAuthError(errors); return; }
    setLoading(true);
    try {
      const result = await authService.login(email.trim(), password);
      authService.saveSession(result);
      navigate(safeReturnPath(state?.from) ?? '/dashboard', { replace: true });
    } catch (err: unknown) {
      setError(authErrorMessage(err, 'Đăng nhập thất bại'));
    } finally {
      setLoading(false);
    }
  };

  const clearField = (field: keyof AuthFieldErrors, setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    if (fieldErrors[field]) setFieldErrors(f => ({ ...f, [field]: undefined }));
    if (error) setError('');
  };

  return (
    <LoginLayout>
      {state?.passwordReset && <p role="status" className="mb-4 text-sm font-medium text-success-700">Mật khẩu đã được đặt lại. Đăng nhập bằng mật khẩu mới.</p>}
      {state?.sessionExpired && <p role="alert" className="mb-4 text-sm text-warning-700">Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.</p>}
      {state?.logoutWarning && <p role="alert" className="mb-4 text-sm text-warning-700">{state.logoutWarning}</p>}
      <form onSubmit={submit} noValidate aria-busy={loading} className="space-y-5">
        <fieldset disabled={loading} className="min-w-0 space-y-5">
          <Input id="email" label="Email" type="email" name="email" autoComplete="username" required
            value={email} onChange={clearField('email', setEmail)} error={fieldErrors.email} />
          <div>
            <Input id="password" label="Mật khẩu" type="password" name="password" autoComplete="current-password" required
              value={password} onChange={clearField('password', setPassword)} error={fieldErrors.password} />
            <p className="mt-2 text-right">
              <Link to="/forgot-password" className="text-sm text-primary-700 font-medium hover:underline">Quên mật khẩu?</Link>
            </p>
          </div>
        </fieldset>
        {error && <p role="alert" className="text-sm text-danger-700">{error}</p>}
        <Button type="submit" className="auth-submit w-full" isLoading={loading}>Đăng nhập</Button>
      </form>
    </LoginLayout>
  );
}
