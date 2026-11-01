import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from './AuthLayout';
import Card from '../components/ui/Card';

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <AuthLayout>
      <Card className="p-6 sm:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Đăng nhập</h1>
          <p className="mt-2 text-base text-slate-600">Tiếp tục công việc của nhóm.</p>
        </div>
        {children}
        <div className="mt-6 border-t border-slate-200 pt-5 text-center text-sm text-slate-600">
          Chưa có tài khoản? <Link to="/register" className="text-primary-700 font-medium hover:underline">Đăng ký</Link>
        </div>
      </Card>
    </AuthLayout>
  );
}
