import type { ReactNode } from 'react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authService } from '../services/auth';
import { getSessionSnapshot, subscribeSession, type UserInfo } from '../services/session';
import { NotificationCountProvider } from '../components/notifications/NotificationCountProvider';
import UserAvatar from '../components/account/UserAvatar';
import { useNotificationCount } from '../components/notifications/useNotificationCount';
import Icon, { type IconName } from '../components/ui/Icon';

interface MainLayoutProps {
  children: ReactNode;
  contentWidth?: 'standard' | 'fluid';
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
  [/^\/profile(?:\/|$)/, 'Hồ sơ'],
  [/^\/settings(?:\/|$)/, 'Cài đặt'],
];

const Brand = ({ className = '' }: { className?: string }) => (
  <Link to="/dashboard" className={`flex items-center gap-3 px-5 h-16 border-b border-[#e7ecf4] shrink-0 ${className}`}>
    <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary-600 text-white font-bold text-lg">G</span>
    <span>
      <span className="block font-bold text-slate-900 leading-tight">GMind</span>
      <span className="block text-xs text-slate-600">Không gian làm việc</span>
    </span>
  </Link>
);

const UserFooter = ({ user, onLogout, pending }: { user: UserInfo | null; onLogout: () => void; pending: boolean }) => {
  const { pathname } = useLocation();
  const active = pathname === '/profile' || pathname === '/settings';
  return (
  <div className="border-t border-[#e7ecf4] p-4 flex items-center gap-2 min-w-0 shrink-0">
    <Link to="/profile" aria-label="Hồ sơ và cài đặt" aria-current={pathname === '/profile' ? 'page' : undefined}
      title="Hồ sơ và cài đặt"
      className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 ${active ? 'bg-primary-50' : 'hover:bg-slate-50'}`}>
      <UserAvatar name={user?.displayName ?? '?'} url={user?.avatarUrl} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-800">{user?.displayName}</span>
        <span className="block truncate text-xs text-slate-600">{user?.email}</span>
      </span>
    </Link>
    <button onClick={onLogout} aria-label="Đăng xuất" title="Đăng xuất" disabled={pending}
      className="p-2.5 min-w-11 min-h-11 rounded-lg text-slate-600 hover:text-danger-700 hover:bg-slate-50 transition-colors disabled:opacity-50">
      <Icon name="logout" size={18} />
    </button>
  </div>
  );
};

const NavItems = ({ section, onNavigate }: { section?: string; onNavigate?: () => void }) => (
  <nav aria-label="Điều hướng chính" className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-1">
    {NAV.map(item => {
      const active = section === item.to;
      return (
        <Link key={item.to} to={item.to} onClick={onNavigate} aria-current={active ? 'page' : undefined}
          className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${active ? 'bg-primary-50 text-primary-700 font-semibold ring-1 ring-inset ring-primary-200' : 'font-medium text-slate-600 hover:bg-slate-50'}`}>
          <Icon name={item.icon} size={19} />
          {item.label}
        </Link>
      );
    })}
  </nav>
);

