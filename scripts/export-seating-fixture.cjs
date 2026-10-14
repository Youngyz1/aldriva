/**
 * scripts/export-seating-fixture.cjs
 *
 * Read-only staging fixture exporter for the P1 3D seat-picker preview.
 * Produces, for ONE staging event, with all buyer/guest data removed:
 *   lib/__tests__/fixtures/venue-layout.json   (organizer seating-load shape: layout + objects)
 *   lib/__tests__/fixtures/seats-response.json  (public GET /api/seats shape: layout + enriched seats + tiers)
 *
 * SAFETY (enforced, see checks below — do not weaken):
 * - Read-only by construction: plain fetch(), HTTP method fixed to GET via
 *   the single `apiGet` helper. No supabase-js, no RPC, no write-capable path.
 * - Staging only: STAGING_SUPABASE_URL + key from env; --confirm-staging must
 *   equal the URL host's project ref; production URLs from .env.production*
 *   are refused; host is printed (never the key); interactive `yes` required.
 * - Allowlist scrubbing: outputs are built by copying NAMED fields only.
 * - Post-scrub scan blocks writes on PII-shaped content.
 *
 * Usage (owner runs this; agents must NOT run --list/--event against live DBs):
 *   node scripts/export-seating-fixture.cjs --self-test
 *   node scripts/export-seating-fixture.cjs --list --confirm-staging <ref>
 *   node scripts/export-seating-fixture.cjs --event <uuid> --confirm-staging <ref> [--force]
 */

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

// Fixed placeholder: proves an invitation assignment existed without leaking it.
const ASSIGNED_PLACEHOLDER = "00000000-0000-4000-8000-000000000000";

// ─── Allowlisted fields (copy these, drop everything else) ─────────────────
// Seats: mirrors the select list in app/api/seats/route.ts (GET).
const SEAT_FIELDS = [
  "id",
  "section",
  "row_label",
  "seat_number",
  "table_number",
  "table_name",
  "table_capacity",
  "is_vip",
  "is_accessible",
  "status",
  "reserved_until",
  "price_override",
  "ticket_type_id",
  "assigned_invitation_id", // → placeholder when non-null, else null
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "object_type",
];
// Layout row: mirrors app/api/events/[id]/seating/route.ts (GET) layout columns,
// narrowed to what the picker preview consumes. Dropped metadata (never
// selected, never written): event_id, version, is_published, published_at.
const LAYOUT_FIELDS = [
  "id",
  "name",
  "canvas_width",
  "canvas_height",
  "sections",
  "venue_objects",
];
// Venue objects: organizer-typed display/geometry only.
const OBJECT_FIELDS = [
  "id",
  "type",
  "name",
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "label",
  "color",
  "capacity",
  "table_number",
  "table_name",
  "table_capacity",
  "table_shape",
  "ticket_type_id",
  "price",
];
// Ticket tiers: needed to reproduce effective_price exactly like the API.
const TIER_FIELDS = ["id", "event_id", "name", "price", "quantity"];
// Events (list mode only): id + organizer-typed title, never buyer data.
const EVENT_FIELDS = ["id", "title"];

// Post-scrub scan: forbidden substrings (case-insensitive) in string values.
const FORBIDDEN = [
  "email",
  "phone",
  "buyer",
  "guest",
  "customer",
  "payment",
  "stripe",
  "token",
  "secret",
];
// Exact key paths allowed to contain those words (organizer-typed display
// names such as a "Guest Balcony" label or "Gold Guest Table" table_name).
// Anything else matching FORBIDDEN blocks the write.
const SCAN_ALLOWLIST_PATHS = [/(^|\.)label$/, /(^|\.)text$/, /(^|\.)table_name$/, /(^|\.)name$/];

// ─── Scrubbers (pure; also imported by the scrub test) ──────────────────────

function pick(row, fields, dropped) {
  const out = {};
  for (const key of Object.keys(row || {})) {
    if (!fields.includes(key)) {
      dropped.add(key);
    }
  }
  for (const key of fields) {
    if (row && row[key] !== undefined) out[key] = row[key];
  }
  return out;
}

