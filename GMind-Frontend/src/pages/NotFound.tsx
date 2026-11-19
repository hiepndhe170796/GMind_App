import { Link } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import AuthLayout from '../layouts/AuthLayout';
import { authService } from '../services/auth';

export default function NotFound() {
  const loggedIn = authService.isLoggedIn();
  const content = (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">Không tìm thấy trang</h1>
        <p className="mt-2 text-sm text-slate-600">Địa chỉ bạn truy cập không tồn tại hoặc đã bị di chuyển.</p>
        <Link to={loggedIn ? '/dashboard' : '/login'} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary-700 px-5 text-sm font-semibold text-white hover:bg-primary-800">{loggedIn ? 'Về Tổng quan' : 'Về Đăng nhập'}</Link>
      </div>
    </div>
  );
  return loggedIn ? <MainLayout>{content}</MainLayout> : <AuthLayout>{content}</AuthLayout>;
}