import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ConfirmationDialog from '../workspace/ConfirmationDialog';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useToast } from '../ui/Toast';
import { useCurrentUserId } from '../../hooks/use-current-user-id';
import { qk } from '../../services/query-keys';
import { groupsService, type GroupSettingsDto } from '../../services/groups';
import { errMsg } from '../workspace/utils';
import { formatDateTime } from '../../utils/presentation';

const DEFAULTS = { riskHoursBeforeDeadline: 8, riskProgressBelowPercent: 70, staleAfterHours: 24 };
const RANGES = {
  riskHoursBeforeDeadline: { min: 1, max: 168, label: 'Cảnh báo trước hạn', unit: 'giờ', hint: 'Mặc định 8 giờ.' },
  riskProgressBelowPercent: { min: 1, max: 100, label: 'Khi tiến độ dưới', unit: '%', hint: 'Mặc định 70%.' },
  staleAfterHours: { min: 1, max: 720, label: 'Đình trệ sau', unit: 'giờ không cập nhật', hint: 'Mặc định 24 giờ.' },
} as const;
type Field = keyof typeof RANGES;

export default function GroupSettingsDialog({ groupId, open, onClose, onSaved }: {
  groupId: string; open: boolean; onClose: () => void; onSaved?: () => void;
}) {
  const me = useCurrentUserId() ?? '';
  const toast = useToast();
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<Field, string>>({ ...map(DEFAULTS) });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [serverError, setServerError] = useState('');

  const settingsQ = useQuery({
    queryKey: qk.groupSettings(me, groupId),
    queryFn: () => groupsService.getSettings(groupId),
    enabled: open && !!me && !!groupId,
  });
  const s = settingsQ.data;

  // sync loaded/defaults into the form whenever the dialog opens fresh; reset on close
  const [seededFor, setSeededFor] = useState<GroupSettingsDto | undefined>(undefined);
  if (!open && seededFor !== undefined) setSeededFor(undefined);
  if (open && s && seededFor !== s) {
    setSeededFor(s);
    setValues(map(s));
    setErrors({}); setServerError('');
  }

  const save = useMutation({
    mutationFn: (v: { riskHoursBeforeDeadline: number; riskProgressBelowPercent: number; staleAfterHours: number }) =>
      groupsService.updateSettings(groupId, v),
    onSuccess: async () => {
      toast.success('Đã lưu cài đặt cảnh báo.');
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.groupSettings(me, groupId) }),
        qc.invalidateQueries({ queryKey: qk.leaderQueue(me) }),
        qc.invalidateQueries({ queryKey: qk.myTasks(me) }),
        qc.invalidateQueries({ queryKey: qk.group(me, groupId) }),
        qc.invalidateQueries({ queryKey: qk.groupWorkspace(me, groupId) }),
      ]);
      onSaved?.();
      onClose();
    },
    onError: (e: unknown) => setServerError(errMsg(e, 'Không lưu được cài đặt.')),
  });

  const parse = (): Record<Field, number> | null => {
    const next: Partial<Record<Field, string>> = {};
    const out = {} as Record<Field, number>;
    for (const f of Object.keys(RANGES) as Field[]) {
      const r = RANGES[f];
      const raw = values[f].trim();
      const n = Number(raw);
      if (!raw || !Number.isInteger(n)) next[f] = 'Nhập một số nguyên.';
      else if (n < r.min || n > r.max) next[f] = `Từ ${r.min} đến ${r.max}.`;
      else out[f] = n;
    }
    setErrors(next);
    return Object.keys(next).length ? null : out;
  };

  const submit = () => {
    setServerError('');
    const v = parse();
    if (v && !save.isPending) save.mutate(v);
  };

  const resetDefaults = () => { setValues(map(DEFAULTS)); setErrors({}); setServerError(''); };

  const liveValue = (f: Field): number | '…' => {
    const n = Number(values[f]);
    const r = RANGES[f];
    return Number.isInteger(n) && n >= r.min && n <= r.max ? n : '…';
  };

  return (
    <ConfirmationDialog open={open} title="Cài đặt cảnh báo" onClose={onClose} busy={save.isPending}>
      {settingsQ.isPending ? (
        <div aria-hidden="true" className="space-y-3 motion-safe:animate-pulse">
          <p role="status" className="sr-only">Đang tải cài đặt…</p>
          {[0, 1, 2].map(i => <div key={i} className="h-16 rounded-lg bg-surface-subtle" />)}
        </div>
      ) : settingsQ.isError ? (
        <div>
          <p role="alert" className="text-small text-danger-700">{errMsg(settingsQ.error, 'Không tải được cài đặt.')}</p>
          <Button variant="secondary" className="mt-3" onClick={() => void settingsQ.refetch()}>Thử lại</Button>
        </div>
      ) : (
        <form noValidate onSubmit={e => { e.preventDefault(); submit(); }}>
          <p className="text-small text-ink-secondary">
            Công việc bị đánh dấu có nguy cơ khi còn dưới {liveValue('riskHoursBeforeDeadline')} giờ đến hạn
            và tiến độ dưới {liveValue('riskProgressBelowPercent')}%.
          </p>
          <div className="mt-4 space-y-4">
            {(Object.keys(RANGES) as Field[]).map(f => {
              const r = RANGES[f];
              return (
                <Input key={f} id={`gs-${f}`} label={`${r.label} (${r.unit})`} inputMode="numeric" value={values[f]}
                  disabled={save.isPending} error={errors[f]} hint={r.hint}
                  onChange={e => { setValues(v => ({ ...v, [f]: e.target.value })); if (errors[f]) setErrors(x => ({ ...x, [f]: undefined })); }} />
              );
            })}
          </div>
          {serverError && <p role="alert" className="mt-3 text-small text-danger-700 [overflow-wrap:anywhere]">{serverError}</p>}
          {s && !s.isDefault && s.updatedByName && (
            <p className="mt-3 text-caption text-ink-muted">
              Cập nhật lần cuối bởi {s.updatedByName} lúc {formatDateTime(s.updatedAt)}.
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="ghost" disabled={save.isPending} onClick={resetDefaults}>Khôi phục mặc định</Button>
            <span className="flex items-center gap-2">
              <Button type="button" variant="secondary" disabled={save.isPending} onClick={onClose}>Hủy</Button>
              <Button type="submit" isLoading={save.isPending} disabled={save.isPending}>Lưu</Button>
            </span>
          </div>
        </form>
      )}
    </ConfirmationDialog>
  );
}

const map = (s: Pick<GroupSettingsDto, 'riskHoursBeforeDeadline' | 'riskProgressBelowPercent' | 'staleAfterHours'>): Record<Field, string> => ({
  riskHoursBeforeDeadline: String(s.riskHoursBeforeDeadline),
  riskProgressBelowPercent: String(s.riskProgressBelowPercent),
  staleAfterHours: String(s.staleAfterHours),
});
