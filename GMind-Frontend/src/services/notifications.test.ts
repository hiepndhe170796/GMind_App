// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { groupByDay, notificationTarget, typeIcon, typeTone, vnTime, vnToday, type NotificationDto } from './notifications';

const N = (o: Partial<NotificationDto>): NotificationDto => ({
  id: 'a', type: 'TaskAssigned', title: 'T', body: 'B', isRead: false, createdAt: '2026-12-31T17:01:00Z', ...o,
});
const TODAY = vnToday(); // Asia/Ho_Chi_Minh civil day of 'now' in test env

describe('notifications model — VN civil day grouping', () => {
  it('offsetless-UTC boundary: 2026-12-31T17:01Z (offsetless treated as UTC) lands on VN 2027-01-01', () => {
    const groups = groupByDay([N({ createdAt: '2026-12-31T17:01:00' })], '2027-01-01');
    expect(groups[0][0]).toBe('Hôm nay');
    expect(groups[0][1]).toHaveLength(1);
  });
  it('yesterday -> Hôm qua; Jan-1 of a new year groups correctly', () => {
    const g1 = groupByDay([N({ createdAt: '2026-12-30T10:00:00Z' })], '2026-12-31');
    expect(g1[0][0]).toBe('Hôm qua');
    const g2 = groupByDay([N({ createdAt: '2025-12-31T17:30:00Z' })], '2026-01-02');
    expect(g2[0][0]).toBe('Hôm qua');
  });
  it('invalid timestamps sort LAST and never throw RangeError', () => {
    const items = [N({ id: 'x', createdAt: 'not-a-date' }), N({ id: 'y', createdAt: '2026-12-31T00:00:00Z' }), N({ id: 'z', createdAt: '' })];
    const groups = groupByDay(items, TODAY);
    expect(groups.at(-1)![0]).toBe('Không rõ ngày');
    expect(groups.at(-1)![1].map(n => n.id).sort()).toEqual(['x', 'z']);
    expect(() => vnTime('not-a-date')).not.toThrow();
  });
  it('vnTime returns empty string for invalid input, non-empty for valid', () => {
    expect(vnTime('garbage')).toBe('');
    expect(vnTime('2026-12-31T17:01:00Z')).not.toBe('');
  });
  it('newest-first within a day is chronological', () => {
    const items = [N({ id: 'old', createdAt: '2026-12-31T01:00:00Z' }), N({ id: 'new', createdAt: '2026-12-31T10:00:00Z' })];
    const g = groupByDay(items, '2027-01-01')[0];
    expect(g[1].map(n => n.id)).toEqual(['new', 'old']);
    expect(items.map(n => n.id)).toEqual(['old', 'new']); // input order unchanged
  });
});

describe('notificationTarget — safe resource links', () => {
  const G = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  it('Task -> /tasks/:id', () => {
    expect(notificationTarget(N({ relatedEntityType: 'Task', relatedEntityId: G }))).toEqual({ href: `/tasks/${G}`, label: 'Xem công việc' });
  });
  it('Project/Group routes', () => {
    expect(notificationTarget(N({ relatedEntityType: 'Project', relatedEntityId: G }))!.href).toBe(`/projects/${G}`);
    expect(notificationTarget(N({ relatedEntityType: 'Group', relatedEntityId: G }))!.href).toBe(`/groups/${G}`);
  });
  it('MarketplaceRequest -> /groups/:groupId/marketplace only when groupId is a valid GUID', () => {
    expect(notificationTarget(N({ relatedEntityType: 'MarketplaceRequest', relatedEntityId: G, groupId: G }))!.href).toBe(`/groups/${G}/marketplace`);
    expect(notificationTarget(N({ relatedEntityType: 'MarketplaceRequest', relatedEntityId: G, groupId: 'not-a-guid' }))).toBeNull();
    expect(notificationTarget(N({ relatedEntityType: 'MarketplaceRequest', relatedEntityId: G }))).toBeNull();
  });
  it('MemberRemoved is informational — never a link', () => {
    expect(notificationTarget(N({ type: 'MemberRemoved', relatedEntityType: 'Group', relatedEntityId: G }))).toBeNull();
  });
  it('malformed IDs and unknown kinds produce no link', () => {
    expect(notificationTarget(N({ relatedEntityType: 'Task', relatedEntityId: 'javascript:alert(1)' }))).toBeNull();
    expect(notificationTarget(N({ relatedEntityType: 'Task', relatedEntityId: 'x'.repeat(50) }))).toBeNull();
    expect(notificationTarget(N({ relatedEntityType: 'UnknownKind', relatedEntityId: G }))).toBeNull();
    expect(notificationTarget(N({}))).toBeNull();
  });
});

