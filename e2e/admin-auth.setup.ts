/**
 * e2e/admin-auth.setup.ts — logs in through the real login form with
 * QA_TEST_EMAIL / QA_TEST_PASSWORD (from .env.local, never printed) and
 * saves storageState OUTSIDE the repo. Fails fast when the account is not
 * an admin (non-admins are bounced off /admin/* by proxy.ts).
 */
import { test as setup } from "@playwright/test";
import fs from "fs";
import { ADMIN_RIG_DIR, ADMIN_STORAGE_STATE } from "./admin-paths";

setup("admin login", async ({ page }) => {
  const email = process.env.QA_TEST_EMAIL;
  const password = process.env.QA_TEST_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "QA_TEST_EMAIL and QA_TEST_PASSWORD must be set (loaded from .env.local)."
    );
  }

  fs.mkdirSync(ADMIN_RIG_DIR, { recursive: true });

  await page.goto("/login");
  await page.getByRole("button", { name: /continue with email/i }).click();
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /^log in$/i }).click();

  // Login form redirects to "/" on success; a failed login stays on /login
  // with a visible error.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30_000,
  });

  // Prove admin: proxy.ts bounces non-admins from /admin/* to "/".
  await page.goto("/admin/users");
  await page.waitForLoadState("domcontentloaded");
  if (new URL(page.url()).pathname === "/") {
    throw new Error(
      "Login succeeded but the account is NOT an admin (bounced off /admin/users). Stopping."
    );
  }

  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
