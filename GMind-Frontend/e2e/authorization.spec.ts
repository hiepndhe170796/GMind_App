import { test, expect, signIn } from './fixtures.ts';
import { api, apiAs, raw, runTag } from './support/api.ts';

test('outsider sees no-access states; member cannot reach leader-only endpoints', async ({ browser, users }) => {
  const tag = runTag();
  const leaderApi = await apiAs(users.leader);
  const memberApi = await apiAs(users.member1);
  const outsiderApi = await apiAs(users.outsider);
  const group = await api.createGroup(leaderApi, `E2E Nhóm bí mật ${tag}`);
  const invite = await api.createInvite(leaderApi, group.id);
  await api.joinGroup(memberApi, invite.code);
  const project = await api.createProject(leaderApi, group.id, `E2E Dự án ${tag}`, '2027-03-01');
  const task = await api.createTask(leaderApi, project.id, { title: `E2E Việc riêng tư ${tag}` });

  // outsider UI: no-access states, no private data rendered
  const outCtx = await browser.newContext();
  await signIn(outCtx, 'outsider');
  const out = await outCtx.newPage();
  await out.goto(`/tasks/${task.id}`);
  await expect(out.getByText('Bạn không có quyền xem công việc này')).toBeVisible();
  expect(await out.getByText(task.title).count()).toBe(0);
  await out.goto(`/groups/${group.id}`);
  await expect(out.getByText('Bạn không có quyền xem nhóm này.')).toBeVisible();
  expect(await out.getByText(group.name).count()).toBe(0);
  // outsider API: 403 or 404, never data
  const outTask = await raw(outsiderApi, 'GET', `/api/tasks/${task.id}`);
  expect([403, 404]).toContain(outTask.status);

  // member1 UI: activity log is leader-only
  const mCtx = await browser.newContext();
  await signIn(mCtx, 'member1');
  const m = await mCtx.newPage();
  await m.goto(`/groups/${group.id}/activity`);
  await expect(m.getByText('Chỉ Trưởng nhóm xem được nhật ký hoạt động của nhóm.')).toBeVisible();
  // member1 API: activity log and group settings are 403
  const logDenied = await raw(memberApi, 'GET', `/api/groups/${group.id}/activity-log`);
  expect(logDenied.status).toBe(403);
  const settingsDenied = await raw(memberApi, 'PUT', `/api/groups/${group.id}/settings`, {
    riskHoursBeforeDeadline: 24, riskProgressBelowPercent: 40, staleAfterHours: 48,
  });
  expect(settingsDenied.status).toBe(403);

  await outCtx.close(); await mCtx.close();
  await leaderApi.dispose(); await memberApi.dispose(); await outsiderApi.dispose();
});
