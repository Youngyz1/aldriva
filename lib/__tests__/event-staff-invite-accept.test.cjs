/**
 * lib/__tests__/event-staff-invite-accept.test.cjs
 *
 * STAFF ROUND A2: invitations carry display-only labels + staff name.
 *
 * - Pure units: label sanitize (trim, 80/80/120, control-strip,
 *   empty-to-null) and invite-token hash (shape, determinism, uniqueness).
 * - Static pins: invite route validates labels and never routes them into
 *   authz; the profiles.email lookup is gone (auth.users RPC path);
 *   tokens stored as hashes; accept previews then accepts with a
 *   name-only edit; labels copied to members; no badge created in A2;
 *   expired/revoked/double-accept guards intact.
 * - EN/FR parity for the 12 new staff keys.
 * - Migration 166 SQL-shape: hash column + helper + pending guard +
 *   plaintext drop, byte-identical mirror, reversing rollback.
 */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");

function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function codeOf(rel) {
  return src(rel)
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

const labels = require("../staff/staff-labels.ts");
const inviteTokens = require("../staff/invite-tokens.ts");

describe("staff label sanitize", () => {
  test("trims and keeps plain labels", () => {
    assert.deepEqual(labels.sanitizeOptionalLabel("  VIP door  ", 80), { ok: true, value: "VIP door" });
  });

  test("enforces the 80/80/120 limits", () => {
    assert.equal(labels.sanitizeOptionalLabel("A".repeat(80), 80).ok, true);
    assert.equal(labels.sanitizeOptionalLabel("A".repeat(81), 80).ok, false);
    assert.equal(labels.sanitizeOptionalLabel("B".repeat(120), 120).ok, true);
    assert.equal(labels.sanitizeOptionalLabel("B".repeat(121), 120).ok, false);
  });

  test("strips control characters (newline, tab, DEL) but keeps unicode", () => {
    assert.deepEqual(labels.sanitizeOptionalLabel("Main\nentrance", 80), { ok: true, value: "Mainentrance" });
    assert.deepEqual(labels.sanitizeOptionalLabel("Tab\there", 80), { ok: true, value: "Tabhere" });
    assert.deepEqual(labels.sanitizeOptionalLabel("X" + String.fromCharCode(127) + "Y", 80), { ok: true, value: "XY" });
    assert.deepEqual(labels.sanitizeOptionalLabel("Porte VIP — entrée", 80), {
      ok: true,
      value: "Porte VIP — entrée",
    });
  });

  test("empty/whitespace/missing becomes null; non-strings rejected", () => {
    assert.deepEqual(labels.sanitizeOptionalLabel("   ", 80), { ok: true, value: null });
    assert.deepEqual(labels.sanitizeOptionalLabel(undefined, 80), { ok: true, value: null });
    assert.deepEqual(labels.sanitizeOptionalLabel(null, 80), { ok: true, value: null });
    assert.equal(labels.sanitizeOptionalLabel(5, 80).ok, false);
    assert.equal(labels.sanitizeOptionalLabel({ role: "x" }, 80).ok, false);
  });

  test("limit constants match the migration CHECKs", () => {
    assert.equal(labels.STAFF_ROLE_LABEL_MAX, 80);
    assert.equal(labels.STAFF_POSITION_LABEL_MAX, 80);
    assert.equal(labels.STAFF_NAME_MAX, 120);
  });
});

describe("invite token hash", () => {
  test("minted tokens are 64-char hex", () => {
    const token = inviteTokens.generateInviteToken();
    assert.match(token, /^[0-9a-f]{64}$/);
  });

  test("hash is deterministic SHA-256 hex and differs per token", () => {
    const a = inviteTokens.generateInviteToken();
    const b = inviteTokens.generateInviteToken();
    assert.equal(inviteTokens.hashInviteToken(a), inviteTokens.hashInviteToken(a));
    assert.match(inviteTokens.hashInviteToken(a), /^[0-9a-f]{64}$/);
    assert.notEqual(inviteTokens.hashInviteToken(a), inviteTokens.hashInviteToken(b));
    assert.notEqual(inviteTokens.hashInviteToken(a), a, "hash never equals plaintext");
  });
});

describe("invite route: labels in, permission from enum only", () => {
  const ROUTE = "app/api/events/[id]/team/invite/route.ts";

  test("parses and bounds roleLabel/positionLabel/staffName with a 400 on overflow", () => {
    const s = src(ROUTE);
    assert.ok(s.includes("sanitizeOptionalLabel(body.roleLabel, STAFF_ROLE_LABEL_MAX)"));
    assert.ok(s.includes("sanitizeOptionalLabel(body.positionLabel, STAFF_POSITION_LABEL_MAX)"));
    assert.ok(s.includes("sanitizeOptionalLabel(body.staffName, STAFF_NAME_MAX)"));
    assert.ok(s.includes("status: 400"), "overflow rejected");
  });

  test("permission gate unchanged: fixed enum allowlist + event_manager authz", () => {
    const s = src(ROUTE);
    assert.ok(s.includes('["event_manager", "ticket_scanner"].includes(role)'), "enum allowlist kept");
    assert.ok(s.includes('hasEventOrOrganizerAccess(user.id, eventId, ["event_manager"])'), "manager gate kept");
  });

  test("labels never reach authorization: no label near the access check", () => {
    const s = src(ROUTE);
    const gateAt = s.indexOf("hasEventOrOrganizerAccess(user.id, eventId");
    const window = s.slice(Math.max(0, gateAt - 400), gateAt + 200);
    assert.ok(!window.includes("roleLabelInput") && !window.includes("positionLabelInput"), "labels absent at gate");
    assert.ok(!s.includes("hasEventOrOrganizerAccess(user.id, eventId, body"), "gate never takes client input");
  });

  test("stores labels + token_hash, never the plaintext token column", () => {
    const s = src(ROUTE);
    assert.ok(s.includes("role_label: roleLabelInput.value"));
    assert.ok(s.includes("position_label: positionLabelInput.value"));
    assert.ok(s.includes("staff_name: staffNameInput.value"));
    assert.ok(s.includes("token_hash: tokenHash"), "hash stored");
    assert.ok(!s.includes("token,"), "no plaintext token property written");
    assert.ok(s.includes("hashInviteToken(token)"), "emailed token hashed before write");
  });

  test("profiles.email lookup bug fixed via the auth.users RPC path", () => {
    const s = src(ROUTE);
    assert.ok(!s.includes('.from("profiles")'), "no profiles table read");
    // One email ilike remains: the pending-invitation dedupe on
    // event_team_invitations (a TEXT column, not the missing profiles one).
    const ilikes = s.match(/\.ilike\("email"/g) || [];
    assert.equal(ilikes.length, 1, "single remaining email ilike is the invitation dedupe");
    assert.ok(s.includes('rpc("get_user_id_by_email"'), "auth.users helper used");
  });
});

describe("accept route: preview, hash lookup, name-only edit", () => {
  const ROUTE = "app/api/events/team/accept/route.ts";

  test("GET preview exists with the same guards and no state change", () => {
    const s = src(ROUTE);
    assert.ok(s.includes("export async function GET"), "preview handler present");
    assert.ok(s.includes("guardInvite"), "shared guards reused");
    const getBody = s.slice(s.indexOf("export async function GET"), s.indexOf("export async function POST"));
    assert.ok(!getBody.includes(".update(") && !getBody.includes(".upsert("), "preview never writes");
    assert.ok(getBody.includes("roleLabel: row.role_label"), "labels surfaced");
  });

  test("lookups hash-compare; plaintext token never touches the database", () => {
    const s = src(ROUTE);
    assert.ok(s.includes('eq("token_hash", hashInviteToken(token))'), "hash lookup");
    assert.ok(!s.includes('eq("token",'), "no plaintext lookup");
  });

  test("invitee edits staff_name only: body role/labels ignored", () => {
    const s = src(ROUTE);
    assert.ok(s.includes("sanitizeOptionalLabel(body.staffName, STAFF_NAME_MAX)"), "name validated");
    assert.ok(!s.includes("body.role") && !s.includes("body.roleLabel") && !s.includes("body.positionLabel"), "no other body fields read");
  });

  test("labels + name copied to members; permission copied from the row enum; no badge", () => {
    const s = src(ROUTE);
    assert.ok(s.includes("role_label: row.role_label"), "role label copied");
    assert.ok(s.includes("position_label: row.position_label"), "position copied");
    assert.ok(s.includes("staff_name: staffName"), "confirmed name copied");
    assert.ok(s.includes("role: row.role"), "permission from row enum");
    assert.ok(!s.includes("badge_token") && !s.includes("badge_token_hash"), "no badge created in A2");
  });

  test("expired, revoked, and double-accept guards intact", () => {
    const s = src(ROUTE);
    assert.ok(s.includes("status: 410"), "expired rejected");
    assert.ok(s.includes("already been ${row.status}"), "non-pending (incl. revoked) rejected");
    assert.ok(s.includes('.eq("status", "pending")'), "atomic conditional update kept");
    assert.ok(s.includes("no longer valid or has already been accepted"), "double-accept 409 kept");
    assert.ok(s.includes("row.email.toLowerCase() !== normalizedUserEmail"), "email match kept");
  });
});

describe("resend route + bindPending label support", () => {
  test("resend rotates the hash, never plaintext", () => {
    const s = src("app/api/events/[id]/team/invitations/[inviteId]/resend/route.ts");
    assert.ok(s.includes("token_hash: hashInviteToken(newToken)"), "hash rotated");
    assert.ok(!s.includes("token: newToken"), "no plaintext write");
  });

  test("bindPending copies labels + name on auto-accept", () => {
    const s = src("lib/event-auth.ts");
    assert.ok(s.includes("role_label, position_label, staff_name"), "labels selected");
    assert.ok(s.includes("role_label: invite.role_label"), "labels upserted");
    assert.ok(s.includes("staff_name: invite.staff_name"), "name upserted");
  });

  test("team list API selects the new columns for members + invitations", () => {
    const s = src("app/api/events/[id]/team/route.ts");
    assert.ok(s.includes("role_label,\n        position_label,\n        staff_name,"), "member + invitation selects extended");
  });
});

describe("team UI surfaces labels, name, and permission separately", () => {
  test("TeamClient invite form posts labels + name", () => {
    const s = src("app/dashboard/events/[id]/team/TeamClient.tsx");
    assert.ok(s.includes("roleLabel: inviteRoleLabel"), "role label posted");
    assert.ok(s.includes("positionLabel: invitePositionLabel"), "position posted");
    assert.ok(s.includes("staffName: inviteStaffName"), "name posted");
  });

  test("TeamClient shows staff name, labels, and a separate permission pill", () => {
    const s = src("app/dashboard/events/[id]/team/TeamClient.tsx");
    assert.ok(s.includes("m.staff_name || m.user_name"), "member name prefers staff_name");
    assert.ok(s.includes("[m.role_label, m.position_label].filter(Boolean).join("), "labels rendered");
    assert.ok(s.includes('title={m.role === "event_manager" ? t("staffPermissionManager")'), "permission pill separate with title");
  });

  test("accept page previews details and confirms/edits the name only", () => {
    const s = src("app/events/team/accept/page.tsx");
    assert.ok(s.includes("/api/events/team/accept?token="), "preview fetch present");
    assert.ok(s.includes("t(\"staffAcceptNameLabel\")"), "name confirm label");
    assert.ok(s.includes("body: JSON.stringify({ token, staffName })"), "POST carries name only");
    assert.ok(s.includes("t(\"staffAcceptButton\")"), "localized accept CTA");
  });
});

describe("staff i18n parity (EN/FR)", () => {
  const KEYS = [
    "staffRoleLabel",
    "staffRoleLabelPlaceholder",
    "staffPositionLabel",
    "staffPositionLabelPlaceholder",
    "staffName",
    "staffNamePlaceholder",
    "staffPermissionManager",
    "staffPermissionScanner",
    "staffLabelTooLong",
    "staffAcceptNameLabel",
    "staffAcceptButton",
    "staffAccepting",
  ];

  test("all 12 staff keys exist in en + fr, non-empty, translated", () => {
    const en = JSON.parse(src("messages/en.json")).Events;
    const fr = JSON.parse(src("messages/fr.json")).Events;
    assert.equal(KEYS.length, 12);
    for (const k of KEYS) {
      assert.ok(typeof en[k] === "string" && en[k].length > 0, `en ${k}`);
      assert.ok(typeof fr[k] === "string" && fr[k].length > 0, `fr ${k}`);
      assert.notEqual(fr[k], en[k], `${k} translated`);
    }
  });
});

describe("migration 166 files + content", () => {
  const FORWARD = "db/migration_166_invite_token_hash.sql";
  const ROLLBACK = "db/migration_166_invite_token_hash_rollback.sql";
  const MIRROR = "supabase/migrations/20261010000002_migration_166_invite_token_hash.sql";

  test("forward, rollback twin and supabase mirror exist; mirror byte-identical; no rollback in supabase", () => {
    assert.ok(fs.existsSync(path.join(ROOT, FORWARD)));
    assert.ok(fs.existsSync(path.join(ROOT, ROLLBACK)));
    assert.ok(fs.existsSync(path.join(ROOT, MIRROR)));
    assert.equal(src(MIRROR), src(FORWARD), "mirror byte-identical");
    const dir = fs.readdirSync(path.join(ROOT, "supabase/migrations"));
    assert.ok(!dir.some((f) => f.includes("166") && f.includes("rollback")));
  });

  test("hash column unique + hex-shaped; email helper definer-only for service_role", () => {
    const s = codeOf(FORWARD);
    assert.ok(s.includes("ADD COLUMN IF NOT EXISTS token_hash TEXT"));
    assert.ok(s.includes("CREATE UNIQUE INDEX IF NOT EXISTS idx_event_team_invitations_token_hash"));
    assert.ok(s.includes("CHECK (token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$')"));
    assert.ok(s.includes("CREATE OR REPLACE FUNCTION public.get_user_id_by_email("));
    assert.ok(s.includes("SECURITY DEFINER"), "elevated auth.users read");
    assert.ok(s.includes("FROM auth.users WHERE LOWER(email)"), "email path, not profiles");
    assert.ok(s.includes("GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(TEXT) TO service_role"));
  });

  test("pending guard aborts before the plaintext drop", () => {
    const s = codeOf(FORWARD);
    assert.ok(s.includes("MIGRATION_166_ABORTED"), "machine-readable abort");
    assert.ok(s.includes("WHERE status = 'pending'"), "pending rows block");
    assert.ok(s.includes("RAISE EXCEPTION"), "abort is loud");
    const guardAt = s.indexOf("MIGRATION_166_ABORTED");
    assert.ok(guardAt < s.indexOf("DROP COLUMN IF EXISTS token"), "guard before drop");
    assert.ok(s.includes("ALTER TABLE public.event_team_invitations DROP COLUMN IF EXISTS token"));
  });

  test("no column-level REVOKE in 166", () => {
    const s = codeOf(FORWARD);
    for (const line of s.split("\n")) {
      // Column REVOKEs look like REVOKE SELECT (col); the FUNCTION revoke
      // carries parens for its signature and is table-level-equivalent.
      if (line.trimStart().startsWith("REVOKE")) {
        assert.ok(!/REVOKE[^;]*SELECT\s*\(/.test(line), `no column REVOKE, got: ${line.trim()}`);
      }
    }
  });

  test("rollback guards on hashes and restores plaintext behind a redeploy note", () => {
    const s = fs.readFileSync(path.join(ROOT, ROLLBACK), "utf8");
    assert.ok(s.includes("ROLLBACK_ABORTED"), "abort reason");
    assert.ok(s.includes("WHERE token_hash IS NOT NULL"), "hash guard present");
    assert.ok(s.includes("ADD COLUMN IF NOT EXISTS token TEXT"), "plaintext restored");
    assert.ok(s.includes("DROP FUNCTION IF EXISTS public.get_user_id_by_email(TEXT)"), "helper dropped");
    assert.ok(s.includes("BEGIN;") && s.includes("COMMIT;"), "transaction wrapped");
  });

  test("isolation: no guest check-in / offline objects in executable SQL", () => {
    const s = codeOf(FORWARD).toLowerCase();
    for (const forbidden of ["check_in_ticket", "ticket_instances", "ticket_checkins", "offline"]) {
      assert.ok(!s.includes(forbidden), `must not mention ${forbidden}`);
    }
  });
});
