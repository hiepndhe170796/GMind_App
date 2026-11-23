import { useMemo, useState } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, rectIntersection,
  useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Link } from 'react-router-dom';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import StatusTransitionMenu from './StatusTransitionMenu';
import { deadlineState } from '../../utils/task-time';
import { STATUS_LABEL, PRIORITY_LABEL } from '../../utils/presentation';
import type { TaskSummaryDto } from '../../services/tasks';

// eslint-disable-next-line react/only-export-components -- column order shared with ProjectDetail filters
export const BOARD_COLUMNS = ['ToDo', 'InProgress', 'Submitted', 'ChangesRequested', 'Completed'] as const;

const initials = (n?: string | null) => (n || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

function TaskCardFace({ task }: { task: TaskSummaryDto }) {
  const dl = deadlineState(task.deadlineAt, task.status);
  return (
    <>
      <p className="line-clamp-2 text-small font-semibold text-ink [overflow-wrap:anywhere]">{task.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-caption text-ink-muted">
          <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-semibold text-primary-700">{initials(task.assigneeName)}</span>
          <span className="truncate">{task.assigneeName || 'Chưa giao'}</span>
        </span>
        <Badge value={task.priority}>{PRIORITY_LABEL[task.priority] ?? task.priority}</Badge>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption">
        {dl.label && <span className={dl.kind === 'overdue' ? 'font-medium text-danger-700' : dl.kind === 'today' ? 'font-medium text-warning-700' : 'text-ink-muted'}>{dl.label}</span>}
        {(task.subtaskCount ?? 0) > 0 && (
          <span className="tabular-nums text-ink-muted">{task.subtasksCompleted ?? 0}/{task.subtaskCount} con</span>
        )}
      </div>
      {task.progressPercent != null && (
        <div className="mt-2 flex items-center gap-2" role="img" aria-label={`Tiến độ ${task.progressPercent}%`}>
          <div className="h-1.5 flex-1 rounded-full bg-line">
            <div className="h-1.5 rounded-full bg-primary-500" style={{ width: `${task.progressPercent}%` }} />
          </div>
          <span className="text-caption tabular-nums text-ink-muted">{task.progressPercent}%</span>
        </div>
      )}
    </>
  );
}

function BoardCard({ task, justApproved, busy, onTransition }: {
  task: TaskSummaryDto; justApproved: boolean; busy: boolean;
  onTransition: (task: TaskSummaryDto, target: string) => void;
}) {
  const allowed = task.permissions?.allowedTransitions ?? [];
  const movable = allowed.length > 0;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled: !movable || busy,
  });
  return (
    <div ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={`relative rounded-xl border border-line bg-white p-3 ${isDragging ? 'opacity-40 shadow-none' : 'shadow-card'} ${justApproved ? 'motion-safe:animate-[gm-approve-pop_.6s_ease-out] ring-2 ring-success-300' : ''}`}>
      <div className="flex items-start gap-1">
        <Link to={`/tasks/${task.id}`}
          className="min-w-0 flex-1 text-small font-semibold text-ink hover:text-primary-700 [overflow-wrap:anywhere] after:absolute after:inset-0 after:content-['']">
          <span className="line-clamp-2">{task.title}</span>
        </Link>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-caption text-ink-muted">
          <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-semibold text-primary-700">{initials(task.assigneeName)}</span>
          <span className="truncate">{task.assigneeName || 'Chưa giao'}</span>
        </span>
        <Badge value={task.priority}>{PRIORITY_LABEL[task.priority] ?? task.priority}</Badge>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption">
        {deadlineState(task.deadlineAt, task.status).label && (
          <DeadlineLabel task={task} />
        )}
        {(task.subtaskCount ?? 0) > 0 && (
          <span className="tabular-nums text-ink-muted">{task.subtasksCompleted ?? 0}/{task.subtaskCount} con</span>
        )}
      </div>
      {task.progressPercent != null && (
        <div className="mt-2 flex items-center gap-2" role="img" aria-label={`Tiến độ ${task.progressPercent}%`}>
          <div className="h-1.5 flex-1 rounded-full bg-line">
            <div className="h-1.5 rounded-full bg-primary-500" style={{ width: `${task.progressPercent}%` }} />
          </div>
          <span className="text-caption tabular-nums text-ink-muted">{task.progressPercent}%</span>
        </div>
      )}
      {movable && (
        <div className="relative z-10 mt-2 flex items-center gap-1.5 max-sm:gap-2">
          <button type="button" {...attributes} {...listeners}
            aria-label={`Kéo thẻ "${task.title}" để chuyển trạng thái`}
            className="flex shrink-0 cursor-grab touch-none items-center justify-center rounded-md p-1 text-ink-muted hover:bg-surface-subtle hover:text-ink active:cursor-grabbing max-sm:h-11 max-sm:w-11 max-sm:rounded-lg max-sm:border max-sm:border-line max-sm:bg-surface max-sm:p-0">
            <Icon name="grip" size={14} className="max-sm:h-5 max-sm:w-5" />
          </button>
          <StatusTransitionMenu current={task.status} targets={allowed} busy={busy} align="left"
            onChoose={(t) => onTransition(task, t)} />
        </div>
      )}
    </div>
  );
}

