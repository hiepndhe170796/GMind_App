import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';
import { authService } from '../services/auth';

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ displayName: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) { setError('Mật khẩu xác nhận không khớp'); return; }
    setLoading(true);
    try {
      await authService.register(form.displayName, form.email, form.password, form.confirmPassword);
      const result = await authService.login(form.email, form.password);
      authService.saveSession(result);
      navigate('/join-group', { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Đăng ký thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <Card variant="elevated">
        <h2 className="text-xl font-semibold mb-4">Đăng ký</h2>
        <form onSubmit={submit} className="space-y-4">
          <Input label="Tên hiển thị" value={form.displayName} onChange={set('displayName')} required />
          <Input label="Email" type="email" value={form.email} onChange={set('email')} required />
          <Input label="Mật khẩu" type="password" value={form.password} onChange={set('password')} required minLength={8} />
          <Input label="Xác nhận mật khẩu" type="password" value={form.confirmPassword} onChange={set('confirmPassword')} required />
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <Button type="submit" className="w-full" isLoading={loading}>Tạo tài khoản</Button>
        </form>
        <p className="mt-4 text-sm text-center text-neutral-600 dark:text-neutral-400">
          Đã có tài khoản? <Link to="/login" className="text-primary-600 hover:underline">Đăng nhập</Link>
        </p>
      </Card>
    </AuthLayout>
  );
}
