import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '../../layouts/MainLayout';

export default function AccountLayout({ page, children }: { page: 'profile' | 'settings'; children: ReactNode }) {
  const profile = page === 'profile';
  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-5">
          <h2 className="text-title font-semibold text-ink">{profile ? 'Hồ sơ' : 'Cài đặt'}</h2>
          <p className="mt-1 text-sm text-ink-secondary">{profile ? 'Thông tin giúp mọi người nhận ra bạn trong GMind.' : 'Quản lý bảo mật, phiên đăng nhập và thông báo.'}</p>
        </header>
        <nav aria-label="Tài khoản" className="mb-5 flex gap-2 border-b border-line">
          {([['profile', 'Hồ sơ'], ['settings', 'Cài đặt']] as const).map(([key, label]) => (
            <Link key={key} to={`/${key}`} aria-current={page === key ? 'page' : undefined}
              className={`inline-flex min-h-11 items-center border-b-2 px-4 text-sm ${page === key ? 'border-primary-600 font-semibold text-primary-700' : 'border-transparent font-medium text-ink-secondary hover:text-ink'}`}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="space-y-6">
          {children}
        </div>
      </div>
    </MainLayout>
  );
}
