import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { authService } from '../services/auth';
import { validateAuthFields, focusAuthError, authErrorMessage, type AuthFieldErrors } from '../utils/auth-form';

export default function ResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const [token, setToken] = useState(() =>
    new URLSearchParams(location.hash.slice(1)).get('token')
    ?? new URLSearchParams(location.search).get('token')
    ?? '');
  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [k]: e.target.value });
    if (fieldErrors[k]) setFieldErrors(f => ({ ...f, [k]: undefined }));
    if (error) setError('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    const errors = validateAuthFields(form, true);
    setFieldErrors(errors);
    if (Object.keys(errors).length) { focusAuthError(errors); return; }
    setLoading(true);
    try {
      await authService.resetPassword(token, form.password, form.confirmPassword);
      setForm({ password: '', confirmPassword: '' });
      setToken('');
      setDone(true);
      navigate('/reset-password', { replace: true });
    } catch (err: unknown) {
      setError(authErrorMessage(err, 'Không đặt lại được mật khẩu. Vui lòng thử lại.'));
    } finally { setLoading(false); }
  };

  return (
    <AuthLayout>
      <Card className="p-6 sm:p-8">
        {done ? (
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Mật khẩu đã thay đổi</h1>
            <p role="status" className="mt-3 text-sm font-medium text-success-700">Mật khẩu mới đã được lưu. Các phiên đăng nhập cũ đã bị thu hồi.</p>
            <Link to="/login" state={{ passwordReset: true }} className="mt-5 inline-flex items-center justify-center min-h-11 w-full rounded-xl bg-primary-600 text-base font-medium text-white hover:bg-primary-700">
              Đăng nhập bằng mật khẩu mới
            </Link>
          </div>
        ) : !token ? (
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Liên kết không hợp lệ</h1>
            <p className="mt-3 text-sm text-slate-600">Liên kết đặt lại mật khẩu thiếu mã xác nhận hoặc đã bị cắt. Hãy yêu cầu một liên kết mới.</p>
            <div className="mt-5 text-center text-sm">
              <Link to="/forgot-password" className="text-primary-700 font-medium hover:underline">Yêu cầu liên kết mới</Link>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-slate-900">Đặt lại mật khẩu</h1>
              <p className="mt-2 text-base text-slate-600">Nhập mật khẩu mới cho tài khoản của bạn.</p>
            </div>
            <form onSubmit={submit} noValidate aria-busy={loading} className="space-y-5">
              <fieldset disabled={loading} className="min-w-0 space-y-5">
                <Input id="password" label="Mật khẩu mới" type="password" name="password" autoComplete="new-password" required minLength={8}
                  hint="Ít nhất 8 ký tự. Nên dùng mật khẩu riêng cho GMind."
                  value={form.password} onChange={set('password')} error={fieldErrors.password} />
                <Input id="confirmPassword" label="Xác nhận mật khẩu mới" type="password" name="confirmPassword" autoComplete="new-password" required minLength={8}
                  value={form.confirmPassword} onChange={set('confirmPassword')} error={fieldErrors.confirmPassword} />
              </fieldset>
              {error && (
                <div>
                  <p role="alert" className="text-sm text-danger-700">{error}</p>
                  {error.includes('hết hạn') && (
                    <Link to="/forgot-password" className="mt-2 inline-block text-sm text-primary-700 font-medium hover:underline">Yêu cầu liên kết mới</Link>
                  )}
                </div>
              )}
              <Button type="submit" className="auth-submit w-full" isLoading={loading}>Lưu mật khẩu mới</Button>
            </form>
          </div>
        )}
        {!done && <div className="mt-6 border-t border-slate-200 pt-5 text-center text-sm text-slate-600">
          <Link to="/login" className="text-primary-700 font-medium hover:underline">Về đăng nhập</Link>
        </div>}
      </Card>
    </AuthLayout>
  );
}
