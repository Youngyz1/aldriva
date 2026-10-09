/**
 * lib/__tests__/event-memories.test.cjs
 *
 * Round 4: guest photo Memories.
 * - Pure units: memory token format, QR-vs-admission disambiguation,
 *   magic-byte sniffing, streaming-ZIP structural integrity, retention
 *   cutoff math, rate-limit registry.
 * - Static pins: migration 162 (+rollback twin + byte-identical mirror),
 *   storage driver interface, guest endpoints, dashboard moderation,
 *   scanner rejection WITHOUT touching the check-in RPC, Rule-1 gates,
 *   cron dry-run default + flag OFF.
 */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "../..");
function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const tokens = require("../memories/tokens.ts");
const zip = require("../memories/zip.ts");
const photoFormat = require("../memories/photo-format.ts");
const retentionPolicy = require("../memories/retention-policy.ts");

describe("memory tokens: unguessable, revocable, never admission-shaped", () => {
  test("minted tokens carry the mem_ prefix and 32 base62 chars", () => {
    const a = tokens.generateMemoryToken();
    const b = tokens.generateMemoryToken();
    assert.ok(tokens.isMemoryTokenFormat(a), "minted token validates");
    assert.notEqual(a, b, "tokens are unique");
    assert.equal(a.length, 4 + 32);
    assert.ok(/^mem_[0-9A-Za-z]{32}$/.test(a), "exact alphabet");
  });

  test("format rejects admission QRs, short strings, and wrong prefixes", () => {
    assert.equal(tokens.isMemoryTokenFormat("A1B2C3D4E5F60718293A4B5C6D7E8F90"), false);
    assert.equal(tokens.isMemoryTokenFormat("mem_short"), false);
    assert.equal(tokens.isMemoryTokenFormat("inv_0123456789abcdefghij01234567"), false);
    assert.equal(tokens.isMemoryTokenFormat(null), false);
  });

  test("admission format never matches a memory token", () => {
    assert.equal(tokens.isAdmissionQrFormat("A1B2C3D4E5F60718293A4B5C6D7E8F90"), true);
    assert.equal(tokens.isAdmissionQrFormat(tokens.generateMemoryToken()), false);
    assert.equal(tokens.isAdmissionQrFormat("mem_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), false);
  });

  test("scanner detects memory-QR payloads (bare token, full URL, /m/ path)", () => {
    const bare = tokens.generateMemoryToken();
    assert.equal(tokens.isMemoryQrScan(bare), true);
    assert.equal(tokens.isMemoryQrScan(`https://aldriva.com/m/${bare}`), true);
    assert.equal(tokens.isMemoryQrScan("/m/mem_abcDEF123"), true);
    assert.equal(tokens.isMemoryQrScan("A1B2C3D4E5F60718293A4B5C6D7E8F90"), false);
    assert.equal(tokens.isMemoryQrScan("hello world"), false);
    assert.equal(
      tokens.MEMORY_QR_SCANNER_MESSAGE,
      "This is a photo-upload code, not an admission ticket."
    );
  });
});

describe("magic-byte sniffing rejects non-photos", () => {
  test("jpeg / png / webp / heic headers classify correctly", () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(16),
    ]);
    const webp = Buffer.concat([Buffer.from("RIFF1234WEBP"), Buffer.alloc(8)]);
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]), Buffer.from("heic"), Buffer.alloc(8)]);
    assert.equal(photoFormat.detectPhotoKind(jpeg), "jpeg");
    assert.equal(photoFormat.detectPhotoKind(png), "png");
    assert.equal(photoFormat.detectPhotoKind(webp), "webp");
    assert.equal(photoFormat.detectPhotoKind(heic), "heic");
  });

  test("scripts, svg, truncated and random bytes are rejected", () => {
    assert.equal(photoFormat.detectPhotoKind(Buffer.from("<svg xmlns='x'></svg> padded....")), null);
    assert.equal(photoFormat.detectPhotoKind(Buffer.from("GIF89a..............")), null);
    assert.equal(photoFormat.detectPhotoKind(Buffer.alloc(4)), null);
    assert.equal(photoFormat.detectPhotoKind(crypto.randomBytes(64)), null);
  });

  test("15 MB cap constant matches the bucket limit", () => {
    assert.equal(photoFormat.MEMORY_MAX_BYTES, 15 * 1024 * 1024);
  });
});

