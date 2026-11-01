import type { ReactNode } from 'react';
import './auth.css';

interface AuthLayoutProps { children: ReactNode; wide?: boolean }

export default function AuthLayout({ children, wide = false }: AuthLayoutProps) {
  return (
    <main className="auth-surface flex min-h-screen justify-center bg-[#f5f7fb] px-4 py-8 sm:items-center sm:py-12">
      <div className={`w-full ${wide ? 'max-w-xl' : 'max-w-md'}`}>
        <div className="mb-8 flex items-center justify-center gap-3">
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-xl font-bold text-white">G</span>
          <div>
            <span className="block text-2xl font-bold tracking-tight text-slate-900">GMind</span>
            <p className="mt-0.5 text-sm text-slate-600">Quản lý dự án nhóm sinh viên</p>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
