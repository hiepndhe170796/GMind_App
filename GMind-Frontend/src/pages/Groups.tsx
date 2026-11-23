import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import MainLayout from '../layouts/MainLayout';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button, { buttonClasses } from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import { Skeleton, ErrorState, EmptyState } from '../components/workspace/WorkspaceUI';
import { errMsg } from '../components/workspace/utils';
import ConfirmationDialog from '../components/workspace/ConfirmationDialog';
import { groupsService, type ArchivedGroupDto } from '../services/groups';
import { qk } from '../services/query-keys';
import { useToast } from '../components/ui/Toast';
import { useCurrentUserId } from '../hooks/use-current-user-id';
import { formatDate } from '../utils/presentation';

const ROLE_LABEL: Record<string, string> = { Leader: 'Trưởng nhóm', Member: 'Thành viên' };

export default function Groups() {
  const me = useCurrentUserId();
  const toast = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [restoring, setRestoring] = useState<ArchivedGroupDto | null>(null);
  const [restoreError, setRestoreError] = useState('');

  const groupsQ = useQuery({
    queryKey: qk.myGroups(me ?? ''),
    queryFn: () => groupsService.myGroups(),
    enabled: !!me,
  });
  const archivedQ = useQuery({
    queryKey: qk.archivedGroups(me ?? ''),
    queryFn: () => groupsService.archivedGroups(),
    enabled: !!me,
  });
  const restoreM = useMutation({
    mutationFn: (groupId: string) => groupsService.restoreGroup(groupId),
    onSuccess: () => {
      toast.success('Đã khôi phục nhóm.');
      setRestoring(null);
      void qc.invalidateQueries({ queryKey: qk.myGroups(me ?? '') });
      void qc.invalidateQueries({ queryKey: qk.archivedGroups(me ?? '') });
    },
    onError: e => setRestoreError(errMsg(e, 'Không khôi phục được nhóm.')),
  });

  const groups = groupsQ.data;
  const archived = archivedQ.data ?? [];
  const filtered = useMemo(() => (groups ?? []).filter(g =>
    (!role || g.myRole === role) &&
    (!search || `${g.name} ${g.description ?? ''}`.toLowerCase().includes(search.toLowerCase()))),
    [groups, role, search]);
  const hasFilters = !!search || !!role;

  return (
    <MainLayout>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-title font-semibold text-ink">Nhóm của tôi</h2>
            <p className="mt-2 text-base text-ink-secondary">Các nhóm bạn đang tham gia và vai trò của bạn.</p>
          </div>
          <Link to="/join-group" className={buttonClasses({ className: 'gap-1.5' })}>
            <Icon name="plus" size={16} />Tạo / tham gia nhóm
          </Link>
        </header>

        {groupsQ.isPending ? <Skeleton label="Đang tải nhóm…" /> : groupsQ.isError ? (
          <Card className="p-4 sm:p-6"><ErrorState message={errMsg(groupsQ.error, 'Không tải được danh sách nhóm')} onRetry={() => void groupsQ.refetch()} /></Card>
        ) : !groups?.length ? (
          <Card className="p-4 sm:p-6">
            <EmptyState illustration="groups" title="Bạn chưa thuộc nhóm nào"
              body="Tạo nhóm mới để làm Leader, hoặc tham gia bằng mã mời để làm thành viên."
              action={<Link to="/join-group" className="min-h-11 inline-flex items-center text-primary-700 font-medium hover:underline">Tạo hoặc tham gia nhóm</Link>} />
          </Card>
        ) : (
          <>
            <form className="flex flex-wrap items-end gap-3" role="search" onSubmit={e => { e.preventDefault(); setSearch(q.trim()); }}>
              <div className="min-w-0 w-full sm:flex-1 sm:max-w-xs">
                <label htmlFor="groups-q" className="block text-sm font-medium text-ink-secondary mb-1">Tìm nhóm</label>
                <input id="groups-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Tên hoặc mô tả nhóm"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary-600" />
              </div>
              <div className="min-w-0">
                <label htmlFor="groups-role" className="block text-sm font-medium text-ink-secondary mb-1">Vai trò</label>
                <select id="groups-role" value={role} onChange={e => setRole(e.target.value)}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary-600">
                  <option value="">Tất cả vai trò</option>
                  <option value="Leader">Trưởng nhóm</option>
                  <option value="Member">Thành viên</option>
                </select>
              </div>
              <Button type="submit" variant="secondary" className="min-h-11">Tìm</Button>
              {hasFilters && (
                <button type="button" className="min-h-9 max-sm:min-h-11 max-sm:-my-1 text-primary-700 font-medium hover:underline"
                  onClick={() => { setQ(''); setSearch(''); setRole(''); }}>Xóa lọc</button>
              )}
            </form>
            <p role="status" aria-live="polite" className="text-sm text-ink-secondary">
              {filtered.length ? `${filtered.length} nhóm` : '0 nhóm phù hợp'}
            </p>
            {filtered.length === 0 ? (
              <Card className="p-4 sm:p-6">
                <EmptyState illustration="search" title="Không có nhóm khớp bộ lọc" body="Thử từ khóa hoặc vai trò khác."
                  action={<button className="min-h-9 max-sm:min-h-11 max-sm:-my-1 text-primary-700 font-medium hover:underline" onClick={() => { setQ(''); setSearch(''); setRole(''); }}>Xóa bộ lọc</button>} />
              </Card>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map(g => (
                  <li key={g.id} className="min-w-0">
                    <Link to={`/groups/${g.id}`} className="group block h-full min-w-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600">
                      <Card className="h-full p-4 sm:p-5 transition-colors group-hover:border-primary-300">
                        <div className="flex items-start justify-between gap-3 min-w-0">
                          <h3 title={g.name} className="min-w-0 text-base font-semibold text-ink line-clamp-2 [overflow-wrap:anywhere] group-hover:text-primary-700">{g.name}</h3>
                          <Icon name="chevron-right" size={18} className="mt-0.5 shrink-0 text-ink-muted" />
                        </div>
                        {g.description && <p className="mt-1.5 line-clamp-2 text-sm text-ink-secondary [overflow-wrap:anywhere]">{g.description}</p>}
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <Badge value={g.myRole}>{ROLE_LABEL[g.myRole] ?? g.myRole}</Badge>
                          <span className="text-sm text-ink-secondary">{g.memberCount} thành viên</span>
                        </div>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {archived.length > 0 && (
          <details open={archivedOpen} onToggle={e => setArchivedOpen((e.target as HTMLDetailsElement).open)}
            className="group rounded-2xl border border-line bg-surface-subtle">
            <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-ink">
              Nhóm đã lưu trữ ({archived.length})
              <Icon name="chevron-down" size={16} className="transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <ul className="divide-y divide-line border-t border-line">
              {archived.map(g => (
                <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 min-w-0">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink [overflow-wrap:anywhere]">{g.name}</span>
                    <span className="text-xs text-ink-secondary">
                      Lưu trữ {formatDate(g.archivedAt)}{g.archivedByName ? ` bởi ${g.archivedByName}` : ''} · {g.memberCount} thành viên · {g.projectCount} dự án
                    </span>
                  </span>
                  <Badge value={g.myRole}>{ROLE_LABEL[g.myRole] ?? g.myRole}</Badge>
                  {g.canRestore && (
                    <Button size="sm" variant="secondary" className="min-h-9"
                      onClick={() => { setRestoreError(''); setRestoring(g); }}>Khôi phục</Button>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <ConfirmationDialog open={!!restoring} busy={restoreM.isPending}
        onClose={() => { if (!restoreM.isPending) setRestoring(null); }} title="Khôi phục nhóm">
        <p>Khôi phục nhóm "{restoring?.name}"? Mọi thành viên sẽ truy cập lại được nội dung nhóm.</p>
        {restoreError && <p role="alert" className="mt-3 text-sm text-danger-700">{restoreError}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button className="min-h-11" disabled={restoreM.isPending} isLoading={restoreM.isPending}
            onClick={() => restoring && restoreM.mutate(restoring.id)}>Khôi phục</Button>
          <Button variant="secondary" className="min-h-11" disabled={restoreM.isPending} onClick={() => setRestoring(null)}>Hủy</Button>
        </div>
      </ConfirmationDialog>
    </MainLayout>
  );
}