describe("streaming ZIP is structurally sound", () => {
  test("crc32 matches the IEEE reference vector", () => {
    assert.equal(zip.crc32(Buffer.from("123456789")), 0xcbf43926);
  });

  function parseZip(buf) {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    assert.equal(view.getUint32(0, true), 0x04034b50, "starts with a local header");
    // Walk local entries via the central directory at the end.
    const endOffset = buf.length - 22;
    assert.equal(view.getUint32(endOffset, true), 0x06054b50, "ends with end-of-central-dir");
    const centralCount = view.getUint16(endOffset + 8, true);
    const centralSize = view.getUint32(endOffset + 12, true);
    const centralOffset = view.getUint32(endOffset + 16, true);
    assert.equal(centralOffset + centralSize + 22, buf.length, "central directory abuts the end record");
    return { centralCount, centralOffset, view };
  }

  test("two files round-trip with correct names, sizes, and CRCs", async () => {
    const a = Buffer.from("hello memories");
    const b = Buffer.from([0, 1, 2, 3, 4, 5]);
    const chunks = [];
    for await (const c of zip.streamStoredZip([
      { name: "memory-001-abc123.jpg", size: a.length, body: (async function* () { yield a; })() },
      { name: "memory-002-def456.png", size: b.length, body: (async function* () { yield b.slice(0, 3); yield b.slice(3); })() },
    ])) {
      chunks.push(Buffer.from(c));
    }
    const out = Buffer.concat(chunks);
    const { centralCount, centralOffset, view } = parseZip(out);
    assert.equal(centralCount, 2);

    // Central record 1 → name, crc, size, local-header offset.
    let pos = centralOffset;
    assert.equal(view.getUint32(pos, true), 0x02014b50);
    const crc1 = view.getUint32(pos + 16, true);
    const size1 = view.getUint32(pos + 24, true);
    const nameLen1 = view.getUint16(pos + 28, true);
    const name1 = Buffer.from(out.subarray(pos + 46, pos + 46 + nameLen1)).toString();
    const off1 = view.getUint32(pos + 42, true);
    assert.equal(name1, "memory-001-abc123.jpg");
    assert.equal(size1, a.length);
    assert.equal(crc1, zip.crc32(a));
    // Local header points at the data right after its own header+name.
    const dataOff1 = off1 + 30 + nameLen1;
    assert.deepEqual(Buffer.from(out.subarray(dataOff1, dataOff1 + size1)), a);
    // Descriptor follows the data.
    assert.equal(view.getUint32(dataOff1 + size1, true), 0x08074b50);
  });

  test("short reads and overflows abort the stream", async () => {
    await assert.rejects(async () => {
      for await (const chunk of zip.streamStoredZip([
        { name: "x.jpg", size: 10, body: (async function* () { yield Buffer.alloc(4); })() },
      ])) {
        assert.ok(chunk instanceof Uint8Array);
      }
    }, /short read/);
    await assert.rejects(async () => {
      for await (const chunk of zip.streamStoredZip([
        { name: "x.jpg", size: 2, body: (async function* () { yield Buffer.alloc(4); })() },
      ])) {
        assert.ok(chunk instanceof Uint8Array);
      }
    }, /overflow/);
  });
});

describe("retention policy math", () => {
  test("cutoff prefers end_date, then event_date, then newest upload", () => {
    const end = retentionPolicy.computeRetentionCutoff({
      endDate: "2025-01-15T00:00:00.000Z",
      eventDate: "2025-01-10T00:00:00.000Z",
      newestUploadAt: "2025-02-01T00:00:00.000Z",
    });
    assert.equal(end.toISOString(), "2026-01-15T00:00:00.000Z");
    const fallback = retentionPolicy.computeRetentionCutoff({
      endDate: null,
      eventDate: null,
      newestUploadAt: "2025-02-01T00:00:00.000Z",
    });
    assert.equal(fallback.toISOString(), "2026-02-01T00:00:00.000Z");
    assert.equal(
      retentionPolicy.computeRetentionCutoff({ endDate: null, eventDate: null, newestUploadAt: null }),
      null
    );
    assert.equal(
      retentionPolicy.computeRetentionCutoff({ endDate: "not-a-date", eventDate: null, newestUploadAt: null }),
      null
    );
  });

  test("notice windows: 7d wins over 30d, sent notices never repeat", () => {
    assert.equal(retentionPolicy.dueNoticeKind(40, false, false), null);
    assert.equal(retentionPolicy.dueNoticeKind(20, false, false), "30d");
    assert.equal(retentionPolicy.dueNoticeKind(20, true, false), null);
    assert.equal(retentionPolicy.dueNoticeKind(5, false, false), "7d");
    assert.equal(retentionPolicy.dueNoticeKind(5, false, true), null);
    assert.equal(retentionPolicy.MEMORY_RETENTION_MONTHS, 12);
  });

  test("live delete flag defaults OFF", () => {
    assert.equal(retentionPolicy.isLiveMemoryRetentionDeleteEnabled({}), false);
    assert.equal(
      retentionPolicy.isLiveMemoryRetentionDeleteEnabled({ ENABLE_MEMORY_RETENTION_DELETE: "1" }),
      true
    );
    assert.equal(
      retentionPolicy.isLiveMemoryRetentionDeleteEnabled({ ENABLE_MEMORY_RETENTION_DELETE: "0" }),
      false
    );
  });
});

