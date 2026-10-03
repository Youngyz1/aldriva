/**
 * e2e/admin-smoke.routes.ts — pure route discovery for the admin smoke rig.
 * Dependency-free so both the Playwright spec and node:test can import it.
 * (Named *.routes.ts so the root staging Playwright config, which scans
 * e2e/ with the default testMatch, never picks this file up.)
 */

import fs from "fs";
import path from "path";

export type SmokeRoute = {
  /** App URL, e.g. "/admin/users" or "/admin/users/[id]". */
  url: string;
  dynamic: boolean;
  /** List page a dynamic id is read from, e.g. "/admin/users". */
  listPage: string | null;
};

/** "ai/rejections/page.tsx" -> "/admin/ai/rejections"; "page.tsx" -> "/admin". */
export function pageFileToUrl(rel: string): string {
  const fwd = rel.replace(/\\/g, "/");
  if (fwd === "page.tsx") return "/admin";
  return "/admin/" + fwd.replace(/\/page\.tsx$/, "");
}

/** Recursively collect page.tsx paths (repo-relative, forward slashes). */
export function discoverPageFiles(adminDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), prefix + entry.name + "/");
      } else if (entry.name === "page.tsx") {
        out.push(prefix + "page.tsx");
      }
    }
  };
  walk(adminDir, "");
  return out.sort();
}

/** Convert discovered files to ordered smoke routes. */
export function discoverAdminRoutes(relFiles: string[]): SmokeRoute[] {
  return relFiles
    .filter((f) => f.endsWith("page.tsx"))
    .map((f) => pageFileToUrl(f))
    .sort()
    .map((url) => {
      const dynamic = url.includes("[");
      return {
        url,
        dynamic,
        listPage: dynamic ? url.slice(0, url.lastIndexOf("/")) : null,
      };
    });
}

/**
 * Pick the first same-level link under the list page:
 * "/admin/users/abc" -> "abc", but never deeper paths or query strings.
 */
export function resolveDynamicId(
  hrefs: (string | null)[],
  listPage: string
): string | null {
  const prefix = listPage.endsWith("/") ? listPage : listPage + "/";
  for (const href of hrefs) {
    if (!href || !href.startsWith(prefix)) continue;
    const rest = href.slice(prefix.length).split(/[?#]/)[0];
    if (rest && !rest.includes("/")) return rest;
  }
  return null;
}
