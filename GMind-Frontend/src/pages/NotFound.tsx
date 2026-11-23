import { Link } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import AuthLayout from '../layouts/AuthLayout';
import Illustration from '../components/ui/Illustration';
import { buttonClasses } from '../components/ui/Button';
import { authService } from '../services/auth';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function NotFound() {
  useDocumentTitle('Không tìm thấy trang');
  const loggedIn = authService.isLoggedIn();
  const content = (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="text-center">
        <Illustration name="lost" className="mx-auto h-[88px] w-[120px]" />
        <h1 className="mt-4 text-title font-semibold text-ink">Không tìm thấy trang</h1>
        <p className="mt-2 text-body text-ink-secondary">Địa chỉ bạn truy cập không tồn tại hoặc đã bị di chuyển.</p>
        <Link to={loggedIn ? '/dashboard' : '/login'} className={buttonClasses({ size: 'lg', className: 'mt-5' })}>{loggedIn ? 'Về Tổng quan' : 'Về Đăng nhập'}</Link>
      </div>
    </div>
  );
  return loggedIn ? <MainLayout>{content}</MainLayout> : <AuthLayout>{content}</AuthLayout>;
}