function DeadlineLabel({ task }: { task: TaskSummaryDto }) {
  const dl = deadlineState(task.deadlineAt, task.status);
  return <span className={dl.kind === 'overdue' ? 'font-medium text-danger-700' : dl.kind === 'today' ? 'font-medium text-warning-700' : 'text-ink-muted'}>{dl.label}</span>;
}

function Column({ status, tasks, dimmed, highlighted, justApprovedId, busy, onTransition }: {
  status: string; tasks: TaskSummaryDto[]; dimmed: boolean; highlighted: boolean;
  justApprovedId: string | null; busy: boolean;
  onTransition: (task: TaskSummaryDto, target: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} data-status={status} data-drop-target={highlighted || undefined}
      className={`w-64 shrink-0 snap-start rounded-2xl p-3 transition-colors xl:w-auto xl:min-w-0 ${highlighted ? (isOver ? 'bg-primary-100 ring-2 ring-primary-400' : 'bg-primary-50 ring-2 ring-primary-300') : 'bg-surface-subtle'} ${dimmed ? 'opacity-50' : ''}`}>
      <h3 className="mb-3 flex items-center justify-between text-small font-semibold text-ink-secondary">
        {STATUS_LABEL[status] ?? status}
        <span className="tabular-nums font-normal text-ink-muted">{tasks.length}</span>
      </h3>
      <div className="space-y-2">
        {tasks.map(t => (
          <BoardCard key={t.id} task={t} justApproved={justApprovedId === t.id} busy={busy} onTransition={onTransition} />
        ))}
        {tasks.length === 0 && <p className="py-4 text-center text-caption text-ink-muted">Trống</p>}
      </div>
    </div>
  );
}

export default function KanbanBoard({ tasks, busy, justApprovedId, onTransition }: {
  tasks: TaskSummaryDto[];
  busy: boolean;
  justApprovedId: string | null;
  onTransition: (task: TaskSummaryDto, target: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const byStatus = useMemo(() => {
    const map = new Map<string, TaskSummaryDto[]>();
    for (const c of BOARD_COLUMNS) map.set(c, []);
    for (const t of tasks) { if (map.has(t.status)) map.get(t.status)!.push(t); }
    return map;
  }, [tasks]);
  const activeTask = activeId ? tasks.find(t => t.id === activeId) ?? null : null;
  const activeAllowed = useMemo(() => activeTask?.permissions?.allowedTransitions ?? [], [activeTask]);

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    const task = tasks.find(t => t.id === e.active.id);
    const over = e.over?.id ? String(e.over.id) : null;
    setActiveId(null);
    if (task && over && over !== task.status && task.permissions?.allowedTransitions?.includes(over)) {
      onTransition(task, over);
    }
  };

  const titleOf = (id: unknown) => tasks.find(t => t.id === id)?.title ?? 'thẻ';
  const announcements = {
    onDragStart: ({ active }: { active: { id: unknown } }) =>
      `Đã nhấc thẻ "${titleOf(active.id)}". Dùng phím mũi tên để di chuyển tới cột đích.`,
    onDragOver: ({ active, over }: { active: { id: unknown }; over: { id: unknown } | null }) =>
      over ? `Thẻ "${titleOf(active.id)}" đang ở cột ${STATUS_LABEL[String(over.id)] ?? String(over.id)}` : '',
    onDragEnd: ({ active, over }: { active: { id: unknown }; over: { id: unknown } | null }) =>
      over
        ? `Đã thả thẻ "${titleOf(active.id)}" vào cột ${STATUS_LABEL[String(over.id)] ?? String(over.id)}`
        : `Đã hủy kéo thẻ "${titleOf(active.id)}"`,
    onDragCancel: ({ active }: { active: { id: unknown } }) => `Đã hủy kéo thẻ "${titleOf(active.id)}"`,
  };

  return (
    <DndContext sensors={sensors} collisionDetection={rectIntersection}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: 'Nhấn phím Space để nhấc thẻ. Dùng phím mũi tên để di chuyển. Nhấn Space để thả, Escape để hủy.' },
      }}
      onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div role="region" aria-label="Bảng công việc" tabIndex={0}
        className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory xl:grid xl:grid-cols-5 xl:overflow-visible xl:snap-none">
        {BOARD_COLUMNS.map(col => (
          <Column key={col} status={col} tasks={byStatus.get(col) ?? []}
            dimmed={!!activeTask && !activeAllowed.includes(col) && col !== activeTask!.status}
            highlighted={!!activeTask && activeAllowed.includes(col)}
            justApprovedId={justApprovedId} busy={busy} onTransition={onTransition} />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="w-60 rounded-xl border border-line bg-white p-3 shadow-overlay">
            <TaskCardFace task={activeTask} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
