import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../components/ui/Toast';
import { useCurrentUserId } from './use-current-user-id';
import { qk } from '../services/query-keys';
import { tasksService } from '../services/tasks';
import { errMsg, status } from '../components/workspace/utils';

/** Task IDs reminded this session (200 or 409) — renders as "Đã nhắc" so a second click can't repeat the 409. Exported for tests to reset. */
export const remindedTaskIds = new Set<string>();

interface Vars { taskId: string; name: string }

/** Shared "Nhắc" mutation + toasts + invalidation for MemberDetail and TaskDetail. */
export function useRemindTask(opts: { groupId?: string; memberId?: string } = {}) {
  const me = useCurrentUserId() ?? '';
  const toast = useToast();
  const qc = useQueryClient();
  const [remindingId, setRemindingId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (v: Vars) => tasksService.remind(v.taskId),
    onSuccess: async (_d, v) => {
      remindedTaskIds.add(v.taskId);
      toast.success(`Đã gửi nhắc nhở tới ${v.name}.`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.leaderQueue(me) }),
        qc.invalidateQueries({ queryKey: qk.task(me, v.taskId) }),
        ...(opts.groupId && opts.memberId
          ? [qc.invalidateQueries({ queryKey: qk.memberOverview(me, opts.groupId, opts.memberId) })]
          : []),
      ]);
    },
    onError: (e: unknown, v) => {
      if (status(e) === 409) remindedTaskIds.add(v.taskId);
      toast.error(errMsg(e, 'Không gửi được nhắc nhở.'));
    },
    onSettled: () => setRemindingId(null),
  });

  const isReminded = (taskId: string) => remindedTaskIds.has(taskId);
  const remindTask = (taskId: string, name: string) => {
    if (remindingId || isReminded(taskId)) return;
    setRemindingId(taskId);
    mutation.mutate({ taskId, name });
  };

  return { remindTask, remindingId, isReminded, pending: mutation.isPending };
}
