import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, signIn, unreadCount } from './fixtures.ts';
import { api, apiAs, runTag } from './support/api.ts';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

test('mention in discussion reaches member in realtime; file upload/download; exe rejected', async ({ browser, users }) => {
  const tag = runTag();
  const leaderApi = await apiAs(users.leader);
  const memberApi = await apiAs(users.member1);
  const group = await api.createGroup(leaderApi, `E2E Nhóm ${tag}`);
  const invite = await api.createInvite(leaderApi, group.id);
  await api.joinGroup(memberApi, invite.code);
  const project = await api.createProject(leaderApi, group.id, `E2E Dự án ${tag}`, '2027-03-01');

  const memberCtx = await browser.newContext();
  const leaderCtx = await browser.newContext();
  await signIn(memberCtx, 'member1');
  await signIn(leaderCtx, 'leader');
  const member = await memberCtx.newPage();
  const leader = await leaderCtx.newPage();

  // member1 already sits on the project's Thảo luận tab
  await member.goto(`/projects/${project.id}?tab=discussion`);
  await expect(member.getByPlaceholder(/Nhập tin nhắn/)).toBeVisible();

  // leader sends a message with an @mention picked from the suggestion listbox
  await leader.goto(`/projects/${project.id}?tab=discussion`);
  const composer = leader.getByPlaceholder(/Nhập tin nhắn/);
  await composer.click();
  await composer.pressSequentially(`Xin chào @E2E member1 `);
  const option = leader.getByRole('option', { name: users.member1.auth.user.displayName });
  await expect(option).toBeVisible();
  await option.click();
  await composer.pressSequentially('nhớ xem lại phần báo cáo nhé');
  // Baseline unread count on member1's open page right before the mention is sent.
  const unreadBefore = await unreadCount(member);
  await leader.getByRole('button', { name: 'Gửi', exact: true }).click();

  // member1 sees the message without reload, and their unread count strictly increases
  await expect(member.locator('main').getByText(/nhớ xem lại phần báo cáo nhé/)).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => unreadCount(member), { timeout: 15_000 }).toBeGreaterThan(unreadBefore);

  // leader uploads brief.txt on the Tài liệu tab
  const uploads: string[] = [];
  leader.on('request', r => { if (r.method() === 'POST' && /\/files/.test(r.url())) uploads.push(r.url()); });
  await leader.getByRole('tab', { name: /Tài liệu/ }).click();
  await leader.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, 'brief.txt'));
  await expect(leader.locator('main').getByText('brief.txt')).toBeVisible({ timeout: 15_000 });
  expect(uploads).toHaveLength(1);

  // member1 downloads it -> identical bytes
  await member.getByRole('tab', { name: /Tài liệu/ }).click();
  const downloadPromise = member.waitForEvent('download', { timeout: 15_000 });
  await member.getByRole('button', { name: 'Tải xuống brief.txt' }).click();
  const download = await downloadPromise;
  const downloaded = readFileSync(await download.path());
  expect(downloaded.equals(readFileSync(path.join(FIXTURES, 'brief.txt')))).toBe(true);

  // leader tries tool.exe -> client-side rejection, no upload request
  const before = uploads.length;
  await leader.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, 'tool.exe'));
  await expect(leader.getByRole('alert')).toContainText('Định dạng tệp không được hỗ trợ.');
  expect(uploads).toHaveLength(before);

  await memberCtx.close(); await leaderCtx.close();
  await leaderApi.dispose(); await memberApi.dispose();
});
