import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '../../layouts/MainLayout';
import './account.css';

export default function AccountLayout({ page, children }: { page: 'profile' | 'settings'; children: ReactNode }) {
  const profile = page === 'profile';
  return (
    <MainLayout>
      <div className="account-surface mx-auto w-full max-w-4xl">
        <header className="mb-5">
          <h2 className="text-2xl font-bold text-slate-900">{profile ? 'Hồ sơ' : 'Cài đặt'}</h2>
          <p className="mt-1 text-sm text-slate-600">{profile ? 'Thông tin giúp mọi người nhận ra bạn trong GMind.' : 'Quản lý mật khẩu và bảo vệ tài khoản của bạn.'}</p>
        </header>
        <nav aria-label="Tài khoản" className="mb-5 flex gap-2 border-b border-slate-200">
          {([['profile', 'Hồ sơ'], ['settings', 'Cài đặt']] as const).map(([key, label]) => (
            <Link key={key} to={`/${key}`} aria-current={page === key ? 'page' : undefined}
              className={`inline-flex min-h-11 items-center border-b-2 px-4 text-sm ${page === key ? 'border-primary-600 font-semibold text-primary-700' : 'border-transparent font-medium text-slate-600 hover:text-slate-900'}`}>
              {label}
            </Link>
          ))}
        </nav>
        <section aria-label={profile ? 'Thông tin hồ sơ' : 'Bảo mật tài khoản'} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {children}
        </section>
      </div>
    </MainLayout>
  );
}
