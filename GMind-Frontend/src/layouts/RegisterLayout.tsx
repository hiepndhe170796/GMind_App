import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from './AuthLayout';
import Card from '../components/ui/Card';

export default function RegisterLayout({ children }: { children: ReactNode }) {
  return (
    <AuthLayout wide>
      <Card className="p-6 sm:p-8">
        <div className="mb-6 pb-6 border-b border-slate-200">
          <h1 className="text-2xl font-bold text-slate-900">Đăng ký</h1>
          <p className="mt-2 text-base text-slate-600">Điền thông tin để bắt đầu làm việc cùng nhóm.</p>
        </div>
        {children}
        <div className="mt-6 border-t border-slate-200 pt-5 text-center text-sm text-slate-600">
          Đã có tài khoản? <Link to="/login" className="text-primary-700 font-medium hover:underline">Đăng nhập</Link>
        </div>
      </Card>
    </AuthLayout>
  );
}
