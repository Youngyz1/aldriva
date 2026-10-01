/**
 * e2e/admin.local.config.ts — SEPARATE Playwright config for the admin
 * redesign screenshot rig. Never touches playwright.config.ts (which targets
 * staging via QA_STAGING_URL). Points at the human-run dev server on
 * http://localhost:3000 with NO webServer block, so it never starts the app.
 */
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

export default defineConfig({
  testDir: "./",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    { name: "admin-setup", testMatch: /admin-auth\.setup\.ts/ },
    {
      // NOTE: no dependency on admin-setup — run it once explicitly;
      // storageState persists in the OS temp dir for subsequent shot runs.
      name: "admin-1440",
      testMatch: /admin-phase1\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "admin-1100",
      testMatch: /admin-phase1\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1100, height: 900 },
      },
    },
  ],
});
