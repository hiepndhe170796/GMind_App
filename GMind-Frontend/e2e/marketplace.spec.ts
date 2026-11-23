import { test, expect, signIn } from './fixtures.ts';
import { api, apiAs, isoInDays, raw, runTag } from './support/api.ts';

test('transfer request: member1 -> member2 accept -> leader approve', async ({ browser, users }) => {
  const tag = runTag();
  const leaderApi = await apiAs(users.leader);
  const m1Api = await apiAs(users.member1);
  const m2Api = await apiAs(users.member2);
  const group = await api.createGroup(leaderApi, `E2E Nhóm ${tag}`);
  const invite = await api.createInvite(leaderApi, group.id);
  await api.joinGroup(m1Api, invite.code);
  await api.joinGroup(m2Api, invite.code);
  const project = await api.createProject(leaderApi, group.id, `E2E Dự án ${tag}`, '2027-03-01');
  const task = await api.createTask(leaderApi, project.id, {
    title: `E2E Việc chuyển giao ${tag}`,
    assigneeUserId: users.member1.auth.user.id,
    deadlineAt: isoInDays(3),
  });

  // member1 creates a "Chuyển giao" request to member2 through the UI
  const m1Ctx = await browser.newContext();
  await signIn(m1Ctx, 'member1');
  const m1 = await m1Ctx.newPage();
  await m1.goto(`/groups/${group.id}/marketplace`);
  await m1.getByRole('button', { name: /Tạo yêu cầu/ }).click();
  await m1.getByRole('radio', { name: /Chuyển giao/ }).check();
  await m1.getByLabel('Công việc của bạn', { exact: true }).selectOption(task.id);
  await m1.getByLabel('Người nhận', { exact: true }).selectOption(users.member2.auth.user.id);
  await m1.getByLabel('Lý do').fill('Em bận đồ án môn khác tuần này.');
  const listRefresh = m1.waitForResponse(
    r => r.request().method() === 'GET' && r.url().includes('/marketplace-requests'), { timeout: 15_000 });
  await m1.getByRole('button', { name: 'Gửi yêu cầu' }).click();
  await expect(m1.getByText('Đã tạo yêu cầu.')).toBeVisible();
  await listRefresh;
  await expect(m1.locator('main').getByText('Chờ người nhận').filter({ visible: true }).first()).toBeVisible();

  // member2 accepts from "Cần bạn xử lý"
  const m2Ctx = await browser.newContext();
  await signIn(m2Ctx, 'member2');
  const m2 = await m2Ctx.newPage();
  await m2.goto(`/groups/${group.id}/marketplace?tab=action`);
  await m2.getByRole('button', { name: 'Đồng ý' }).click();
  // The request leaves member2's action tab once it awaits leader approval.
  await expect(m2.getByText('Đã đồng ý yêu cầu.')).toBeVisible();

  // leader sees it as "Chờ duyệt" and approves
  const leaderCtx = await browser.newContext();
  await signIn(leaderCtx, 'leader');
  const leader = await leaderCtx.newPage();
  await leader.goto(`/groups/${group.id}/marketplace?tab=action`);
  await expect(leader.locator('main').getByText('Chờ duyệt').filter({ visible: true }).first()).toBeVisible();
  await leader.getByRole('button', { name: 'Duyệt' }).click();
  await leader.getByRole('dialog').getByRole('button', { name: 'Duyệt' }).click();
  await expect(leader.getByText('Đã duyệt yêu cầu.')).toBeVisible();

  // API: the task now belongs to member2; member1 can no longer transition it
  const after = await api.getTask(leaderApi, task.id);
  expect(after.assigneeUserId).toBe(users.member2.auth.user.id);
  const denied = await raw(m1Api, 'POST', `/api/tasks/${task.id}/status`, { status: 2 });
  expect(denied.status).toBe(403);

  await m1Ctx.close(); await m2Ctx.close(); await leaderCtx.close();
  await leaderApi.dispose(); await m1Api.dispose(); await m2Api.dispose();
});
