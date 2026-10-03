/**
 * e2e/auth-login.spec.ts — Stage 7 smoke: authentication gate.
 *
 * Covers: email login success (lands on an authenticated surface) and
 * wrong-password rejection (visible error, no navigation). Auth is the
 * gate for every other flow, so this spec failing blocks confidence in
 * everything downstream. Selectors follow the real login form
 * (app/[locale]/login/page.tsx): "Continue with Email" reveals the
 * email/password form submitted via the "Log In" button.
 */
import { test, expect } from './fixtures';

const email = process.env.QA_TEST_EMAIL;
const password = process.env.QA_TEST_PASSWORD;

test.beforeAll(() => {
  if (!email || !password) throw new Error('QA_TEST_EMAIL and QA_TEST_PASSWORD are required');
});

test('email login succeeds and lands authenticated', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: /continue with email/i }).click();
  await page.locator('input[name="email"]').fill(email as string);
  await page.locator('input[name="password"]').fill(password as string);
  await page.getByRole('button', { name: /^log in$/i }).click();
  // Authenticated landing: dashboard shell renders (adjust if IA changes).
  await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 15_000 });
});

test('wrong password is rejected visibly without navigating', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: /continue with email/i }).click();
  await page.locator('input[name="email"]').fill(email as string);
  await page.locator('input[name="password"]').fill('wrong-password-' + Date.now());
  await page.getByRole('button', { name: /^log in$/i }).click();
  await expect(page).toHaveURL(/login/, { timeout: 15_000 });
  await expect(page.getByText(/invalid|incorrect|wrong|failed|error/i).first()).toBeVisible({ timeout: 15_000 });
});
