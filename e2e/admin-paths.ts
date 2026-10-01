/**
 * e2e/admin-paths.ts — shared paths for the admin redesign screenshot rig.
 * Storage state and screenshots live OUTSIDE the repo (OS temp dir) so no
 * credential-adjacent artifact can ever be committed.
 */
import path from "path";
import os from "os";

export const ADMIN_RIG_DIR = path.join(
  os.tmpdir(),
  "opencode",
  "aldriva-admin"
);
export const ADMIN_STORAGE_STATE = path.join(
  ADMIN_RIG_DIR,
  "admin-storage.json"
);
export const ADMIN_SHOTS_DIR = path.join(ADMIN_RIG_DIR, "shots");

/** Admin pages covered by Phase 1 acceptance. */
export const ADMIN_PAGES = [
  { slug: "users", path: "/admin/users" },
  { slug: "organizers", path: "/admin/organizers" },
  { slug: "fundraisers", path: "/admin/fundraisers" },
  { slug: "businesses", path: "/admin/businesses" },
  { slug: "articles", path: "/admin/articles" },
  { slug: "events", path: "/admin/events" },
] as const;
