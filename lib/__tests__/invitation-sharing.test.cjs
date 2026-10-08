/**
 * lib/__tests__/invitation-sharing.test.cjs
 *
 * Round 3 COMMIT 3: general share link + send.
 * - Migration 156 files exist with the three share columns; 154 mirror backfilled.
 * - Share works only when enabled, published and kind=invitation; rotation
 *   kills the old token; the shared page carries no guest data.
 * - Personal guest links are unchanged on both kinds.
 */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "../..");
function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("migration 156 files exist", () => {
  test("forward, rollback twin and supabase mirror are all present", () => {
    assert.ok(fs.existsSync(path.join(ROOT, "db/migration_156_invitation_share_link.sql")));
    assert.ok(fs.existsSync(path.join(ROOT, "db/migration_156_invitation_share_link_rollback.sql")));
    assert.ok(
      fs.existsSync(
        path.join(ROOT, "supabase/migrations/20261007000003_migration_156_invitation_share_link.sql")
      )
    );
  });

  test("154 mirror backfilled and byte-identical", () => {
    const mirror = path.join(ROOT, "supabase/migrations/20261007000002_migration_154_invitation_pages.sql");
    assert.ok(fs.existsSync(mirror), "154 mirror must exist");
    assert.equal(
      fs.readFileSync(mirror, "utf8"),
      fs.readFileSync(path.join(ROOT, "db/migration_154_invitation_pages.sql"), "utf8")
    );
  });

  test("mirrors are byte-identical, no rollbacks in supabase/migrations", () => {
    assert.equal(
      src("supabase/migrations/20261007000003_migration_156_invitation_share_link.sql"),
      src("db/migration_156_invitation_share_link.sql")
    );
    const dir = fs.readdirSync(path.join(ROOT, "supabase/migrations"));
    assert.ok(!dir.some((f) => f.includes("rollback")), "rollbacks never go in supabase/migrations");
  });
});

describe("migration 156 forward content", () => {
  const FWD = "db/migration_156_invitation_share_link.sql";
  test("three share columns with safe defaults", () => {
    const s = src(FWD);
    assert.ok(s.includes("ADD COLUMN IF NOT EXISTS share_token TEXT"));
    assert.ok(s.includes("event_invitation_pages_share_token_key UNIQUE (share_token)"));
    assert.ok(s.includes("ADD COLUMN IF NOT EXISTS share_enabled BOOLEAN NOT NULL DEFAULT false"));
    assert.ok(s.includes("ADD COLUMN IF NOT EXISTS share_regenerated_at TIMESTAMPTZ"));
  });
  test("transaction wrapped, re-runnable", () => {
    const s = src(FWD);
    assert.ok(s.includes("BEGIN;") && s.includes("COMMIT;"));
    assert.ok(s.includes("NOTIFY pgrst, 'reload schema';"));
  });
});

describe("migration 156 rollback content", () => {
  test("reverses in reverse order, re-runnable", () => {
    const s = src("db/migration_156_invitation_share_link_rollback.sql");
    const order = [
      "DROP COLUMN IF EXISTS share_regenerated_at",
      "DROP COLUMN IF EXISTS share_enabled",
      "DROP CONSTRAINT IF EXISTS event_invitation_pages_share_token_key",
      "DROP COLUMN IF EXISTS share_token",
    ];
    let last = -1;
    for (const step of order) {
      const at = s.indexOf(step);
      assert.ok(at > last, `rollback order: ${step}`);
      last = at;
    }
  });
});

describe("share actions", () => {
  const S = "lib/actions/invitation-sharing.ts";
  test("tokens are 256-bit random, never slug or guest token", () => {
    const s = src(S);
    assert.ok(s.includes("randomBytes(32).toString(\"hex\")"), "256-bit hex token");
    assert.ok(!s.includes("share_token: slug"), "slug never stored as token");
    assert.ok(!s.includes("invitation.token"), "guest token never reused");
  });
  test("enable and regenerate require published invitation kind", () => {
    const s = src(S);
    assert.ok(s.includes('Share links exist only for invitation events'), "kind gate");
    assert.ok(s.includes("Publish the invitation before sharing"), "published gate");
  });
  test("enable mints on first use; regenerate stamps rotation", () => {
    const s = src(S);
    assert.ok(s.includes("share_token: token"), "enable persists the token");
    assert.ok(s.includes("share_regenerated_at"), "rotation is audited");
  });
  test("host state exposes enabled + url only when actually shareable", () => {
    const s = src(S);
    assert.ok(s.includes("url: enabled && token ? buildShareUrl(token) : null"));
  });
});

