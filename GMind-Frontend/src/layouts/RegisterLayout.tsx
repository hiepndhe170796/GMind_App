import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from './AuthLayout';

export default function RegisterLayout({ children }: { children: ReactNode }) {
  return (
    <AuthLayout wide>
      <div className="mb-8">
        <h1 className="text-display font-bold text-ink">Đăng ký</h1>
        <p className="mt-2 text-body text-ink-secondary">Điền thông tin để bắt đầu làm việc cùng nhóm.</p>
      </div>
      {children}
      <div className="mt-8 border-t border-line pt-6 text-center text-small text-ink-secondary">
        Đã có tài khoản? <Link to="/login" className="text-primary-700 font-medium hover:underline">Đăng nhập</Link>
      </div>
    </AuthLayout>
  );
}
