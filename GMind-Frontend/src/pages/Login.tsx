import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';
import { authService } from '../services/auth';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await authService.login(email, password);
      authService.saveSession(result);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.message || err?.errors?.[0] || 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <Card variant="elevated">
        <h2 className="text-xl font-semibold mb-4">Đăng nhập</h2>
        <form onSubmit={submit} className="space-y-4">
          <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          <Input label="Mật khẩu" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <Button type="submit" className="w-full" isLoading={loading}>Đăng nhập</Button>
        </form>
        <p className="mt-4 text-sm text-center text-neutral-600 dark:text-neutral-400">
          Chưa có tài khoản? <Link to="/register" className="text-primary-600 hover:underline">Đăng ký</Link>
        </p>
      </Card>
    </AuthLayout>
  );
}
