/**
 * e2e/admin-smoke.e2e.ts — authenticated GET-only smoke over every admin
 * route. Navigation only: page.goto plus DOM reads (link hrefs, body text,
 * overlay presence). No clicks, no typing, no submits, no mutations.
 * (Named *.e2e.ts so the root staging Playwright config, which scans e2e/
 * with the default testMatch, never picks this file up; it runs only via
 * e2e/admin-smoke.config.ts against the human-run dev server.)
 */
import { test } from "@playwright/test";
import fs from "fs";
import path from "path";
import { ADMIN_RIG_DIR, ADMIN_STORAGE_STATE } from "./admin-paths";
import {
  discoverAdminRoutes,
  discoverPageFiles,
  resolveDynamicId,
} from "./admin-smoke.routes";
import {
  classifyRoute,
  type SmokeResult,
} from "./admin-smoke.classify";

type Row = {
  route: string;
  status: number | null;
  ms: number;
  result: SmokeResult;
  detail: string | null;
};

test("admin smoke", async ({ page }) => {
  void ADMIN_STORAGE_STATE;
  const t0 = Date.now();
  const startedAt = new Date(t0).toISOString();
  const adminDir = path.resolve(__dirname, "../app/admin");
  const routes = discoverAdminRoutes(discoverPageFiles(adminDir));
  console.log(`smoke: ${routes.length} admin routes discovered`);

  let pageError: string | null = null;
  let consoleErrors: string[] = [];
  page.on("pageerror", (err) => {
    pageError = String(err?.message ?? err).slice(0, 500);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 500));
  });

  async function settle() {
    await page
      .waitForLoadState("networkidle", { timeout: 3000 })
      .catch(() => {});
  }

  async function checkUrl(url: string): Promise<Omit<Row, "route">> {
    const start = Date.now();
    pageError = null;
    consoleErrors = [];
    try {
      const response = await page.goto(url, {
        waitUntil: "load",
        timeout: 60_000,
      });
      await settle();
      const finalPath = new URL(page.url()).pathname;
      const bodyText = await page
        .locator("body")
        .innerText()
        .catch(() => "");
      const verdict = classifyRoute({
        requestedPath: url,
        finalPath,
        status: response?.status() ?? null,
        bodyText,
        pageError,
        consoleErrors,
      });
      return {
        status: response?.status() ?? null,
        ms: Date.now() - start,
        result: verdict.result,
        detail: verdict.detail,
      };
    } catch (err) {
      return {
        status: null,
        ms: Date.now() - start,
        result: "FAIL",
        detail: err instanceof Error ? err.message.slice(0, 300) : String(err),
      };
    }
  }

  const rows: Row[] = [];
  for (const route of routes) {
    if (!route.dynamic) {
      const checked = await checkUrl(route.url);
      rows.push({ route: route.url, ...checked });
    } else {
      const listPage = route.listPage ?? "/admin";
      await page
        .goto(listPage, { waitUntil: "load", timeout: 60_000 })
        .catch(() => {});
      await settle();
      // Give client-fetched lists a chance to render their links.
      await page
        .waitForSelector(`a[href^="${listPage}/"]`, { timeout: 10_000 })
        .catch(() => {});
      const hrefs = await page
        .$$eval("a[href]", (els) =>
          els.map((e) => e.getAttribute("href"))
        )
        .catch((): (string | null)[] => []);
      const id = resolveDynamicId(hrefs, listPage);
      if (id === null) {
        const skipped: Row = {
          route: route.url,
          status: null,
          ms: 0,
          result: "SKIPPED",
          detail: `no link found on ${listPage}`,
        };
        rows.push(skipped);
        console.log(`smoke: SKIPPED ${skipped.route} :: ${skipped.detail}`);
        continue;
      }
      const checked = await checkUrl(`${listPage}/${id}`);
      rows.push({ route: route.url, ...checked });
    }
    const last = rows[rows.length - 1];
      console.log(
      `smoke: ${last.result} ${last.route} status=${String(last.status)} ${String(last.ms)}ms${last.detail ? ` :: ${last.detail}` : ""}`
    );
  }

  const outFile = path.join(ADMIN_RIG_DIR, "admin-smoke.json");
  fs.mkdirSync(ADMIN_RIG_DIR, { recursive: true });
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      { startedAt, baseURL: "http://localhost:3000", routes: rows },
      null,
      2
    )
  );
  console.log(`smoke: wrote ${outFile}`);

  const bad = rows.filter((r) => r.result === "FAIL" || r.result === "AUTH");
  if (bad.length > 0) {
    throw new Error(
      `admin smoke: ${String(bad.length)} bad route(s): ${bad
        .map((r) => `${r.route} [${r.result}] ${r.detail ?? ""}`)
        .join("; ")}`
    );
  }
});