describe("migration 162: memories schema, RLS, private bucket", () => {
  const FWD = "db/migration_162_event_memories.sql";
  const ROLLBACK = "db/migration_162_event_memories_rollback.sql";
  const MIRROR = "supabase/migrations/20261009000000_migration_162_event_memories.sql";

  test("forward migration creates the four tables with guards", () => {
    const s = src(FWD);
    for (const t of ["event_memory_settings", "event_memories", "event_memory_reports", "event_memory_retention_notices"]) {
      assert.ok(s.includes(`CREATE TABLE IF NOT EXISTS public.${t}`), t);
      assert.ok(s.includes(`ENABLE ROW LEVEL SECURITY`), `${t} RLS`);
    }
    assert.ok(s.includes("UNIQUE (event_id)"), "settings 1:1 with events");
    assert.ok(s.includes("upload_token"), "upload credential column");
    assert.ok(s.includes("require_approval"), "approval toggle column");
    assert.ok(s.includes("delete_token_hash"), "uploader delete credential column");
    assert.ok(s.includes("status IN ('pending', 'approved', 'rejected')"), "moderation states");
    assert.ok(s.includes("PRIMARY KEY (event_id, notice_kind)"), "notice idempotency key");
    assert.ok(s.includes("GRANT ALL ON TABLE public.event_memories TO service_role"), "service-role grant");
    assert.ok(s.includes("'event-memories'"), "private bucket id");
    assert.ok(s.includes("false,\n  15728640"), "private + 15 MB bucket limit");
  });

  test("rollback drops in reverse order and never deletes objects", () => {
    const s = src(ROLLBACK);
    assert.ok(s.includes("DROP TABLE IF EXISTS public.event_memory_reports"), "reports first");
    assert.ok(s.includes("DROP TABLE IF EXISTS public.event_memory_settings"), "settings last");
    assert.ok(s.includes("NOT EXISTS"), "bucket dropped only when empty");
  });

  test("supabase mirror is byte-identical to the canonical file", () => {
    const fwd = fs.readFileSync(path.join(ROOT, FWD), "utf8");
    const mirror = fs.readFileSync(path.join(ROOT, MIRROR), "utf8");
    assert.equal(mirror, fwd, "mirror must stay byte-identical");
  });
});

