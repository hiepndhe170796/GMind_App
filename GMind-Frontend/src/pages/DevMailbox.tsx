import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AuthLayout from '../layouts/AuthLayout';
import Icon from '../components/ui/Icon';
import { authService, type MailboxMetaDto } from '../services/auth';
import { formatDateTime } from '../utils/presentation';
import { errMsg } from '../components/workspace/utils';

function MailItem({ mail }: { mail: MailboxMetaDto }) {
  const [open, setOpen] = useState(false);
  const detailQ = useQuery({
    queryKey: ['dev-mailbox', mail.id],
    queryFn: () => authService.devMailboxMessage(mail.id),
    enabled: open,
    retry: false,
  });
  return (
    <li className="rounded-xl border border-line bg-surface">
      <div className="px-4 py-3">
        <p className="text-sm font-medium text-ink">{mail.subject}</p>
        <p className="mt-0.5 text-caption text-ink-muted">Tới: {mail.to} · {formatDateTime(mail.createdAt)}</p>
        {mail.links.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {mail.links.map((l, i) => (
              <a key={l.url} href={l.url}
                className={`inline-flex min-h-8 items-center gap-1 rounded-lg px-3 py-1 text-sm font-medium ${
                  i === 0 ? 'bg-primary-600 text-white hover:bg-primary-700' : 'bg-primary-50 text-primary-700 hover:bg-primary-100'
                }`}>
                {l.label}
              </a>
            ))}
          </div>
        )}
      </div>
      <details className="border-t border-line" onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-ink-secondary hover:text-ink">Xem nội dung</summary>
        <div className="px-4 pb-4">
          {detailQ.isPending && <p role="status" className="py-4 text-center text-sm text-ink-muted">Đang tải nội dung…</p>}
          {detailQ.isError && <p role="alert" className="py-2 text-sm text-danger-700">Không đọc được nội dung thư.</p>}
          {detailQ.data && (
            <iframe sandbox="" srcDoc={detailQ.data.html} title="Nội dung thư"
              className="h-[28rem] w-full rounded-lg border border-line bg-white" />
          )}
        </div>
      </details>
    </li>
  );
}

export default function DevMailbox() {
  const listQ = useQuery({
    queryKey: ['dev-mailbox'],
    queryFn: () => authService.devMailbox(),
    retry: false,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  });
  const mails = listQ.data;

  return (
    <AuthLayout>
      <div className="space-y-4">
        <header>
          <h1 className="text-title font-semibold text-ink"><Icon name="mail-open" size={22} className="mr-2 inline-block align-[-3px] text-primary-600" />Hộp thư dev</h1>
          <p className="mt-1 text-sm text-ink-secondary">Email hệ thống gửi trong môi trường phát triển được lưu ở đây thay vì gửi đi thật.</p>
        </header>
        {listQ.isError && (
          <p role="alert" className="rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700">
            Không đọc được hộp thư dev. Kiểm tra API đang chạy ở môi trường Development.
            <span className="block mt-1 text-caption">{errMsg(listQ.error, '')}</span>
          </p>
        )}
        {mails && !listQ.isError && (
          mails.length === 0 ? (
            <p className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-sm text-ink-secondary">Chưa có thư nào.</p>
          ) : (
            <ul className="space-y-3" aria-label="Danh sách email">
              {mails.map(m => <MailItem key={m.id} mail={m} />)}
            </ul>
          )
        )}
        {!mails && !listQ.isError && (
          <p className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-sm text-ink-secondary" role="status">Đang tải hộp thư…</p>
        )}
      </div>
    </AuthLayout>
  );
}
