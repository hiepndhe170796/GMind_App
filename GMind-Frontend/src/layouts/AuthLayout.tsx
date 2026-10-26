import type { ReactNode } from 'react';

const AuthLayout = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen bg-[#f5f7fb] flex items-center justify-center p-4">
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <span className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-500 text-white text-2xl font-bold mb-3">G</span>
        <h1 className="text-3xl font-bold text-slate-900">GMind</h1>
        <p className="text-sm text-slate-500 mt-1">Quản lý dự án nhóm sinh viên</p>
      </div>
      {children}
    </div>
  </div>
);

export default AuthLayout;
