import { defineConfig } from "@playwright/test";
import path from "node:path";

const storageState = process.env.EVERGREEN_QA_ADMIN_STATE
  || path.resolve("work/evergreen-audit/qa-admin-state.json");

export default defineConfig({
  testDir: ".",
  testMatch: /evergreen-envelope-fix-round\.spec\.ts/,
  outputDir: path.resolve(process.cwd(), "work/evergreen-audit/playwright-fix-round-output"),
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    browserName: "chromium",
    baseURL: "http://localhost:3000",
    storageState,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    video: { mode: "on", size: { width: 390, height: 844 } },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: {
      args: ["--host-resolver-rules=MAP localhost [::1]"],
    },
  },
});
