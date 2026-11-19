import type { ReactNode } from 'react';
import Logo from '../components/ui/Logo';
import Icon from '../components/ui/Icon';

interface AuthLayoutProps { children: ReactNode; wide?: boolean }

const STEPS: { label: string; state: 'done' | 'current' | 'upcoming' }[] = [
  { label: 'Cần làm', state: 'done' },
  { label: 'Đang làm', state: 'done' },
  { label: 'Chờ duyệt', state: 'current' },
  { label: 'Hoàn thành', state: 'upcoming' },
];

export default function AuthLayout({ children, wide = false }: AuthLayoutProps) {
  return (
    <main className="app-surface min-h-screen bg-white lg:grid lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
      <aside className="hidden lg:flex flex-col justify-between gap-10 bg-gradient-to-br from-primary-700 via-primary-800 to-accent-800 p-10 xl:p-14 text-white">
        <div className="flex items-center gap-3">
          <Logo size="lg" tone="onDark" />
          <span className="text-xl font-bold">GMind</span>
        </div>
        <div>
          <h2 className="max-w-[16ch] text-display font-bold">Cả nhóm biết ai đang làm gì, việc nào đang chờ ai.</h2>
          <p className="mt-4 max-w-[44ch] text-body text-primary-100">GMind gom nhóm, dự án, công việc và hạn nộp vào một nơi để Leader điều phối và mọi thành viên theo kịp.</p>
          <div aria-hidden="true" className="mt-8 w-full max-w-md rounded-2xl bg-white p-4 text-ink shadow-overlay">
            <p className="text-small font-semibold">Báo cáo chương 2</p>
            <p className="mt-0.5 text-caption text-ink-muted">Hạn 18:00 · Thứ Sáu</p>
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {STEPS.map(st => (
                <div key={st.label} aria-current={st.state === 'current' ? 'step' : undefined}>
                  <div className={`h-1.5 rounded-full ${st.state === 'done' ? 'bg-primary-500' : st.state === 'current' ? 'bg-accent-500' : 'bg-line'}`} />
                  <div className={`mt-1.5 text-caption ${st.state === 'current' ? 'font-semibold text-accent-700' : 'text-ink-muted'}`}>{st.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-caption text-ink-muted">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">AN</span>
                Người làm
              </span>
              <span className="flex items-center gap-1.5 text-caption text-ink-muted">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-100 text-[10px] font-bold text-accent-700">MH</span>
                Leader duyệt
              </span>
            </div>
          </div>
          <ul className="mt-8 space-y-2.5">
            {['Giao việc, đặt hạn và theo dõi tiến độ theo từng dự án',
              'Nộp kết quả để Leader duyệt hoặc yêu cầu chỉnh sửa',
              'Nhờ hỗ trợ, chuyển giao hoặc đổi việc khi nhóm cần'].map(t => (
              <li key={t} className="flex items-start gap-2 text-small text-primary-50">
                <Icon name="check" size={15} className="mt-0.5 shrink-0 text-accent-200" /><span className="[text-wrap:pretty]">{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-caption text-primary-200">Dành cho nhóm sinh viên làm dự án.</p>
      </aside>
      <div className="flex min-h-screen flex-col items-center justify-start px-4 pb-10 pt-12 sm:justify-center sm:px-8 sm:py-10 lg:py-12">
        <div className={`mb-8 flex w-full items-center gap-3 lg:hidden ${wide ? 'max-w-xl' : 'max-w-md'}`}>
          <Logo size="md" />
          <span>
            <span className="block font-bold text-ink leading-tight">GMind</span>
            <span className="block text-small text-ink-muted">Quản lý dự án nhóm sinh viên</span>
          </span>
        </div>
        <div className={`w-full ${wide ? 'max-w-xl' : 'max-w-md'}`}>{children}</div>
      </div>
    </main>
  );
}
