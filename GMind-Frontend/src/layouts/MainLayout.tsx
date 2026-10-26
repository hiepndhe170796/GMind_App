import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../services/auth';
import { notificationsService } from '../services/notifications';

interface MainLayoutProps {
  children: ReactNode;
}

const MainLayout = ({ children }: MainLayoutProps) => {
  const navigate = useNavigate();
  const user = authService.currentUser();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (user) notificationsService.unreadCount().then(setUnread).catch(() => {});
  }, []);

  const logout = async () => {
    const result = await authService.logout();
    if (authService.isLoggedIn()) return;
    navigate('/login', {
      replace: true,
      state: result.serverRevoked ? undefined : { logoutWarning: 'Đã đăng xuất trên trình duyệt này. Chưa thể xác nhận thu hồi phiên trên máy chủ; vui lòng kiểm tra kết nối.' },
    });
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <header className="bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/dashboard" className="text-2xl font-bold text-primary-600 dark:text-primary-400">GMind</Link>
            <nav className="flex items-center gap-4">
              <Link to="/dashboard" className="text-neutral-600 dark:text-neutral-400 hover:text-primary-600">Nhóm</Link>
              <Link to="/my-tasks" className="text-neutral-600 dark:text-neutral-400 hover:text-primary-600">Task của tôi</Link>
              <Link to="/calendar" className="text-neutral-600 dark:text-neutral-400 hover:text-primary-600">Lịch</Link>
              <Link to="/notifications" className="text-neutral-600 dark:text-neutral-400 hover:text-primary-600">
                Thông báo{unread > 0 && <span className="ml-1 inline-flex items-center justify-center w-5 h-5 text-xs bg-danger-500 text-white rounded-full">{unread}</span>}
              </Link>
              <span className="text-sm text-neutral-500">{user?.displayName}</span>
              <button onClick={logout} className="text-sm text-danger-600 hover:underline">Đăng xuất</button>
            </nav>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
};

export default MainLayout;