describe('typeIcon — real enum names only', () => {
  const ALL = ['TaskAssigned', 'TaskUpdated', 'TaskSubmitted', 'TaskApproved', 'TaskChangesRequested',
    'MarketplaceRequestCreated', 'MarketplaceRequestApproved', 'MarketplaceRequestRejected',
    'DeadlineReminder', 'OverdueAlert', 'MemberInvited', 'MemberJoined', 'MemberRemoved',
    'StaleTaskWarning', 'CommentAdded', 'AtRiskWarning', 'LeaderReminder'];
  it('all 17 enum types map to a supported IconName (never undefined)', () => {
    const VALID = ['tasks','check','link','calendar','bell','users'];
    for (const t of ALL) expect(VALID).toContain(typeIcon(t));
  });
  it('AtRiskWarning -> calendar icon + warning tone; LeaderReminder -> bell + accent tone', () => {
    expect(typeIcon('AtRiskWarning')).toBe('calendar');
    expect(typeTone('AtRiskWarning')).toBe('text-warning-700');
    expect(typeIcon('LeaderReminder')).toBe('bell');
    expect(typeTone('LeaderReminder')).toBe('text-accent-700');
  });
  it('unknown type -> neutral bell, tone neutral', () => {
    expect(typeIcon('InventedType')).toBe('bell');
    expect(typeTone('InventedType')).toBe('text-slate-600');
  });
});

describe('M4 notification types 18–26', () => {
  const G = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  it('marketplace types map to icon + tone + marketplace target', () => {
    const t = (type: string) => notificationTarget(N({ type, relatedEntityType: 'MarketplaceRequest', relatedEntityId: G, groupId: G }));
    expect(t('MarketplaceResponseNeeded')!.href).toBe(`/groups/${G}/marketplace`);
    expect(typeIcon('MarketplaceResponseNeeded')).toBe('link');
    expect(typeTone('MarketplaceResponseNeeded')).toBe('text-accent-700');
    expect(typeIcon('MarketplaceRecipientAccepted')).toBe('check');
    expect(typeTone('MarketplaceRecipientAccepted')).toBe('text-success-700');
    expect(typeTone('MarketplaceRecipientDeclined')).toBe('text-ink-muted');
    expect(typeTone('MarketplaceClaimed')).toBe('text-accent-700');
    expect(typeTone('MarketplaceOpenRequest')).toBe('text-primary-600');
    expect(t('MarketplaceOpenRequest')!.href).toBe(`/groups/${G}/marketplace`);
  });
  it('helper types link to the task', () => {
    const t = notificationTarget(N({ type: 'HelperAdded', relatedEntityType: 'Task', relatedEntityId: G }));
    expect(t).toEqual({ href: `/tasks/${G}`, label: 'Xem công việc' });
    expect(typeIcon('HelperAdded')).toBe('users');
    expect(typeTone('HelperAdded')).toBe('text-accent-700');
    expect(typeIcon('HelperEnded')).toBe('users');
    expect(typeTone('HelperEnded')).toBe('text-ink-muted');
    expect(notificationTarget(N({ type: 'HelperEnded', relatedEntityType: 'Task', relatedEntityId: G }))!.href).toBe(`/tasks/${G}`);
  });
  it('GroupArchived links to /groups; GroupRestored links to the group', () => {
    expect(notificationTarget(N({ type: 'GroupArchived', relatedEntityType: 'Group', relatedEntityId: G })))
      .toEqual({ href: '/groups', label: 'Xem nhóm đã lưu trữ' });
    expect(typeIcon('GroupArchived')).toBe('alert');
    expect(typeTone('GroupArchived')).toBe('text-warning-700');
    expect(notificationTarget(N({ type: 'GroupRestored', relatedEntityType: 'Group', relatedEntityId: G }))!.href).toBe(`/groups/${G}`);
    expect(typeIcon('GroupRestored')).toBe('check');
    expect(typeTone('GroupRestored')).toBe('text-success-700');
  });
});
