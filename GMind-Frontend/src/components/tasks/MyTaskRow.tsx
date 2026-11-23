import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Badge from '../ui/Badge';
import { deadlineState } from '../../utils/task-time';
import { formatDate, STATUS_LABEL, PRIORITY_LABEL } from '../../utils/presentation';

/** Row shape shared by MyTasks, Dashboard "Việc của bạn" and the member overview. */
export interface TaskRowItem {
  id: string; title: string; status: string; priority: string;
  deadlineAt?: string | null; parentTaskId?: string | null; parentTitle?: string | null;
  projectName: string; progressPercent?: number | null;
  isAtRisk?: boolean; isStale?: boolean;
}

export default function MyTaskRow({ task, navState, action }: {
  task: TaskRowItem; navState?: object; action?: ReactNode;
}) {
  const dl = deadlineState(task.deadlineAt, task.status);
  return (
    <li className="relative flex flex-wrap items-center gap-3 px-4 sm:px-5 py-3.5 min-w-0">
      <span className="min-w-0 flex-1">
        <Link to={`/tasks/${task.id}`} state={navState} title={task.title}
          className="line-clamp-2 min-w-0 text-small font-medium text-ink hover:text-primary-700 [overflow-wrap:anywhere] after:absolute after:inset-0 after:content-['']">
          {task.title}
        </Link>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-ink-muted">
          {task.parentTaskId && task.parentTitle && <span>thuộc {task.parentTitle}</span>}
          <span>{task.projectName}</span>
          <span className={dl.kind === 'overdue' ? 'font-medium text-danger-700' : dl.kind === 'today' ? 'font-medium text-warning-700' : ''}>
            {dl.label || (task.deadlineAt ? formatDate(task.deadlineAt) : '')}
          </span>
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-2">
          <Badge value={task.status}>{STATUS_LABEL[task.status] ?? task.status}</Badge>
          <Badge value={task.priority}>{PRIORITY_LABEL[task.priority] ?? task.priority}</Badge>
          {task.isAtRisk && <Badge variant="warning">Có nguy cơ trễ</Badge>}
          {task.isStale && <Badge variant="warning">Đình trệ</Badge>}
          {!task.parentTaskId && task.progressPercent != null && task.status !== 'ToDo' && (
            <span className="inline-flex items-center gap-1.5" role="img" aria-label={`Tiến độ ${task.progressPercent}%`}>
              <span className="h-1.5 w-16 rounded-full bg-line">
                <span className="block h-1.5 rounded-full bg-primary-500" style={{ width: `${task.progressPercent}%` }} />
              </span>
              <span className="text-caption tabular-nums text-ink-muted">{task.progressPercent}%</span>
            </span>
          )}
        </span>
      </span>
      {action && <span className="relative z-10 max-sm:-my-1">{action}</span>}
    </li>
  );
}