describe("guest endpoints: rate-limited, private, token-scoped", () => {
  test("upload-url, complete, report, and photo-delete routes exist with limits", () => {
    for (const f of [
      "app/api/memories/[token]/upload-url/route.ts",
      "app/api/memories/[token]/complete/route.ts",
      "app/api/memories/[token]/report/route.ts",
      "app/api/memories/photo/[deleteToken]/route.ts",
      "app/m/[token]/page.tsx",
      "app/m/[token]/MemoryUploadClient.tsx",
    ]) {
      assert.ok(fs.existsSync(path.join(ROOT, f)), f);
    }
    const issue = src("app/api/memories/[token]/upload-url/route.ts");
    assert.ok(issue.includes('"memoryUploadUrl"'), "issuance rate limit");
    assert.ok(issue.includes("memoryPendingKey"), "pending namespace");
    const done = src("app/api/memories/[token]/complete/route.ts");
    assert.ok(done.includes('"memoryUploadComplete"'), "completion rate limit");
    assert.ok(done.includes("finalizeMemoryPhoto"), "server-side pipeline");
    assert.ok(done.includes("deleteToken"), "uploader credential returned once");
    const report = src("app/api/memories/[token]/report/route.ts");
    assert.ok(report.includes('"memoryReport"'), "report rate limit");
    assert.ok(report.includes("reporter_ip: null"), "no reporter IPs persisted");
    const page = src("app/m/[token]/page.tsx");
    assert.ok(page.includes('"memoryView"'), "guest page rate limit");
    assert.ok(page.includes("index: false"), "guest page noindex");
  });

  test("RSVP POST carries per-IP + per-token buckets", () => {
    const s = src("app/api/invitation/[token]/rsvp/route.ts");
    assert.ok(s.includes('"invitationRsvp"'), "rsvp rate limit");
    assert.ok(s.includes("token:"), "per-token bucket");
  });

  test("no /i/ alias route was created (canonical /invitation/[token] kept)", () => {
    assert.ok(!fs.existsSync(path.join(ROOT, "app/i")), "no /i/ route tree");
    assert.ok(fs.existsSync(path.join(ROOT, "app/m/[token]/page.tsx")), "/m/ route exists");
  });

  test("proxy matcher + Navbar + no-store cover /m/", () => {
    assert.ok(src("proxy.ts").includes('"/m/:path*"'), "proxy matcher entry");
    const navbar = src("components/Navbar.tsx");
    assert.ok(navbar.includes('startsWith("/m/")'), "chrome-free /m/ pages");
    assert.ok(src("next.config.ts").includes('"/m/:token*"'), "no-store header source");
  });
});

describe("scanner rejects memory QRs without touching the check-in RPC", () => {
  test("verify-ticket answers the clear message on both verbs", () => {
    const s = src("app/api/verify-ticket/route.ts");
    assert.ok(s.includes("isMemoryQrScan"), "prefix check present");
    assert.ok(s.includes("MEMORY_QR_SCANNER_MESSAGE"), "shared copy");
    assert.ok(s.includes('"memory_code"'), "machine-readable status");
    assert.ok(
      s.indexOf("isMemoryQrScan(code)") < s.indexOf('rpc("check_in_ticket"'),
      "rejection happens before the RPC is reachable"
    );
  });

  test("the check-in RPC migration is untouched by Round 4", () => {
    const rpc = src("db/migration_79_ticket_instances.sql");
    assert.ok(!rpc.toLowerCase().includes("memory"), "no memory logic in the RPC");
    assert.ok(!rpc.toLowerCase().includes("mem_"), "no memory prefix in the RPC");
  });
});

describe("storage driver: R2 private in prod, Supabase private elsewhere", () => {
  test("interface carries the five operations and env selection", () => {
    const s = src("lib/memories/storage.ts");
    for (const op of ["signPut", "stat", "getBytes", "putBytes", "signGet", "delete"]) {
      assert.ok(s.includes(op), `driver op ${op}`);
    }
    assert.ok(s.includes("MEMORY_STORAGE_DRIVER"), "env selection");
    assert.ok(s.includes("event-memories"), "private Supabase bucket");
    assert.ok(s.includes("R2_PRIVATE_BUCKET"), "private R2 bucket");
    assert.ok(s.includes("getMemoryStorageDriverFor"), "per-row provider driver");
  });

  test("env example documents the driver and the OFF retention flag", () => {
    const env = src(".env.example");
    assert.ok(env.includes("MEMORY_STORAGE_DRIVER=supabase"), "driver default documented");
    assert.ok(env.includes("ENABLE_MEMORY_RETENTION_DELETE"), "flag documented as unset");
  });
});
describe("Rule-1 + slug gate pins for Round 4", () => {
  test("public slug pages 404 explicitly with generic metadata", () => {
    const s = src("app/events/[slug]/page.tsx");
    assert.ok(s.includes("explicit invitation-kind gate"), "gate comment");
    assert.ok(s.includes("isInvitationEvent(event"), "page gate");
    assert.ok(s.includes("invitationSlugMetadata()"), "metadata helper wired");
  });

  test("invitation slugs emit only noindex + the generic nonexistent-slug title", () => {
    const { invitationSlugMetadata } = require("../event-slug-metadata.ts");
    const meta = invitationSlugMetadata();
    assert.deepEqual(Object.keys(meta).sort(), ["robots", "title"], "no description/canonical/OG/twitter keys");
    assert.equal(meta.title, "Event — Aldriva", "matches the nonexistent-slug fallback title");
    assert.deepEqual(meta.robots, { index: false, follow: false, nocache: true });
  });

  test("dashboard memories tab serves both kinds with manager auth", () => {
    const page = src("app/dashboard/events/[id]/memories/page.tsx");
    assert.ok(page.includes('"event_manager"'), "manager gate");
    assert.ok(page.includes("signGet"), "short-lived signed view URLs");
    assert.ok(!page.includes("isInvitationEvent"), "no kind gate on memories");
    assert.ok(fs.existsSync(path.join(ROOT, "app/api/events/[id]/memories/zip/route.ts")), "zip route");
    const zipRoute = src("app/api/events/[id]/memories/zip/route.ts");
    assert.ok(zipRoute.includes("MAX_ZIP_FILES"), "file-count cap");
    assert.ok(zipRoute.includes("MAX_ZIP_BYTES"), "byte cap");
    assert.ok(zipRoute.includes("streamStoredZip"), "streaming writer");
  });

  test("retention cron dry-runs by default behind the env arm", () => {
    const route = src("app/api/cron/memory-retention/route.ts");
    assert.ok(route.includes("isAuthorizedCronRequest"), "cron auth");
    assert.ok(route.includes('get("live") === "1"'), "explicit live flag");
    const job = src("lib/memories/retention.ts");
    assert.ok(job.includes("isLiveMemoryRetentionDeleteEnabled"), "env arm checked");
    assert.ok(job.includes("dry run"), "dry-run logging");
    const email = src("lib/memories/retention-email.ts");
    assert.ok(email.includes("12-month photo retention policy"), "policy copy");
    assert.ok(email.includes("Download your photos"), "download CTA");
    assert.ok(email.includes("buildRetentionNoticeText"), "plain-text mirror exists");
  });
});