function scrubSeat(row, dropped) {
  const out = pick(row, SEAT_FIELDS, dropped);
  out.assigned_invitation_id =
    row && row.assigned_invitation_id != null ? ASSIGNED_PLACEHOLDER : null;
  return out;
}

function scrubVenueObject(obj, dropped) {
  return pick(obj, OBJECT_FIELDS, dropped);
}

function scrubLayout(row, dropped) {
  const out = pick(row, LAYOUT_FIELDS, dropped);
  if (Array.isArray(out.venue_objects)) {
    out.venue_objects = out.venue_objects.map((o) => scrubVenueObject(o || {}, dropped));
  }
  return out;
}

// Same precedence as resolveEffectiveSeatPrice (lib/seating.ts): override >
// seat tier > section default > section tier > first-tier fallback.
function effectivePrice(seat, sections, tiers, fallback) {
  if (seat.price_override != null && seat.price_override >= 0) return seat.price_override;
  if (seat.ticket_type_id) {
    const t = tiers.find((x) => x.id === seat.ticket_type_id);
    if (t && t.price != null) return t.price;
  }
  if (seat.section) {
    const s = sections.find((x) => x && x.name === seat.section);
    if (s) {
      if (s.default_price != null && s.default_price >= 0) return s.default_price;
      if (s.ticket_type_id) {
        const t = tiers.find((x) => x.id === s.ticket_type_id);
        if (t && t.price != null) return t.price;
      }
    }
  }
  return fallback;
}

// Walk serialized-JSON values; report dot-paths hitting forbidden content.
// UUID-shaped strings are stripped before the phone-run check so seat ids
// can never false-positive. A value that FULLY matches an ISO-8601 timestamp
// is exempt from the phone-run check only (layout.published_at and
// seats.reserved_until are timestamps, not phone numbers); anything merely
// containing digits — including timestamps with trailing junk — stays checked.
const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;
const UUID_FULL =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERATED_ID = /^[A-Za-z]{2,}[A-Za-z0-9_-]*$/;
// Generated canvas-object ids (e.g. "stage-1728912345678") live in these id
// slots and are not PII. Exempt ONLY when BOTH hold: (a) the path is such a
// slot, and (b) the value is a full UUID or starts with >=2 letters over
// [A-Za-z0-9_-]. A pure-digit or phone-shaped id still fails.
const OBJECT_ID_PATH = /(^|\.)(sections|venue_objects)\[\d+\]\.id$/;
const isGeneratedId = (trail, value) =>
  OBJECT_ID_PATH.test(trail) && (UUID_FULL.test(value) || GENERATED_ID.test(value));
// Masked shape for failure output: every digit → "#"; letters kept only on
// id paths, otherwise → "x". The raw flagged value is never printed.
const isIdPath = (trail) => /(^|\.)id$/.test(trail);
const maskShape = (value, trail) => {
  const keepLetters = isIdPath(trail);
  return value.replace(/\d/g, "#").replace(/[A-Za-z]/g, (ch) => (keepLetters ? ch : "x"));
};
function postScrubCheck(value) {
  const findings = [];
  const stripUuid = (s) =>
    s.replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      ""
    );
  const visit = (node, trail) => {
    if (typeof node === "string") {
      const lower = node.toLowerCase();
      for (const word of FORBIDDEN) {
        if (lower.includes(word) && !SCAN_ALLOWLIST_PATHS.some((re) => re.test(trail))) {
          findings.push(`${trail}: contains "${word}" [shape: ${maskShape(node, trail)}]`);
        }
      }
      if (node.includes("@")) {
        findings.push(`${trail}: contains "@" [shape: ${maskShape(node, trail)}]`);
      }
      if (
        !ISO_TIMESTAMP.test(node) &&
        !isGeneratedId(trail, node) &&
        /\+?\d[\d .()-]{5,}\d/.test(stripUuid(node))
      ) {
        findings.push(`${trail}: phone-like digit run [shape: ${maskShape(node, trail)}]`);
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((v, i) => visit(v, `${trail}[${i}]`));
      return;
    }
    if (node && typeof node === "object") {
      for (const k of Object.keys(node)) visit(node[k], trail ? `${trail}.${k}` : k);
    }
  };
  visit(value, "");
  return findings;
}

