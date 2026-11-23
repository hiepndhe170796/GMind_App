import { test, expect } from './fixtures.ts';

// This spec's own user may be logged out; pool users are never touched.
test('register, logout, wrong/correct password, deep-link redirect', async ({ page, browser }) => {
  const runId = `ui${Date.now().toString(36)}`;
  const email = `e2e-${runId}-ui@e2e.gmind.test`;
  const password = `E2e!${crypto.randomUUID().replaceAll('-', '').slice(0, 14)}z9`;

  // Register through the UI -> auto login. A brand-new account is sent to
  // /join-group (the getting-started step); the dashboard then shows its
  // empty-state getting-started card.
  await page.goto('/register');
  await page.getByLabel('Tên hiển thị').fill(`E2E UI ${runId}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByLabel('Xác nhận mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  await expect(page).toHaveURL(/\/join-group/, { timeout: 15_000 });
  await page.goto('/dashboard');
  await expect(page.getByText('Tạo nhóm hoặc tham gia bằng mã mời.')).toBeVisible();

  // Log out from the sidebar -> /login
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/login/);

  // Wrong password -> Vietnamese error alert, stays on /login
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill('wrong-password-99');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  // Correct password -> dashboard
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  await page.context().close();

  // Fresh unauthenticated context deep-linking a protected URL
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto('/my-tasks?x=1');
  await expect(p2).toHaveURL(/\/login/);
  await p2.getByLabel('Email').fill(email);
  await p2.getByLabel('Mật khẩu').fill(password);
  await p2.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(p2).toHaveURL(/\/my-tasks\?x=1/, { timeout: 15_000 });
  await ctx2.close();
});
