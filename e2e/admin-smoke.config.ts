/**
 * e2e/admin-smoke.config.ts — SEPARATE Playwright config for the read-only
 * admin smoke rig. Points at the human-run dev server on
 * http://localhost:3000 with NO webServer block, so it never starts the app.
 * Never touches playwright.config.ts (staging-only).
 */
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";
import { ADMIN_RIG_DIR, ADMIN_STORAGE_STATE } from "./admin-paths";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

/**
 * Second timezone mode: SMOKE_TZ / SMOKE_LOCALE override the browser
 * context (e.g. SMOKE_TZ=America/New_York SMOKE_LOCALE=en-US npm run
 * smoke:admin runs the same routes in a production-like timezone).
 * Defaults match the dev-server machine, so default behavior is unchanged.
 */
const SMOKE_TZ = process.env.SMOKE_TZ || "Africa/Lagos";
const SMOKE_LOCALE = process.env.SMOKE_LOCALE || "en-GB";

export default defineConfig({
  testDir: "./",
  outputDir: path.join(ADMIN_RIG_DIR, "results"),
  timeout: 1_200_000,
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
    // Reuses the Phase 1 rig: real login + admin proof, state outside repo.
    { name: "admin-setup", testMatch: /admin-auth\.setup\.ts/ },
    {
      name: "admin-smoke",
      testMatch: /admin-smoke\.e2e\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: ADMIN_STORAGE_STATE,
        // Pinned so locale-rendered output agrees with SSR by
        // construction; override via SMOKE_TZ / SMOKE_LOCALE (see above).
        timezoneId: SMOKE_TZ,
        locale: SMOKE_LOCALE,
      },
    },
  ],
});
