import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import RegisterLayout from '../layouts/RegisterLayout';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { authService } from '../services/auth';
import { validateAuthFields, focusAuthError, authErrorMessage, type AuthFieldErrors } from '../utils/auth-form';

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ displayName: '', email: '', password: '', confirmPassword: '' });
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const focusServerEmail = useRef(false);

  useEffect(() => {
    if (!loading && focusServerEmail.current) {
      focusServerEmail.current = false;
      document.getElementById('email')?.focus();
    }
  }, [loading, fieldErrors]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [k]: e.target.value });
    if (fieldErrors[k]) setFieldErrors(f => ({ ...f, [k]: undefined }));
    if (error) setError('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    if (registered) {
      setLoading(true);
      try {
        const result = await authService.login(form.email.trim(), form.password);
        authService.saveSession(result);
        navigate('/join-group', { replace: true });
      } catch (err: unknown) {
        setError(authErrorMessage(err, 'Đăng nhập thất bại. Tài khoản đã tạo — thử đăng nhập lại hoặc dùng trang đăng nhập.'));
      } finally { setLoading(false); }
      return;
    }
    const errors = validateAuthFields(form, true);
    setFieldErrors(errors);
    if (Object.keys(errors).length) { focusAuthError(errors); return; }
    setLoading(true);
    try {
      await authService.register(form.displayName.trim(), form.email.trim(), form.password, form.confirmPassword);
      setRegistered(true);
      const result = await authService.login(form.email.trim(), form.password);
      authService.saveSession(result);
      navigate('/join-group', { replace: true });
    } catch (err: unknown) {
      const failure = err as { status?: number; message?: string };
      if (failure?.status === 409) {
        focusServerEmail.current = true;
        setFieldErrors({ email: 'Email này đã được đăng ký. Hãy đăng nhập hoặc dùng email khác.' });
      } else {
        setError(authErrorMessage(err, 'Đăng ký thất bại'));
      }
    } finally { setLoading(false); }
  };

  return (
    <RegisterLayout>
      {registered && <p role="status" className="mb-4 text-sm font-medium text-success-700">Tài khoản đã được tạo. Đăng nhập để tiếp tục.</p>}
      <form onSubmit={submit} noValidate aria-busy={loading} className="space-y-5">
        <fieldset disabled={loading || registered} className="min-w-0 space-y-5">
          <Input id="displayName" label="Tên hiển thị" name="displayName" autoComplete="nickname" required maxLength={100}
            value={form.displayName} onChange={set('displayName')} error={fieldErrors.displayName} />
          <Input id="email" label="Email" type="email" name="email" autoComplete="email" required maxLength={256}
            value={form.email} onChange={set('email')} error={fieldErrors.email} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Input id="password" label="Mật khẩu" type="password" name="password" autoComplete="new-password" required minLength={8}
              hint="Ít nhất 8 ký tự. Nên dùng mật khẩu riêng cho GMind."
              value={form.password} onChange={set('password')} error={fieldErrors.password} />
            <Input id="confirmPassword" label="Xác nhận mật khẩu" type="password" name="confirmPassword" autoComplete="new-password" required minLength={8}
              value={form.confirmPassword} onChange={set('confirmPassword')} error={fieldErrors.confirmPassword} />
          </div>
        </fieldset>
        {error && <p role="alert" className="text-sm text-danger-700">{error}</p>}
        <Button type="submit" className="auth-submit w-full" isLoading={loading}>{registered ? 'Thử đăng nhập lại' : 'Tạo tài khoản'}</Button>
      </form>
    </RegisterLayout>
  );
}