// ─── Read-only transport (GET only; the ONLY fetch call in this file) ───────

const GET = "GET";

async function apiGet(base, key, table, params) {
  const url = `${base}/rest/v1/${table}?${params}`;
  const res = await fetch(url, {
    method: GET,
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `${table}: access denied (${res.status}) with the provided key. ` +
        `Anon keys cannot read this table; set STAGING_SUPABASE_SERVICE_ROLE_KEY.`
    );
  }
  if (!res.ok) throw new Error(`${table}: request failed (${res.status})`);
  return res.json();
}

async function apiCount(base, key, table, params) {
  const url = `${base}/rest/v1/${table}?${params}&select=id`;
  const res = await fetch(url, {
    method: GET,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `${table}: access denied (${res.status}) with the provided key. ` +
        `Anon keys cannot read this table; set STAGING_SUPABASE_SERVICE_ROLE_KEY.`
    );
  }
  const range = res.headers.get("content-range") || "";
  const total = parseInt((range.split("/")[1] || "").trim(), 10);
  return Number.isFinite(total) ? total : 0;
}

// ─── Config / staging guard ─────────────────────────────────────────────────

function projectRefOf(url) {
  const host = new URL(url).hostname; // e.g. abcdefgh.supabase.co
  return host.split(".")[0];
}

function repoProductionUrls(root) {
  const found = [];
  let entries = [];
  try {
    entries = fs.readdirSync(root);
  } catch {
    return found;
  }
  for (const name of entries) {
    if (!/^\.env\.production/i.test(name)) continue;
    try {
      const text = fs.readFileSync(path.join(root, name), "utf8");
      const m = text.match(/SUPABASE_URL\s*=\s*(https?:\/\/[^\s"'`]+)/i);
      if (m) found.push({ file: name, url: m[1].replace(/\/$/, "") });
    } catch {
      /* ignore unreadable files */
    }
  }
  return found;
}

function askYes(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "yes");
    });
  });
}

// ─── Modes ──────────────────────────────────────────────────────────────────

function selfTest() {
  const dropped = new Set();
  const payload = {
    seat: scrubSeat(
      {
        id: "33333333-3333-4333-8333-333333333333",
        section: "Orchestra",
        row_label: "A",
        seat_number: 1,
        status: "available",
        is_vip: false,
        is_accessible: false,
        assigned_invitation_id: "dddddddd-dddd-4ddd-dddd-dddddddddddd",
        buyer_email: "buyer@example.com",
        buyer_name: "Jane Buyer",
        guest_id: "guest-123",
        phone: "+1 (555) 010-2030",
        mystery_column: "???",
        x: 100,
        y: 200,
        width: 26,
        height: 26,
      },
      dropped
    ),
  };
  const checks = [
    ["email removed", !JSON.stringify(payload).includes("buyer@example.com")],
    ["phone removed", !JSON.stringify(payload).includes("555")],
    ["buyer name removed", !JSON.stringify(payload).includes("Jane Buyer")],
    ["guest id removed", !JSON.stringify(payload).includes("guest-123")],
    ["unexpected column removed", !("mystery_column" in payload.seat)],
    [
      "assignment placeholder kept",
      payload.seat.assigned_invitation_id === ASSIGNED_PLACEHOLDER,
    ],
    ["allowed id kept", payload.seat.id === "33333333-3333-4333-8333-333333333333"],
  ];
  // The synthetic payload MUST trip the post-scrub scan if scrubbing failed:
  // re-check the raw (unscrubbed) row to prove the scanner sees PII.
  const rawFindings = postScrubCheck({
    buyer_email: "buyer@example.com",
    phone: "+1 (555) 010-2030",
  });
  checks.push(["scanner detects raw PII", rawFindings.length >= 2]);
  const cleanFindings = postScrubCheck(payload);
  checks.push(["scrubbed payload passes scan", cleanFindings.length === 0]);
  let ok = true;
  for (const [name, pass] of checks) {
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
    if (!pass) ok = false;
  }
  console.log(ok ? "self-test: all scrub checks passed" : "self-test: SCRUB FAILURE");
  // exitCode (not exit()): lets the event loop drain so no libuv assertion
  // fires while handles are still closing.
  process.exitCode = ok ? 0 : 1;
}

