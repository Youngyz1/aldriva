/**
 * playwright.config.ts — Stage 7 smoke suite configuration.
 *
 * Staging-only by construction: baseURL comes EXCLUSIVELY from
 * QA_STAGING_URL and the config throws when it is unset — there is no
 * default, and production must never be set (CI holds no production
 * secret; payment steps use test cards declined-by-construction on
 * live keys). Local authoring may point QA_STAGING_URL at localhost.
 */
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.QA_STAGING_URL;
if (!baseURL) {
  throw new Error('QA_STAGING_URL is required — refusing to run without an explicit target (never production).');
}

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // smoke suite is small and sequential reads better
  retries: 0, // flakiness must be observed (and quarantined), never retried away
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'qa-results.json' }], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off', // enable per-spec only if a failure needs motion evidence
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