describe("shared page", () => {
  const P = "app/invitation/shared/[token]/page.tsx";
  test("token format gate, rate limit, triple gate", () => {
    const s = src(P);
    assert.ok(s.includes("/^[a-f0-9]{64}$/"), "format checked before any DB hit");
    assert.ok(s.includes('checkRateLimit("invitationShareView"'), "per-IP rate limit");
    assert.ok(s.includes("share_enabled !== true"), "enabled gate");
    assert.ok(s.includes('page_status !== "published"'), "published gate");
    assert.ok(s.includes('kind !== "invitation"'), "invitation-kind gate");
  });
  test("every failure lands on the same neutral page", () => {
    const s = src(P);
    const unavailable = (s.match(/SharedUnavailable/g) || []).length;
    assert.ok(unavailable >= 5, `all failure paths neutral (found ${unavailable})`);
    const n = src("app/invitation/shared/[token]/SharedUnavailable.tsx");
    assert.ok(!n.includes("event_id"), "neutral page names no event");
    assert.ok(!n.includes("guest_name"), "neutral page names no guest");
    assert.ok(!n.includes("event.title"), "neutral page leaks no title");
    assert.ok(n.includes("personal invitation link"), "points to personal links");
  });
  test("noindex, no-store, always dynamic", () => {
    const s = src(P);
    assert.ok(s.includes("index: false"), "noindex metadata");
    assert.ok(s.includes("await connection()"), "dynamic per hit, not static");
    assert.ok(
      src("next.config.ts").includes("/invitation/shared/:token*"),
      "no-store header for the path"
    );
    assert.ok(src("next.config.ts").includes('"no-store"'), "no-store value set");
  });
  test("read-only assembly: no guest, no QR, shared flag, no RSVP handler", () => {
    const s = src(P);
    assert.ok(s.includes("null,\n    null,\n    null"), "guest/ticket/seat all null");
    assert.ok(s.includes("shared />") || s.includes("shared}"), "shared flag passed");
    assert.ok(!s.includes("onRsvp"), "no RSVP handler wired");
    assert.ok(s.includes("Untitled invitation"), "placeholder belt-and-suspenders");
  });
});

describe("templates in shared mode", () => {
  test("all four templates plus registry accept shared", () => {
    assert.ok(src("components/invitation/templates/registry.ts").includes("shared?: boolean"));
    for (const f of [
      "components/invitation/templates/InvitationTemplate1.tsx",
      "components/invitation/templates/InvitationTemplateWedding.tsx",
      "components/invitation/templates/InvitationTemplateBirthday.tsx",
      "components/invitation/templates/InvitationTemplateBlackTie.tsx",
    ]) {
      const s = src(f);
      assert.ok(s.includes("shared?: boolean"), `${f} accepts shared`);
      assert.ok(s.includes("shared = false"), `${f} defaults to personal mode`);
      assert.ok(s.includes("<SharedNote"), `${f} renders the neutral note`);
      const sharedBranches = (s.match(/\{shared \?/g) || []).length;
      assert.ok(sharedBranches >= 2, `${f} gates greeting and pass zones (${sharedBranches})`);
    }
  });
});

describe("dashboard share panel", () => {
  const P = "components/invitation/ShareLinkPanel.tsx";
  test("enable, copy, disable, confirmed regenerate", () => {
    const s = src(P);
    assert.ok(s.includes("Enable share link"), "enable present");
    assert.ok(s.includes('data-testid="copy-link"'), "copy pinnable");
    assert.ok(s.includes("Click again to confirm"), "regenerate confirms inline");
    assert.ok(s.includes("regenerateShareToken"), "rotation wired");
    assert.ok(s.includes("Anyone with this link"), "plain-language warning");
  });
  test("hidden on public events, gated on published", () => {
    const s = src(P);
    assert.ok(s.includes("if (!isInvitationKind) return null"), "never shown for public kind");
    assert.ok(s.includes("Publish the invitation before sharing"), "published gate messaged");
    assert.ok(s.includes('data-testid="share-prompt"'), "enable prompt pinnable");
  });
  test("invitation home wires the panel with server state", () => {
    const s = src("app/dashboard/events/[id]/invitation-home/InvitationHomeClient.tsx");
    assert.ok(s.includes("ShareLinkPanel"), "panel rendered");
    assert.ok(s.includes("shareEnabled") && s.includes("shareUrl"), "server state passed");
    const page = src("app/dashboard/events/[id]/invitation-home/page.tsx");
    assert.ok(page.includes("getShareLinkState"), "state fetched server-side");
  });
});

describe("personal guest links unchanged on both kinds", () => {
  test("guest route still renders personal data with RSVP", () => {
    const s = src("app/invitation/[token]/page.tsx");
    assert.ok(s.includes("onRsvp"), "RSVP handler kept");
    assert.ok(!s.includes("shared"), "no shared-mode leakage into guest links");
  });
  test("home Send reaches per-guest and bulk sending", () => {
    const s = src("app/dashboard/events/[id]/invitation-home/InvitationHomeClient.tsx");
    assert.ok(s.includes("/guests"), "Send opens guest sending");
    const guests = src("app/dashboard/events/[id]/guests/GuestsClient.tsx");
    assert.ok(guests.includes("Send Invitation Email") || guests.includes("Send invitation"));
    assert.ok(guests.includes("BulkImportModal") || guests.includes("bulkImportModalOpen"));
  });
});
