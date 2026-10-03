/**
 * e2e/admin-phase2.spec.ts — Phase 2 shell acceptance rig.
 * Sidebar expanded (248px) / collapsed (64px rail) / 390px drawer states on
 * /admin, /admin/users, /admin/events. Records layout geometry to
 * results.json and saves screenshots OUTSIDE the repo (SHOTS_SUBDIR).
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import {
  ADMIN_STORAGE_STATE,
  ADMIN_SHOTS_DIR,
} from "./admin-paths";

test.use({ storageState: ADMIN_STORAGE_STATE });

const SUBDIR = process.env.SHOTS_SUBDIR ?? "phase2-after";
const SIDEBAR_COOKIE = "admin_sidebar";

const PAGES = [
  { slug: "overview", path: "/admin" },
  { slug: "users", path: "/admin/users" },
  { slug: "events", path: "/admin/events" },
] as const;

type ShellResult = {
  page: string;
  viewport: number;
  state: string;
  sidebarWidth: number | null;
  contentWidth: number;
  docScrollWidth: number;
  winInnerWidth: number;
  pageHScroll: boolean;
};

async function dismissBanner(page: Page) {
  await page
    .getByRole("button", { name: /^decline$/i })
    .click({ timeout: 5_000 })
    .catch(() => {});
}

async function record(
  page: Page,
  slug: string,
  state: string,
  dir: string,
  shot: string
): Promise<ShellResult> {
  const viewport = page.viewportSize()?.width ?? 0;
  const data = await page.evaluate(() => {
    const aside = document.querySelector(
      'aside[aria-label="Admin sidebar"]'
    ) as HTMLElement | null;
    const section = document.querySelector("section") as HTMLElement | null;
    const de = document.documentElement;
    return {
      sidebarWidth: aside
        ? Math.round(aside.getBoundingClientRect().width)
        : null,
      sidebarVisible: aside
        ? getComputedStyle(aside).display !== "none"
        : false,
      contentWidth: section
        ? Math.round(section.getBoundingClientRect().width)
        : -1,
      docScrollWidth: de.scrollWidth,
      winInnerWidth: window.innerWidth,
    };
  });
  const pageHScroll = data.docScrollWidth > data.winInnerWidth + 1;
  expect(
    pageHScroll,
    `${slug}@${viewport} [${state}]: page-level horizontal scroll`
  ).toBe(false);
  await page.screenshot({ path: path.join(dir, shot) });
  const row: ShellResult = {
    page: slug,
    viewport,
    state,
    sidebarWidth: data.sidebarVisible ? data.sidebarWidth : null,
    contentWidth: data.contentWidth,
    docScrollWidth: data.docScrollWidth,
    winInnerWidth: data.winInnerWidth,
    pageHScroll,
  };
  const resultsPath = path.join(dir, "results.json");
  const prev: ShellResult[] = fs.existsSync(resultsPath)
    ? JSON.parse(fs.readFileSync(resultsPath, "utf8"))
    : [];
  prev.push(row);
  fs.writeFileSync(resultsPath, JSON.stringify(prev, null, 2));
  return row;
}

for (const { slug, path: adminPath } of PAGES) {
  test(`phase2 ${slug} shell states`, async ({ page, context }) => {
    const viewport = page.viewportSize()?.width ?? 0;
    const dir = path.join(ADMIN_SHOTS_DIR, SUBDIR);
    fs.mkdirSync(dir, { recursive: true });
    const isMobile = viewport < 1024;

    if (isMobile) {
      // Drawer closed (default) + open.
      await page.goto(adminPath, { waitUntil: "domcontentloaded" });
      await dismissBanner(page);
      await page.waitForTimeout(600);
      await record(page, slug, "drawer-closed", dir, `${slug}-${viewport}-drawer-closed.png`);

      await page
        .getByRole("button", { name: /open admin navigation/i })
        .click();
      const dialog = page.getByRole("dialog", { name: /admin navigation/i });
      await expect(dialog).toBeVisible();
      await page.waitForTimeout(400);
      await record(page, slug, "drawer-open", dir, `${slug}-${viewport}-drawer-open.png`);

      // Escape closes.
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      return;
    }

    // Expanded (no cookie).
    await page.goto(adminPath, { waitUntil: "domcontentloaded" });
    await dismissBanner(page);
    await page.waitForTimeout(600);
    const expanded = await record(
      page, slug, "expanded", dir, `${slug}-${viewport}-expanded.png`
    );
    expect(expanded.sidebarWidth ?? 0).toBeGreaterThanOrEqual(240);
    expect(expanded.sidebarWidth ?? 0).toBeLessThanOrEqual(256);
    // Active link present in expanded mode.
    await expect(
      page.locator('aside[aria-label="Admin sidebar"] a[aria-current="page"]')
    ).toBeVisible();

    // Collapsed via cookie (server-rendered, no flash path).
    await context.addCookies([
      { name: SIDEBAR_COOKIE, value: "1", path: "/", domain: "localhost" },
    ]);
    await page.goto(adminPath, { waitUntil: "domcontentloaded" });
    await dismissBanner(page);
    await page.waitForTimeout(600);
    const collapsed = await record(
      page, slug, "collapsed", dir, `${slug}-${viewport}-collapsed.png`
    );
    expect(collapsed.sidebarWidth ?? 0).toBeGreaterThanOrEqual(60);
    expect(collapsed.sidebarWidth ?? 0).toBeLessThanOrEqual(68);
    // Tooltips + visible active state in rail mode.
    const rail = page.locator('aside[aria-label="Admin sidebar"]');
    expect(await rail.locator('a[title]').count()).toBeGreaterThan(5);
    await expect(rail.locator('a[aria-current="page"]')).toBeVisible();

    // Toggle back via the edge handle — no reload, content stays put.
    const urlBefore = page.url();
    await rail
      .getByRole("button", { name: /expand sidebar/i })
      .click();
    await page.waitForTimeout(500);
    expect(page.url()).toBe(urlBefore);
    const toggled = await page.evaluate(() => {
      const aside = document.querySelector(
        'aside[aria-label="Admin sidebar"]'
      ) as HTMLElement | null;
      const section = document.querySelector("section") as HTMLElement | null;
      return {
        sidebarWidth: aside
          ? Math.round(aside.getBoundingClientRect().width)
          : -1,
        contentWidth: section
          ? Math.round(section.getBoundingClientRect().width)
          : -1,
      };
    });
    expect(toggled.sidebarWidth).toBeGreaterThanOrEqual(240);
    expect(toggled.sidebarWidth).toBeLessThanOrEqual(256);
    // Park the mouse away from the rail so link :hover can't be mistaken
    // for the active state in the toggled screenshot.
    await page.mouse.move(720, 200);
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(dir, `${slug}-${viewport}-toggled-open.png`),
    });

    // Report content reflow honestly: collapsing the rail (248->64) widens
    // the content column by exactly 184px — reflow within its own column.
    const delta = expanded.contentWidth - collapsed.contentWidth;
    expect(Math.abs(delta + 184)).toBeLessThanOrEqual(4);
  });
}