describe("image hardening: pixel cap, HEIC budget, route timeout", () => {
  test("50 MP cap constant and boundary enforcement", () => {
    assert.equal(photoFormat.MEMORY_MAX_PIXELS, 50_000_000);
    assert.equal(photoFormat.MEMORY_MAX_PIXELS_HEIC, 30_000_000);
    assert.equal(photoFormat.HEIC_CONVERT_TIMEOUT_MS, 20_000);
    assert.doesNotThrow(() => photoFormat.enforceMaxPixels(8000, 6000), "48 MP passes");
    assert.doesNotThrow(() => photoFormat.enforceMaxPixels(10000, 5000), "exactly 50 MP passes");
    assert.throws(() => photoFormat.enforceMaxPixels(10000, 6000), /50 megapixel/, "60 MP rejected");
    assert.throws(() => photoFormat.enforceMaxPixels(0, 100), /50 megapixel/, "zero width rejected");
    assert.throws(() => photoFormat.enforceMaxPixels(null, 100), /50 megapixel/, "missing dims rejected");
  });

  test("HEIC 30 MP boundary uses the explicit cap", () => {
    const cap = photoFormat.MEMORY_MAX_PIXELS_HEIC;
    assert.doesNotThrow(() => photoFormat.enforceMaxPixels(6000, 5000, cap), "exactly 30 MP passes");
    assert.throws(
      () => photoFormat.enforceMaxPixels(6000, 5001, cap),
      /30 megapixel/,
      "just over 30 MP rejected with the HEIC copy"
    );
  });

  /** Minimal ftyp + meta → iprp → ipco → ispe container. */
  function heicBuffer(width, height) {
    const box = (type, payload) => {
      const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
      const out = Buffer.alloc(8 + body.length);
      out.writeUInt32BE(out.length, 0);
      out.write(type, 4, 4, "ascii");
      body.copy(out, 8);
      return out;
    };
    const ispePayload = Buffer.alloc(12);
    ispePayload.writeUInt32BE(width, 4);
    ispePayload.writeUInt32BE(height, 8);
    const ftypPayload = Buffer.concat([Buffer.from("heic"), Buffer.alloc(4), Buffer.from("heic")]);
    return Buffer.concat([
      box("ftyp", ftypPayload),
      box("meta", Buffer.concat([Buffer.alloc(4), box("iprp", box("ipco", box("ispe", ispePayload)))])),
    ]);
  }

  test("HEIC dimensions read from the container header without decoding", () => {
    assert.deepEqual(photoFormat.readHeicDimensions(heicBuffer(4032, 3024)), { width: 4032, height: 3024 });
    assert.deepEqual(photoFormat.readHeicDimensions(heicBuffer(12000, 9000)), { width: 12000, height: 9000 });
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
    assert.equal(photoFormat.readHeicDimensions(jpeg), null);
    assert.equal(photoFormat.readHeicDimensions(Buffer.alloc(10)), null);
    assert.equal(photoFormat.readHeicDimensions(Buffer.alloc(0)), null);
    // ftyp without a meta box: well-formed but dimension-less.
    const ftypOnly = Buffer.concat([
      (() => {
        const out = Buffer.alloc(20);
        out.writeUInt32BE(20, 0);
        out.write("ftyp", 4, 4, "ascii");
        out.write("heic", 12, 4, "ascii");
        return out;
      })(),
    ]);
    assert.equal(photoFormat.readHeicDimensions(ftypOnly), null);
  });

  test("conversion budget rejects hung work cleanly", async () => {
    assert.equal(await photoFormat.withTimeout(Promise.resolve("done"), 1000, "probe"), "done");
    await assert.rejects(
      photoFormat.withTimeout(new Promise(() => {}), 30, "HEIC conversion"),
      /HEIC conversion timed out/,
      "hung decode fails with mappable error"
    );
  });

  test("pipeline wires all enforcement layers plus the route budgets", () => {
    const pipeline = src("lib/memories/photos.ts");
    assert.ok(pipeline.includes("limitInputPixels"), "sharp decode-time bomb guard");
    assert.ok(pipeline.includes("readHeicDimensions"), "pre-decode HEIC header check");
    assert.ok(pipeline.includes("MEMORY_MAX_PIXELS_HEIC"), "lower HEIC cap wired");
    assert.ok(pipeline.includes("could not be verified"), "unreadable HEIC header rejects outright");
    assert.ok(pipeline.includes("withTimeout"), "conversion budget");
    assert.ok(pipeline.includes("HEIC_CONVERT_TIMEOUT_MS"), "20s budget constant");
    assert.ok(pipeline.includes("30 megapixel"), "HEIC rejection copy");
    assert.ok(pipeline.includes("50 megapixel"), "native-decode rejection copy");
    const complete = src("app/api/memories/[token]/complete/route.ts");
    assert.ok(complete.includes("maxDuration = 60"), "explicit complete-route budget");
    const zipRoute = src("app/api/events/[id]/memories/zip/route.ts");
    assert.ok(zipRoute.includes("maxDuration = 60"), "explicit zip-route budget");
  });
});

