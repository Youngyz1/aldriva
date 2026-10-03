/**
 * e2e/admin-phase1.spec.ts — Phase 1 acceptance rig (before/after).
 * Visits each admin page, asserts no page-level horizontal scroll,
 * checks header/cell x-alignment, and saves viewport screenshots OUTSIDE
 * the repo. Shot directory suffix via SHOTS_SUBDIR (phase1-before/after).
 */
import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import {
  ADMIN_STORAGE_STATE,
  ADMIN_SHOTS_DIR,
  ADMIN_PAGES,
} from "./admin-paths";

test.use({ storageState: ADMIN_STORAGE_STATE });

const SUBDIR = process.env.SHOTS_SUBDIR ?? "phase1-before";

type PageResult = {
  page: string;
  viewport: number;
  scrolled: boolean;
  docScrollWidth: number;
  trueScrollWidth: number;
  winInnerWidth: number;
  pageHScroll: boolean;
  alignMismatches: string[];
};

async function measure(page: Parameters<Parameters<typeof test>[1]>[0]) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const tables = {
      docScrollWidth: de.scrollWidth,
      winInnerWidth: window.innerWidth,
      tableOverflow: Array.from(document.querySelectorAll("table")).map(
        (t) => {
          const r = t.getBoundingClientRect();
          return {
            tableScrollWidth: t.scrollWidth,
            tableClientWidth: t.clientWidth,
            rectRight: Math.round(r.right),
            viewportWidth: window.innerWidth,
          };
        }
      ),
    };
    // Second pass: temporarily lift the global overflow-x clip to reveal
    // whether the page *relies* on it (true content overflow).
    const style = document.createElement("style");
    style.textContent =
      "html,body{overflow-x:visible !important;overflow:visible !important;}";
    document.head.appendChild(style);
    const trueScrollWidth = de.scrollWidth;
    style.remove();
    return { ...tables, trueScrollWidth };
  });
}

async function alignment(
  page: Parameters<Parameters<typeof test>[1]>[0]
): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const table = document.querySelector("table");
    if (!table) return ["no-table-visible"];
    const ths = Array.from(table.querySelectorAll("thead th")).filter(
      (el) => (el as HTMLElement).offsetParent !== null
    );
    const firstRow = table.querySelector("tbody tr");
    if (!firstRow) return ["no-rows"];
    const tds = Array.from(firstRow.querySelectorAll("td")).filter(
      (el) => (el as HTMLElement).offsetParent !== null
    );
    if (ths.length !== tds.length) {
      out.push(`count th=${ths.length} td=${tds.length}`);
      return out;
    }
    ths.forEach((th, i) => {
      const a = th.getBoundingClientRect();
      const b = (tds[i] as HTMLElement).getBoundingClientRect();
      if (Math.abs(a.left - b.left) > 2) {
        out.push(
          `col${i} th.left=${Math.round(a.left)} td.left=${Math.round(b.left)}`
        );
      }
    });
    return out;
  });
}

for (const { slug, path: adminPath } of ADMIN_PAGES) {
  test(`phase1 ${slug} @${adminPath}`, async ({ page }) => {
    const viewport = page.viewportSize()?.width ?? 0;
    const dir = path.join(ADMIN_SHOTS_DIR, SUBDIR);
    fs.mkdirSync(dir, { recursive: true });

    await page.goto(adminPath, { waitUntil: "domcontentloaded" });
    // Dismiss the site-wide cookie banner (test-only; keeps shots clean).
    await page
      .getByRole("button", { name: /^decline$/i })
      .click({ timeout: 5_000 })
      .catch(() => {});
    // Table (desktop) or structured list (narrow container) signals data.
    await page
      .locator("table tbody tr, [role='listitem']")
      .first()
      .waitFor({ timeout: 45_000 });
    await page.waitForTimeout(800);

    const top = await measure(page);
    const mismatches = await alignment(page);
    const pageHScroll = top.docScrollWidth > top.winInnerWidth + 1;
    expect(
      pageHScroll,
      `${slug}: page-level horizontal scroll (doc ${top.docScrollWidth} > win ${top.winInnerWidth})`
    ).toBe(false);

    await page.screenshot({
      path: path.join(dir, `${slug}-${viewport}-top.png`),
    });

    // Scrolled state: reveals sticky-toolbar / thead overlap.
    await page.evaluate(() => window.scrollBy(0, 900));
    await page.waitForTimeout(500);
    const scrolled = await measure(page);
    await page.screenshot({
      path: path.join(dir, `${slug}-${viewport}-scrolled.png`),
    });

    const resultsPath = path.join(dir, "results.json");
    const prev: PageResult[] = fs.existsSync(resultsPath)
      ? JSON.parse(fs.readFileSync(resultsPath, "utf8"))
      : [];
    prev.push({
      page: slug,
      viewport,
      scrolled: false,
      docScrollWidth: top.docScrollWidth,
      trueScrollWidth: top.trueScrollWidth,
      winInnerWidth: top.winInnerWidth,
      pageHScroll,
      alignMismatches: mismatches,
    });
    prev.push({
      page: slug,
      viewport,
      scrolled: true,
      docScrollWidth: scrolled.docScrollWidth,
      trueScrollWidth: scrolled.trueScrollWidth,
      winInnerWidth: scrolled.winInnerWidth,
      pageHScroll: scrolled.docScrollWidth > scrolled.winInnerWidth + 1,
      alignMismatches: [],
    });
    fs.writeFileSync(resultsPath, JSON.stringify(prev, null, 2));

    // Header/cell alignment is informational in Phase 1 (asserted strictly
    // only for organizers, the named broken screen).
    if (slug === "organizers") {
      expect(mismatches, `organizers header/cell mismatch`).toEqual([]);
    }
  });
}