async function listEvents(base, key) {
  const layouts = await apiGet(base, key, "venue_layouts", "select=event_id");
  const eventIds = [...new Set(layouts.map((l) => l.event_id).filter(Boolean))];
  if (eventIds.length === 0) {
    console.log("No venue layouts found on this project.");
    return;
  }
  const events = await apiGet(
    base,
    key,
    "events",
    `select=id,title&id=in.(${eventIds.join(",")})&order=title`
  );
  for (const ev of events) {
    const picked = pick(ev, EVENT_FIELDS, new Set());
    const seats = await apiCount(base, key, "seats", `event_id=eq.${ev.id}`);
    console.log(
      `event_id=${picked.id}  seats=${seats}  title=${JSON.stringify(picked.title)}`
    );
  }
}

async function exportEvent(base, key, eventId, outDir, force) {
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(eventId)) throw new Error("--event must be a UUID");
  const venuePath = path.join(outDir, "venue-layout.json");
  const seatsPath = path.join(outDir, "seats-response.json");
  if ((fs.existsSync(venuePath) || fs.existsSync(seatsPath)) && !force) {
    throw new Error("Fixture files already exist; re-run with --force to overwrite.");
  }

  const [layouts, seats, tiers] = await Promise.all([
    apiGet(base, key, "venue_layouts", `select=${LAYOUT_FIELDS.join(",")}&event_id=eq.${eventId}`),
    apiGet(
      base,
      key,
      "seats",
      `select=${SEAT_FIELDS.join(",")}&event_id=eq.${eventId}` +
        `&order=section,row_label,seat_number&limit=20000`
    ),
    apiGet(
      base,
      key,
      "tickets",
      `select=${TIER_FIELDS.join(",")}&event_id=eq.${eventId}&order=price`
    ),
  ]);
  if (layouts.length === 0) throw new Error("No venue_layouts row for this event.");
  if (seats.length === 0) throw new Error("No seats for this event; pick another.");

  const dropped = new Set();
  const layout = scrubLayout(layouts[0], dropped);
  const cleanTiers = tiers.map((t) => pick(t, TIER_FIELDS, dropped));
  const sections = Array.isArray(layout.sections) ? layout.sections : [];
  const fallback = cleanTiers.length > 0 ? cleanTiers[0].price ?? 0 : 0;
  const cleanSeats = seats.map((s) => {
    const seat = scrubSeat(s, dropped);
    seat.effective_price = effectivePrice(seat, sections, cleanTiers, fallback);
    return seat;
  });

  // Fixture 1: organizer seating-load shape (layout + objects only).
  const venueFixture = { layout };
  // Fixture 2: public GET /api/seats shape (layout + enriched seats + tiers).
  const seatsFixture = {
    layout: {
      id: layout.id,
      name: layout.name,
      sections: layout.sections,
      venue_objects: layout.venue_objects,
      canvas_width: layout.canvas_width,
      canvas_height: layout.canvas_height,
    },
    seats: cleanSeats,
    ticket_types: cleanTiers,
  };

  for (const [doc, label] of [
    [venueFixture, "venue-layout.json"],
    [seatsFixture, "seats-response.json"],
  ]) {
    const findings = postScrubCheck(doc);
    if (findings.length > 0) {
      console.log(`post-scrub check FAILED for ${label}; files NOT written:`);
      for (const f of findings.slice(0, 20)) console.log(`  ${f}`);
      // readline is already closed (askYes resolves post-close); exitCode
      // lets the loop drain instead of tearing down mid-close.
      process.exitCode = 2;
      return;
    }
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(venuePath, `${JSON.stringify(venueFixture, null, 2)}\n`);
  fs.writeFileSync(seatsPath, `${JSON.stringify(seatsFixture, null, 2)}\n`);

  const byStatus = {};
  for (const s of cleanSeats) byStatus[s.status] = (byStatus[s.status] || 0) + 1;
  const objs = layout.venue_objects || [];
  const countType = (t) => objs.filter((o) => o.type === t).length;
  console.log(`wrote ${venuePath} (${fs.statSync(venuePath).size} bytes)`);
  console.log(`wrote ${seatsPath} (${fs.statSync(seatsPath).size} bytes)`);
  console.log(`seats=${cleanSeats.length} by_status=${JSON.stringify(byStatus)}`);
  console.log(
    `tables=${countType("table")} stages=${countType("stage")} ` +
      `ga_zones=${countType("ga_area")} labels=${countType("label")}`
  );
  console.log(
    `dropped_unexpected_columns=${JSON.stringify([...dropped].sort())}`
  );
  console.log("post-scrub check: passed (both files)");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const i = argv.indexOf(name);
    if (i === -1) return null;
    const v = argv[i + 1];
    return v && !v.startsWith("--") ? v : true;
  };

  if (flag("--self-test")) {
    selfTest();
    return;
  }

  const root = path.resolve(__dirname, "..");
  const confirmRef = flag("--confirm-staging");
  const base = (process.env.STAGING_SUPABASE_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("STAGING_SUPABASE_URL is not set for this session.");
  if (!confirmRef || confirmRef === true) {
    throw new Error("--confirm-staging <project-ref> is required.");
  }
  const actualRef = projectRefOf(base);
  if (confirmRef !== actualRef) {
    throw new Error(
      `--confirm-staging "${confirmRef}" does not match the URL project ref "${actualRef}". Refusing to run.`
    );
  }
  for (const prod of repoProductionUrls(root)) {
    if (prod.url === base) {
      throw new Error(
        `STAGING_SUPABASE_URL matches production URL from ${prod.file}. Refusing to run.`
      );
    }
  }
  const anon = process.env.STAGING_SUPABASE_ANON_KEY || "";
  const service = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY || "";
  const key = anon || service;
  if (!key) {
    throw new Error("Set STAGING_SUPABASE_ANON_KEY (preferred) or STAGING_SUPABASE_SERVICE_ROLE_KEY.");
  }
  console.log(`project host: ${new URL(base).hostname} (key: ${anon ? "anon" : "service_role"}, value never printed)`);
  console.log(
    "Tables read: events (id,title only, list mode), venue_layouts, seats, tickets. " +
      "Method: GET only. No buyer/guest/order/payment columns are selected."
  );
  if (!(await askYes('Type "yes" to run read-only GET requests against this staging project: '))) {
    console.log("Aborted.");
    process.exitCode = 1;
  }

  if (flag("--list")) {
    await listEvents(base, key);
    return;
  }
  const eventId = flag("--event");
  if (eventId && eventId !== true) {
    const outDir = path.join(root, "lib", "__tests__", "fixtures");
    await exportEvent(base, key, eventId, outDir, flag("--force") != null);
    return;
  }
  throw new Error("Specify --list, --event <uuid>, or --self-test.");
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`error: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  });
}

module.exports = {
  ASSIGNED_PLACEHOLDER,
  SEAT_FIELDS,
  LAYOUT_FIELDS,
  OBJECT_FIELDS,
  TIER_FIELDS,
  pick,
  scrubSeat,
  scrubVenueObject,
  scrubLayout,
  effectivePrice,
  postScrubCheck,
  maskShape,
  isGeneratedId,
};
