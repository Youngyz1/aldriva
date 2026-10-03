/**
 * Pins for app/admin/users/identity-verifications (identity decision queue).
 * p2-style server/requireAdmin gate checks plus byte-identical review-action
 * pins (endpoint, PATCH, payload, toast, refresh) and preservation pins for
 * the submitted default, tabs, columns, and the overview deep-link.
 * Run via the package.json test list (node --test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { adminPageCopy } from "../../../../components/admin/page-strings.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const wrapper = fs.readFileSync(path.join(here, "page.tsx"), "utf8");
const src = fs.readFileSync(path.join(here, "IdentityVerificationsAdminClient.tsx"), "utf8");
const route = fs.readFileSync(
  path.join(here, "..", "..", "..", "api", "admin", "identity-verifications", "[id]", "route.ts"),
  "utf8"
);

test("identity-verifications wrapper stays server-rendered with requireAdmin", () => {
  assert.ok(!/^"use client"/m.test(wrapper), "must be a server component");
  assert.ok(wrapper.includes("await requireAdmin()"), "must call requireAdmin()");
  assert.ok(
    wrapper.includes('from("user_identity_verifications")'),
    "loads the verification queue via the service-role client"
  );
  assert.ok(
    wrapper.includes("order(\"created_at\", { ascending: false })"),
    "newest-first order preserved"
  );
  assert.ok(
    wrapper.includes("<IdentityVerificationsAdminClient initialSubmissions={enrichedSubmissions} />"),
    "passes enriched rows to the client"
  );
});

test("approve/reject/request-info keep endpoint, method, and payload", () => {
  assert.ok(
    src.includes("fetch(`/api/admin/identity-verifications/${submissionId}`, {"),
    "endpoint shape kept"
  );
  assert.ok(src.includes('method: "PATCH"'), "PATCH kept");
  assert.ok(src.includes("status: actionStatus,"), "status payload kept");
  assert.ok(src.includes("reviewer_notes: notes,"), "reviewer_notes payload kept");
  for (const status of ["approved", "rejected", "needs_more_info"]) {
    assert.ok(
      src.includes(`handleReviewAction(sub.id, "${status}")`),
      `${status} action still wired`
    );
  }
  assert.ok(
    src.includes("Submission successfully updated to '${actionStatus}'."),
    "success toast kept"
  );
  assert.ok(src.includes("router.refresh()"), "refresh-after-mutation kept");
});

test("API route keeps admin gate and allowlist, flips verification status", () => {
  assert.ok(route.includes("getCurrentUser()"), "auth check kept");
  assert.ok(route.includes("isAdmin()"), "admin check kept");
  assert.ok(
    route.includes('["approved", "rejected", "needs_more_info"]'),
    "status allowlist kept"
  );
  const lib = fs.readFileSync(
    path.join(here, "..", "..", "..", "..", "lib", "identity-verifications.ts"),
    "utf8"
  );
  assert.ok(
    lib.includes('identity_status: profileStatus'),
    "approve/reject still syncs profiles.identity_status (verified/rejected)"
  );
});

test("submitted default and five tabs with counts are preserved", () => {
  assert.deepEqual(
    (adminPageCopy["identity-verifications"].tabs ?? []).map((t) => t.value),
    ["submitted", "needs_more_info", "approved", "rejected", "all"]
  );
  assert.ok(
    src.includes('useState<string>("submitted")'),
    "default filter stays submitted"
  );
  assert.ok(src.includes("filterStatus === t.value"), "tabs drive the filter");
  assert.ok(src.includes("count: submissions.filter"), "tabs keep per-status counts");
  assert.ok(!src.includes("search={"), "no search added (none existed)");
});

test("columns keep person/status/date/type/documents/notes", () => {
  for (const id of ["person", "status", "submitted", "idtype", "documents", "notes"]) {
    assert.ok(src.includes(`id: "${id}"`), `column ${id} kept`);
  }
  assert.ok(src.includes("sub.user_name"), "person name kept");
  assert.ok(src.includes("sub.user_email"), "person email kept");
  assert.ok(src.includes("sub.submitter_notes"), "submitter notes kept");
  assert.ok(src.includes("sub.reviewer_notes"), "reviewer notes kept");
  assert.ok(
    src.includes("Reviewer notes / explanation (required if rejecting or requesting more info)..."),
    "reviewer-notes prompt kept"
  );
});

test("primary approves, menu holds request-info, reject is destructive-last", () => {
  assert.ok(src.includes('key: "approve"'), "approve primary kept");
  assert.ok(src.includes("Approve Identity"), "approve copy kept");
  assert.ok(src.includes('key: "request-info"'), "request-info in menu");
  assert.ok(
    src.indexOf('key: "request-info"') < src.indexOf('key: "reject"'),
    "reject stays after request-info"
  );
  assert.ok(src.includes("destructive: true"), "reject stays destructive");
  assert.ok(
    src.includes("if (!isActionable(sub.status)) return undefined"),
    "decided rows carry no actions"
  );
});

test("dates stay en-US + UTC and overview links the default queue", () => {
  assert.ok(
    src.includes('toLocaleString("en-US", { timeZone: "UTC" })'),
    "UTC date convention kept"
  );
  const overview = fs.readFileSync(
    path.join(
      here, "..", "..", "..", "..",
      "components", "admin", "overview", "data.ts"
    ),
    "utf8"
  );
  assert.ok(
    overview.includes('href: "/admin/users/identity-verifications"'),
    "attention row links the queue (submitted default applies)"
  );
});