describe("Memories serve BOTH event kinds (owner-confirmed, pinned)", () => {
  test("no kind gate on the memories page, actions, or guest routes", () => {
    for (const f of [
      "app/dashboard/events/[id]/memories/page.tsx",
      "lib/actions/event-memories.ts",
      "app/api/memories/[token]/upload-url/route.ts",
      "app/api/memories/[token]/complete/route.ts",
      "app/api/memories/[token]/report/route.ts",
      "app/api/memories/photo/[deleteToken]/route.ts",
      "app/api/events/[id]/memories/zip/route.ts",
    ]) {
      const s = src(f);
      assert.ok(!s.includes("isInvitationEvent"), `${f} must not branch on event kind`);
      assert.ok(!s.includes("assertInvitationKindEvent"), `${f} must not require invitation kind`);
      assert.ok(!s.includes("EVENT_KIND"), `${f} must not reference kind constants`);
    }
  });

  test("approval-required is the default on every event, public-kind included", () => {
    const actions = src("lib/actions/event-memories.ts");
    assert.ok(actions.includes("require_approval: true"), "mint defaults to approval-required");
    const complete = src("app/api/memories/[token]/complete/route.ts");
    assert.ok(
      complete.includes('require_approval === false ? "approved" : "pending"'),
      "uploads pend unless the organizer explicitly opted out"
    );
  });

  test("guest surface exposes no list of other guests' photos", () => {
    for (const f of [
      "app/api/memories/[token]/upload-url/route.ts",
      "app/api/memories/[token]/complete/route.ts",
      "app/api/memories/[token]/report/route.ts",
    ]) {
      const s = src(f);
      assert.ok(s.includes("export async function POST"), `${f} is write-only`);
      assert.ok(!s.includes("export async function GET"), `${f} exposes no read list`);
    }
    const client = src("app/m/[token]/MemoryUploadClient.tsx");
    assert.ok(client.includes("Your uploads this visit"), "guests see only their session uploads");
  });
});