const MainLayoutShell = ({ children, contentWidth }: MainLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot);
  const user = session?.user ?? null;
  const { count: unread, error: unreadError } = useNotificationCount();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [lastKey, setLastKey] = useState(location.key);

  const hint = (location.state as { navigationSection?: unknown } | null)?.navigationSection;
  const section = location.pathname.startsWith('/tasks/')
    ? (hint === '/dashboard' ? '/dashboard' : hint === '/groups' ? '/groups' : hint === '/calendar' ? '/calendar' : hint === '/notifications' ? '/notifications' : '/my-tasks')
    : /^(\/groups(?:\/|$)|\/projects\/|\/join-group(?:\/|$))/.test(location.pathname) ? '/groups'
    : NAV.find(item => location.pathname === item.to || location.pathname.startsWith(item.to + '/'))?.to;

  if (lastKey !== location.key) {
    setLastKey(location.key);
    if (menuOpen) setMenuOpen(false);
  }

  useEffect(() => {
    if (menuOpen) dialogRef.current?.showModal(); else if (dialogRef.current?.open) dialogRef.current?.close();
    return undefined;
  }, [menuOpen]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    if (menuOpen) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [menuOpen]);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => { if (mq.matches) setMenuOpen(false); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const result = await authService.logout();
      if (authService.isLoggedIn()) return;
      navigate('/login', {
        replace: true,
        state: result.serverRevoked ? undefined : { logoutWarning: 'Đã đăng xuất trên trình duyệt này. Chưa thể xác nhận thu hồi phiên trên máy chủ; vui lòng kiểm tra kết nối.' },
      });
    } finally {
      setLoggingOut(false);
    }
  };

  const title = TITLES.find(([re]) => re.test(location.pathname))?.[1] ?? 'GMind';
  const [headerNow, setHeaderNow] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setHeaderNow(Date.now());
    const timer = setInterval(update, 60000);
    window.addEventListener('focus', update);
    return () => { clearInterval(timer); window.removeEventListener('focus', update); };
  }, []);
  const today = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(headerNow));

  return (
    <div className="min-h-screen">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-primary-700 focus:shadow-md">Đến nội dung chính</a>
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[232px] flex-col bg-white border-r border-[#e7ecf4] z-30">
        <Brand />
        <NavItems section={section} />
        <UserFooter user={user} onLogout={() => void logout()} pending={loggingOut} />
      </aside>

      <div className="lg:pl-[232px] flex flex-col min-h-screen min-w-0">
        <header className="sticky top-0 z-20 h-16 bg-white border-b border-[#e7ecf4] flex items-center gap-3 px-4 sm:px-8">
          <button className="lg:hidden p-2 -ml-1 rounded-lg text-slate-600 hover:bg-slate-100 min-h-11 min-w-11 flex items-center justify-center"
            aria-label="Mở menu" aria-haspopup="dialog" aria-expanded={menuOpen} aria-controls="mobile-nav-dialog"
            onClick={() => setMenuOpen(true)}>
            <Icon name="menu" size={22} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-slate-900 truncate">{title}</h1>
            <p className="hidden sm:block text-xs text-slate-600 capitalize">{today}</p>
          </div>
          <Link to="/notifications" aria-label={unread == null ? 'Thông báo, chưa cập nhật số chưa đọc' : `Thông báo, ${unread} chưa đọc${unreadError ? ', số liệu chưa làm mới' : ''}`}
            title={unreadError ? 'Chưa làm mới được số thông báo chưa đọc' : 'Mở thông báo'}
            className="relative p-2 rounded-lg text-slate-600 hover:bg-slate-100 min-h-11 min-w-11 flex items-center justify-center">
            <Icon name="bell" size={20} />
            {unread != null && unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-danger-700 text-white text-[12px] font-semibold flex items-center justify-center">{unread > 99 ? '99+' : unread}</span>
            )}
          </Link>
        </header>
        <main id="main-content" tabIndex={-1} className={`flex-1 w-full ${contentWidth === 'fluid' ? 'max-w-none' : 'max-w-[1440px]'} mx-auto px-4 sm:px-8 py-6 min-w-0`}>
          {children}
        </main>
      </div>

      <dialog ref={dialogRef} id="mobile-nav-dialog" aria-label="Menu điều hướng"
        className="m-0 h-[100dvh] max-h-[100dvh] w-[min(320px,100vw-32px)] p-0 backdrop:bg-slate-900/40"
        onClose={() => setMenuOpen(false)} onCancel={() => setMenuOpen(false)}
        onClick={e => { if (e.target === dialogRef.current) setMenuOpen(false); }}>
        <div className="flex flex-col h-full bg-white">
          <div className="flex items-center justify-between pr-3 shrink-0 border-b border-[#e7ecf4]">
            <Brand className="border-b-0 flex-1 min-w-0" />
            <button onClick={() => setMenuOpen(false)} aria-label="Đóng menu" className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 min-h-11 min-w-11 flex items-center justify-center">
              <Icon name="close" size={20} />
            </button>
          </div>
          <NavItems section={section} onNavigate={() => setMenuOpen(false)} />
          <UserFooter user={user} onLogout={() => void logout()} pending={loggingOut} />
        </div>
      </dialog>
    </div>
  );
};

const MainLayout = ({ children, contentWidth }: MainLayoutProps) => (
  <NotificationCountProvider key={authService.currentUser()?.id ?? ''} userId={authService.currentUser()?.id ?? ''}>
    <MainLayoutShell contentWidth={contentWidth}>{children}</MainLayoutShell>
  </NotificationCountProvider>
);

export default MainLayout;
