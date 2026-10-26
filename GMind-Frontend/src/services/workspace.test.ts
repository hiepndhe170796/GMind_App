import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadGroupWorkspace, loadTaskWorkspace } from './workspace';
import { tasksService, hasTaskDetails, type TaskDetailDto, type TaskSummaryDto } from './tasks';
import { projectsService } from './projects';
import { groupsService, type GroupDetailDto } from './groups';
import { dashboardService } from './dashboard';

const summaryTask: TaskSummaryDto = {
  id: 't1', projectId: 'p1', parentTaskId: null, title: 'Task T',
  assigneeUserId: 'u2', assigneeName: 'B', status: 'ToDo', priority: 'Medium',
  deadlineAt: null, canViewDetails: false,
};

const detailTask: TaskDetailDto = {
  ...summaryTask, canViewDetails: true, description: 'private', estimateHours: 8, points: 3,
  progressPercent: 40, createdByUserId: 'u3', createdAt: '2026-01-01T00:00:00Z',
  submittedAt: null, completedAt: null,
};

const group = (myRole: string): GroupDetailDto => ({
  id: 'g1', name: 'G', memberCount: 3, myRole, createdAt: '2026-01-01T00:00:00Z', members: [],
});

afterEach(() => vi.restoreAllMocks());

describe('hasTaskDetails', () => {
  it('returns false for a summary', () => {
    expect(hasTaskDetails(summaryTask)).toBe(false);
  });

  it('returns false for summary-shaped data even when canViewDetails is true', () => {
    expect(hasTaskDetails({ ...summaryTask, canViewDetails: true })).toBe(false);
  });

  it('returns true for a real detail payload', () => {
    expect(hasTaskDetails(detailTask)).toBe(true);
  });
});

describe('loadTaskWorkspace', () => {
  it('does not fetch private resources for a summary task', async () => {
    const get = vi.spyOn(tasksService, 'get').mockResolvedValue(summaryTask);
    vi.spyOn(projectsService, 'get').mockResolvedValue({ id: 'p1', groupId: 'g1' } as never);
    vi.spyOn(groupsService, 'get').mockResolvedValue(group('Member'));
    const comments = vi.spyOn(tasksService, 'comments');
    const links = vi.spyOn(tasksService, 'links');
    const reviews = vi.spyOn(tasksService, 'reviews');

    const result = await loadTaskWorkspace('t1');

    expect(get).toHaveBeenCalledWith('t1');
    expect(comments).not.toHaveBeenCalled();
    expect(links).not.toHaveBeenCalled();
    expect(reviews).not.toHaveBeenCalled();
    expect(result.comments).toEqual([]);
    expect(result.links).toEqual([]);
    expect(result.reviews).toEqual([]);
    expect(result.myRole).toBe('Member');
  });

  it('fetches private resources for a detail task', async () => {
    vi.spyOn(tasksService, 'get').mockResolvedValue(detailTask);
    vi.spyOn(projectsService, 'get').mockResolvedValue({ id: 'p1', groupId: 'g1' } as never);
    vi.spyOn(groupsService, 'get').mockResolvedValue(group('Leader'));
    const comments = vi.spyOn(tasksService, 'comments').mockResolvedValue([]);
    const links = vi.spyOn(tasksService, 'links').mockResolvedValue([]);
    const reviews = vi.spyOn(tasksService, 'reviews').mockResolvedValue([]);

    const result = await loadTaskWorkspace('t1');

    expect(comments).toHaveBeenCalledWith('t1');
    expect(links).toHaveBeenCalledWith('t1');
    expect(reviews).toHaveBeenCalledWith('t1');
    expect(result.task).toBe(detailTask);
    expect(result.myRole).toBe('Leader');
  });

  it('rejects when the task request is denied', async () => {
    vi.spyOn(tasksService, 'get').mockRejectedValue({ message: 'Forbidden' });
    const comments = vi.spyOn(tasksService, 'comments');

    await expect(loadTaskWorkspace('t1')).rejects.toEqual({ message: 'Forbidden' });
    expect(comments).not.toHaveBeenCalled();
  });
});

describe('loadGroupWorkspace', () => {
  it('does not call progress or activity for a Member', async () => {
    vi.spyOn(groupsService, 'get').mockResolvedValue(group('Member'));
    vi.spyOn(projectsService, 'list').mockResolvedValue([]);
    const progress = vi.spyOn(dashboardService, 'groupProgress');
    const activity = vi.spyOn(groupsService, 'activity');

    const result = await loadGroupWorkspace('g1');

    expect(progress).not.toHaveBeenCalled();
    expect(activity).not.toHaveBeenCalled();
    expect(result.progress).toBeNull();
    expect(result.activity).toEqual([]);
  });

  it('calls progress and activity for a Leader', async () => {
    vi.spyOn(groupsService, 'get').mockResolvedValue(group('Leader'));
    vi.spyOn(projectsService, 'list').mockResolvedValue([]);
    const progress = vi.spyOn(dashboardService, 'groupProgress').mockResolvedValue(null as never);
    const activity = vi.spyOn(groupsService, 'activity').mockResolvedValue([]);

    await loadGroupWorkspace('g1');

    expect(progress).toHaveBeenCalledWith('g1');
    expect(activity).toHaveBeenCalledWith('g1');
  });

  it('rejects when the group request is denied', async () => {
    vi.spyOn(groupsService, 'get').mockRejectedValue({ message: 'Forbidden' });
    const progress = vi.spyOn(dashboardService, 'groupProgress');

    await expect(loadGroupWorkspace('g1')).rejects.toEqual({ message: 'Forbidden' });
    expect(progress).not.toHaveBeenCalled();
  });
});
