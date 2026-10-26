import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { authService } from '../services/auth';
import { notificationsService } from '../services/notifications';
import Icon, { type IconName } from '../components/ui/Icon';

interface MainLayoutProps {
  children: ReactNode;
}

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/dashboard', label: 'Tổng quan', icon: 'overview' },
  { to: '/my-tasks', label: 'Việc của tôi', icon: 'tasks' },
  { to: '/groups', label: 'Nhóm của tôi', icon: 'users' },
  { to: '/calendar', label: 'Lịch công việc', icon: 'calendar' },
  { to: '/notifications', label: 'Thông báo', icon: 'bell' },
];

const TITLES: [RegExp, string][] = [
  [/^\/dashboard/, 'Tổng quan'],
  [/^\/my-tasks/, 'Việc của tôi'],
  [/^\/groups(\/.*)?$/, 'Nhóm của tôi'],
  [/^\/projects\//, 'Dự án'],
  [/^\/tasks\//, 'Chi tiết công việc'],
  [/^\/notifications/, 'Thông báo'],
  [/^\/calendar/, 'Lịch công việc'],
  [/^\/join-group/, 'Tham gia nhóm'],
];

const NavItems = ({ onNavigate }: { onNavigate?: () => void }) => (
  <nav className="flex-1 px-3 py-4 space-y-1">
    {NAV.map(item => (
      <NavLink key={item.to} to={item.to} onClick={onNavigate}
        className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-primary-50 text-primary-600' : 'text-slate-600 hover:bg-slate-50'}`}>
        <Icon name={item.icon} size={19} />
        {item.label}
      </NavLink>
    ))}
  </nav>
);

const Brand = () => (
  <Link to="/dashboard" className="flex items-center gap-3 px-5 h-16 border-b border-[#e7ecf4]">
    <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary-500 text-white font-bold text-lg">G</span>
    <span>
      <span className="block font-bold text-slate-900 leading-tight">GMind</span>
      <span className="block text-xs text-slate-400">Không gian làm việc</span>
    </span>
  </Link>
);

const UserFooter = ({ user, onLogout }: { user: { displayName: string; email: string } | null; onLogout: () => void }) => (
  <div className="border-t border-[#e7ecf4] p-4 flex items-center gap-3 min-w-0">
    <span className="flex items-center justify-center w-9 h-9 rounded-full bg-primary-100 text-primary-700 text-sm font-semibold shrink-0">
      {(user?.displayName || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium text-slate-800">{user?.displayName}</span>
      <span className="block truncate text-xs text-slate-400">{user?.email}</span>
    </span>
    <button onClick={onLogout} aria-label="Đăng xuất" title="Đăng xuất"
      className="p-2 rounded-lg text-slate-400 hover:text-danger-600 hover:bg-danger-50 transition-colors">
      <Icon name="logout" size={18} />
    </button>
  </div>
);

const MainLayout = ({ children }: MainLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = authService.currentUser();
  const [unread, setUnread] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (user) {
      notificationsService.unreadCount()
        .then(n => { if (!cancelled) setUnread(n); })
        .catch(() => { if (!cancelled) setUnread(null); });
    }
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => { dialogRef.current?.close(); }, [location.key]);

  const logout = async () => {
    const result = await authService.logout();
    if (authService.isLoggedIn()) return;
    navigate('/login', {
      replace: true,
      state: result.serverRevoked ? undefined : { logoutWarning: 'Đã đăng xuất trên trình duyệt này. Chưa thể xác nhận thu hồi phiên trên máy chủ; vui lòng kiểm tra kết nối.' },
    });
  };

  const title = TITLES.find(([re]) => re.test(location.pathname))?.[1] ?? 'GMind';
  const today = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

  return (
    <div className="min-h-screen">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[232px] flex-col bg-white border-r border-[#e7ecf4] z-30">
        <Brand />
        <NavItems />
        <UserFooter user={user} onLogout={() => void logout()} />
      </aside>

      <div className="lg:pl-[232px] flex flex-col min-h-screen min-w-0">
        <header className="sticky top-0 z-20 h-16 bg-white/90 backdrop-blur border-b border-[#e7ecf4] flex items-center gap-3 px-4 sm:px-8">
          <button className="lg:hidden p-2 -ml-1 rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Mở menu"
            onClick={() => dialogRef.current?.showModal()}>
            <Icon name="menu" size={22} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-slate-900 truncate">{title}</h1>
            <p className="hidden sm:block text-xs text-slate-400 capitalize">{today}</p>
          </div>
          <Link to="/notifications" aria-label="Thông báo" className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100">
            <Icon name="bell" size={20} />
            {unread != null && unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-danger-500 text-white text-[10px] font-semibold flex items-center justify-center">{unread}</span>
            )}
          </Link>
        </header>
        <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-8 py-6 min-w-0">
          {children}
        </main>
      </div>

      <dialog ref={dialogRef} aria-label="Menu điều hướng"
        className="m-0 h-full max-h-none w-[260px] p-0 backdrop:bg-slate-900/40"
        onClick={e => { if (e.target === dialogRef.current) dialogRef.current?.close(); }}>
        <div className="flex flex-col h-full bg-white">
          <div className="flex items-center justify-between pr-3">
            <Brand />
            <button onClick={() => dialogRef.current?.close()} aria-label="Đóng menu" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100">
              <Icon name="close" size={20} />
            </button>
          </div>
          <NavItems onNavigate={() => dialogRef.current?.close()} />
          <UserFooter user={user} onLogout={() => void logout()} />
        </div>
      </dialog>
    </div>
  );
};

export default MainLayout;
