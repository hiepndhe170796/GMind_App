import { test, expect, signIn } from './fixtures.ts';
import { api, apiAs, runTag } from './support/api.ts';

test.describe('responsive sweep', () => {
  test('all core routes: clean console, no 5xx, no overflow, one h1, branded title', async ({ browser, users }, testInfo) => {
    const tag = runTag();
    const leaderApi = await apiAs(users.leader);
    const group = await api.createGroup(leaderApi, `E2E Nhóm ${tag}`);
    const project = await api.createProject(leaderApi, group.id, `E2E Dự án ${tag}`, '2027-03-01');
    const task = await api.createTask(leaderApi, project.id, { title: `E2E Việc ${tag}` });
    await leaderApi.dispose();

    const ctx = await browser.newContext();
    await signIn(ctx, 'leader');
    const page = await ctx.newPage();
    const consoleErrors: string[] = [];
    const server5xx: string[] = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push(String(e)));
    page.on('response', r => { if (r.status() >= 500) server5xx.push(`${r.status()} ${r.url()}`); });

    const routes = [
      '/dashboard', '/my-tasks', '/groups', `/groups/${group.id}`, `/projects/${project.id}`,
      `/tasks/${task.id}`, '/calendar', '/notifications', '/settings', '/profile',
    ];
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('h1')).toHaveCount(1, { timeout: 15_000 });
      const widths = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth, inner: window.innerWidth,
      }));
      expect(widths.scroll, `${route}: horizontal overflow`).toBeLessThanOrEqual(widths.inner);
      expect(await page.title(), `${route}: title`).toMatch(/ · GMind$/);
    }

    if (testInfo.project.name === 'mobile') {
      await page.goto('/dashboard');
      const trigger = page.getByRole('button', { name: 'Mở menu' });
      await trigger.press('Enter');
      await expect(page.getByRole('button', { name: 'Đóng menu' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Đóng menu' })).toBeHidden();
      await expect(trigger).toBeFocused();
    }

    expect(server5xx).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await ctx.close();
  });
});
