import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { authService } from '../services/auth';
import { validateAuthFields, focusAuthError, authErrorMessage, type AuthFieldErrors } from '../utils/auth-form';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    const errors = validateAuthFields({ email });
    setFieldErrors(errors);
    if (Object.keys(errors).length) { focusAuthError(errors); return; }
    setLoading(true);
    try {
      await authService.forgotPassword(email.trim());
      setSent(true);
    } catch (err: unknown) {
      setError(authErrorMessage(err, 'Không gửi được yêu cầu. Vui lòng thử lại.'));
    } finally { setLoading(false); }
  };

  return (
    <AuthLayout>
      <>
        <div className="mb-8">
          <h1 className="text-display font-bold text-ink">Quên mật khẩu</h1>
          <p className="mt-2 text-body text-ink-secondary">Nhập email đã dùng để đăng ký GMind.</p>
        </div>
        {sent ? (
          <div>
            <p role="status" className="text-sm font-medium text-success-700">Nếu địa chỉ này có tài khoản, hướng dẫn đặt lại mật khẩu đã được gửi.</p>
            {import.meta.env.DEV && (
              <p className="mt-4 text-sm text-ink-secondary">
                Môi trường phát triển:{' '}
                <Link to="/dev/mailbox" className="font-medium text-primary-700 hover:underline">mở hộp thư dev</Link>
                {' '}để lấy liên kết đặt lại mật khẩu.
              </p>
            )}
            <Button type="button" variant="secondary" className="mt-5" onClick={() => { setSent(false); setEmail(''); setError(''); setFieldErrors({}); }}>
              Dùng email khác
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate aria-busy={loading} className="space-y-5">
            <Input id="email" label="Email" type="email" name="email" autoComplete="email" required disabled={loading}
              value={email}
              onChange={e => { setEmail(e.target.value); if (fieldErrors.email) setFieldErrors({}); if (error) setError(''); }}
              error={fieldErrors.email} />
            {error && <p role="alert" className="text-sm text-danger-700">{error}</p>}
            <Button type="submit" size="lg" className="w-full" isLoading={loading}>Gửi hướng dẫn đặt lại</Button>
          </form>
        )}
        <div className="mt-8 border-t border-line pt-6 text-center text-small text-ink-secondary">
          <Link to="/login" className="text-primary-700 font-medium hover:underline">Về đăng nhập</Link>
        </div>
      </>
    </AuthLayout>
  );
}
