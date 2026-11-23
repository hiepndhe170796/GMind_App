import { test, expect, signIn, unreadCount } from './fixtures.ts';
import { api, apiAs, isoInDays, runTag } from './support/api.ts';

test('member submits for review, leader approves, realtime updates both sides', async ({ browser, users }) => {
  const tag = runTag();
  const leaderApi = await apiAs(users.leader);
  const memberApi = await apiAs(users.member1);
  const group = await api.createGroup(leaderApi, `E2E Nhóm ${tag}`);
  const invite = await api.createInvite(leaderApi, group.id);
  await api.joinGroup(memberApi, invite.code);
  const project = await api.createProject(leaderApi, group.id, `E2E Dự án ${tag}`, '2027-03-01');
  const task = await api.createTask(leaderApi, project.id, {
    title: `E2E Công việc ${tag}`,
    assigneeUserId: users.member1.auth.user.id,
    deadlineAt: isoInDays(2),
    points: 6,
  });

  const memberCtx = await browser.newContext();
  const leaderCtx = await browser.newContext();
  await signIn(memberCtx, 'member1');
  await signIn(leaderCtx, 'leader');
  const member = await memberCtx.newPage();
  const leader = await leaderCtx.newPage();
  const memberErrors: string[] = [];
  member.on('pageerror', e => memberErrors.push(String(e)));

  // leader is already sitting on /dashboard (realtime must reach this open page)
  await leader.goto('/dashboard');
  await expect(leader.getByText(/Chào /)).toBeVisible();
  await member.goto(`/tasks/${task.id}`);

  // member1 works the task: Bắt đầu -> Nộp để duyệt (with handoff note)
  await member.getByRole('button', { name: 'Bắt đầu' }).click();
  await member.getByRole('button', { name: 'Nộp để duyệt' }).click();
  await member.getByLabel(/Ghi chú bàn giao/).fill('Xong phần API và unit test.');
  // Baseline count on leader's open page right before the submit notification fires.
  const unreadBefore = await unreadCount(leader);
  await member.getByRole('dialog').getByRole('button', { name: 'Nộp để duyệt' }).click();
  await expect(member.locator('main').getByText('Chờ duyệt', { exact: true }).first()).toBeVisible();

  // leader's open dashboard (no reload): unread count strictly increases and the
  // realtime toast names this task
  await expect.poll(() => unreadCount(leader), { timeout: 15_000 }).toBeGreaterThan(unreadBefore);
  await expect(
    leader.locator('[aria-live="polite"] [role="status"]').filter({ hasText: task.title }).first()
  ).toBeVisible({ timeout: 15_000 });

  // leader approves on the task page
  await leader.goto(`/tasks/${task.id}`);
  await leader.getByRole('button', { name: 'Duyệt' }).click();
  await expect(leader.locator('main').getByText('Hoàn thành', { exact: true }).first()).toBeVisible();

  // member1's already-open page updates without reload
  await expect(member.locator('main').getByText('Hoàn thành', { exact: true }).first())
    .toBeVisible({ timeout: 15_000 });

  const viaApi = await api.getTask(leaderApi, task.id);
  expect(viaApi.status).toBe('Completed');
  expect(memberErrors).toEqual([]);

  await memberCtx.close();
  await leaderCtx.close();
  await leaderApi.dispose();
  await memberApi.dispose();
});
