import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../services/auth';

interface MainLayoutProps {
  children: ReactNode;
}

const MainLayout = ({ children }: MainLayoutProps) => {
  const navigate = useNavigate();
  const user = authService.currentUser();

  const logout = async () => {
    await authService.logout();
    navigate('/login');
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
