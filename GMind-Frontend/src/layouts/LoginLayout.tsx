import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from './AuthLayout';

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <AuthLayout>
      <div className="mb-8">
        <h1 className="text-display font-bold text-ink">Đăng nhập</h1>
        <p className="mt-2 text-body text-ink-secondary">Tiếp tục công việc của nhóm.</p>
      </div>
      {children}
      <div className="mt-8 border-t border-line pt-6 text-center text-small text-ink-secondary">
        Chưa có tài khoản? <Link to="/register" className="text-primary-700 font-medium hover:underline">Đăng ký</Link>
      </div>
    </AuthLayout>
  );
}
