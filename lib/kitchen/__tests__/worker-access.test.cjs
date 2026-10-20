const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
let db;
let rateAllowed = true;
let accessAllowed = true;
const rateCalls = [];

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolve.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

class FakeQuery {
  constructor(owner, table) {
    this.owner = owner;
    this.table = table;
    this.filters = [];
    this.mode = "select";
    this.one = false;
    this.patch = null;
    this.insertRows = [];
    this.conflict = [];
  }
  select() { return this; }
  eq(key, value) { this.filters.push([key, value, "eq"]); return this; }
  is(key, value) { this.filters.push([key, value, "is"]); return this; }
  gt(key, value) { this.filters.push([key, value, "gt"]); return this; }
  in(key, values) { this.filters.push([key, values, "in"]); return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { this.one = true; return this; }
  single() { this.one = true; return this; }
  insert(rows) { this.mode = "insert"; this.insertRows = Array.isArray(rows) ? rows : [rows]; return this; }
  update(patch) { this.mode = "update"; this.patch = patch; return this; }
  upsert(row, options = {}) {
    this.mode = "upsert";
    this.insertRows = [row];
    this.conflict = String(options.onConflict ?? "").split(",").filter(Boolean);
    return this;
  }
  matches(row) {
    return this.filters.every(([key, value, op]) => {
      if (op === "eq") return row[key] === value;
      if (op === "is") return value === null ? row[key] == null : row[key] === value;
      if (op === "gt") return String(row[key]) > String(value);
      if (op === "in") return value.includes(row[key]);
      return false;
    });
  }
  execute() {
    const rows = this.owner.tables[this.table] ?? (this.owner.tables[this.table] = []);
    if (this.mode === "insert" || this.mode === "upsert") {
      const result = [];
      for (const input of this.insertRows) {
        const index = this.mode === "upsert" && this.conflict.length
          ? rows.findIndex((row) => this.conflict.every((field) => row[field] === input[field]))
          : -1;
        if (index >= 0) {
          Object.assign(rows[index], input);
          result.push(rows[index]);
        } else {
          const row = { id: `fake-${this.table}-${++this.owner.sequence}`, ...input };
          rows.push(row);
          result.push(row);
        }
      }
      return this.one ? result[0] ?? null : result;
    }
    const matched = rows.filter((row) => this.matches(row));
    if (this.mode === "update") {
      for (const row of matched) Object.assign(row, this.patch);
      this.owner.writes.push({ table: this.table, patch: this.patch, count: matched.length });
    } else {
      this.owner.reads.push({ table: this.table, filters: this.filters });
    }
    return this.one ? matched[0] ?? null : matched;
  }
  then(resolve, reject) {
    try {
      if (this.owner.failTables.has(this.table)) return resolve({ data: null, error: { message: "injected failure" } });
      resolve({ data: this.execute(), error: null });
    } catch (error) { reject(error); }
  }
}

function makeDb(tables = {}, rpcHandler = null) {
  return {
    tables: structuredClone(tables),
    reads: [],
    writes: [],
    rpcs: [],
    failTables: new Set(),
    sequence: 0,
    from(table) { return new FakeQuery(this, table); },
    async rpc(name, params) {
      this.rpcs.push({ name, params });
      if (rpcHandler) return rpcHandler(name, params, this);
      return { data: [], error: null };
    },
  };
}

class NextResponseShim extends Response {
  constructor(body, init) {
    super(body, init);
    this.cookies = {
      set: (name, value, options) => {
        const attributes = [`${name}=${value}`, `Path=${options.path}`];
        if (options.maxAge !== undefined) attributes.push(`Max-Age=${options.maxAge}`);
        if (options.httpOnly) attributes.push("HttpOnly");
        if (options.secure) attributes.push("Secure");
        if (options.sameSite) attributes.push(`SameSite=${options.sameSite[0].toUpperCase()}${options.sameSite.slice(1)}`);
        this.headers.append("Set-Cookie", attributes.join("; "));
      },
    };
  }
  static json(value, init = {}) {
    return new NextResponseShim(JSON.stringify(value), {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  }
}

const mockModules = {
  "next/server": () => ({ NextResponse: NextResponseShim }),
  "@/lib/supabase-admin": () => ({ createSupabaseAdmin: () => db }),
  "@/lib/rate-limit": () => ({
    clientIp: () => "203.0.113.10",
    checkRateLimitFailClosed: async (name, identifier) => {
      rateCalls.push({ name, identifier });
      return rateAllowed ? { allowed: true, remaining: 5, retryAfter: 0 } : { allowed: false, remaining: 0, retryAfter: 60 };
    },
  }),
  "@/lib/auth": () => ({ getCurrentUser: async () => ({ id: "manager-a" }) }),
  "@/lib/entity-auth": () => ({
    checkTenantAccess: async (_userId, _organizerId, roles) => ({ hasAccess: accessAllowed && roles.join(",") === "owner,admin,manager" }),
  }),
  "next/cache": () => ({ revalidatePath() {} }),
};

Module._load = function loadMocks(request, parent, isMain) {
  if (mockModules[request]) return mockModules[request]();
  return originalLoad.call(this, request, parent, isMain);
};

function load(rel) {
  const filename = path.join(ROOT, rel);
  delete require.cache[filename];
  return require(filename);
}

function token(seed) { return crypto.createHash("sha256").update(seed).digest("hex"); }
function request(url, method, body, cookie) {
  return new Request(url, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function setCookies(response) {
  return typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") ?? ""];
}

test("mocked: phone formatting enforces four digits and invitation states are derived without secrets", () => {
  const validation = load("lib/kitchen/worker-validation.ts");
  assert.equal(validation.isValidWorkerPhone("+225 (01) 23-45-6789"), true);
  assert.equal(validation.isValidWorkerPhone("123"), false);
  assert.equal(validation.isValidWorkerPhone("call-me-1234"), false);
  assert.equal(validation.isValidWorkerPhone("+225 1234"), true);
  assert.equal(validation.getCookInvitationState({ expires_at: "2999-01-01T00:00:00Z" }), "invited");
  assert.equal(validation.getCookInvitationState({ expires_at: "2000-01-01T00:00:00Z" }), "expired");
  assert.equal(validation.getCookInvitationState({ accepted_at: "2026-01-01T00:00:00Z" }), "accepted");
  assert.equal(validation.getCookInvitationState({ revoked_at: "2026-01-01T00:00:00Z" }), "revoked");
});

test("mocked: kitchen and localized kitchen paths are excluded from analytics", () => {
  const { isKitchenPrivatePath } = load("lib/kitchen/worker-validation.ts");
  for (const pathname of ["/kitchen/accept", "/api/kitchen/session", "/en/kitchen/display", "/fr/api/kitchen/accept"]) {
    assert.equal(isKitchenPrivatePath(pathname), true, pathname);
  }
  assert.equal(isKitchenPrivatePath("/dashboard/org/123/kitchen"), false);
  assert.equal(isKitchenPrivatePath("/kitchenette"), false);
});

test("mocked: invitation bootstrap sets a ten-minute HttpOnly Secure Lax cookie scoped to accept routes", async () => {
  const invite = "a".repeat(64);
  db = makeDb({
    business_worker_invitations: [{ id: "invite-1", worker_id: "worker-1", token_hash: token(invite), expires_at: "2999-01-01T00:00:00.000Z", token_consumed_at: null, revoked_at: null }],
    business_workers: [{ id: "worker-1", role: "cook", is_active: true, deactivated_at: null }],
  });
  rateAllowed = true;
  rateCalls.length = 0;
  const route = load("app/api/kitchen/accept/bootstrap/route.ts");
  const response = await route.POST(request("http://local/api/kitchen/accept/bootstrap", "POST", { token: invite }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  const cookie = setCookies(response).join("; ");
  assert.match(cookie, /aldriva_kitchen_invite=[a-f0-9]{64}/);
  assert.match(cookie, /Path=\/api\/kitchen\/accept/);
  assert.match(cookie, /Max-Age=600/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.equal((await response.json()).token, undefined);
  assert.equal(rateCalls.length, 2);
  assert.ok(rateCalls.every((call) => !call.identifier.includes(invite)));
});

test("mocked: expired, consumed, and revoked invitation rows are rejected before acceptance", async (t) => {
  const invite = "b".repeat(64);
  const route = load("app/api/kitchen/accept/bootstrap/route.ts");
  const cases = [
    { name: "mocked: expired invitation", expires_at: "2000-01-01T00:00:00.000Z", token_consumed_at: null, revoked_at: null },
    { name: "mocked: reused invitation", expires_at: "2999-01-01T00:00:00.000Z", token_consumed_at: "2026-01-01T00:00:00.000Z", revoked_at: null },
    { name: "mocked: revoked invitation", expires_at: "2999-01-01T00:00:00.000Z", token_consumed_at: null, revoked_at: "2026-01-01T00:00:00.000Z" },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      db = makeDb({
        business_worker_invitations: [{ id: "invite-1", worker_id: "worker-1", token_hash: token(invite), ...scenario }],
        business_workers: [{ id: "worker-1", role: "cook", is_active: true, deactivated_at: null }],
      });
      const response = await route.POST(request("http://local/api/kitchen/accept/bootstrap", "POST", { token: invite }));
      assert.equal(response.status, 400);
      assert.equal(setCookies(response).length, 0);
    });
  }
});

test("mocked: deactivated cook cannot bootstrap an invitation", async () => {
  const invite = "c".repeat(64);
  db = makeDb({
    business_worker_invitations: [{ id: "invite-1", worker_id: "worker-1", token_hash: token(invite), expires_at: "2999-01-01T00:00:00.000Z", token_consumed_at: null, revoked_at: null }],
    business_workers: [{ id: "worker-1", role: "cook", is_active: false, deactivated_at: "2026-01-01T00:00:00.000Z" }],
  });
  const route = load("app/api/kitchen/accept/bootstrap/route.ts");
  const response = await route.POST(request("http://local/api/kitchen/accept/bootstrap", "POST", { token: invite }));
  assert.equal(response.status, 400);
  assert.equal(setCookies(response).length, 0);
});

test("mocked: GET acceptance/bootstrap cannot consume an invitation", async () => {
  db = makeDb();
  const route = load("app/api/kitchen/accept/bootstrap/route.ts");
  const response = await route.GET();
  assert.equal(response.status, 405);
  assert.equal(db.rpcs.length, 0);
  assert.equal(db.writes.length, 0);
});

test("mocked: wrong phone digits are sent only to the consume RPC and do not establish a session", async () => {
  const invite = "d".repeat(64);
  db = makeDb({}, async () => ({ data: [], error: null }));
  const route = load("app/api/kitchen/accept/route.ts");
  const response = await route.POST(request("http://local/api/kitchen/accept", "POST", { phoneLast4: "9999" }, `aldriva_kitchen_invite=${invite}`));
  assert.equal(response.status, 400);
  assert.equal(db.rpcs.length, 1);
  assert.equal(db.rpcs[0].name, "consume_business_worker_invitation");
  assert.equal(db.rpcs[0].params.p_invitation_token_hash, token(invite));
  assert.equal(db.rpcs[0].params.p_phone_last4, "9999");
  assert.equal(setCookies(response).some((cookie) => cookie.includes("aldriva_kitchen_session=")), false);
  assert.equal(db.writes.length, 0);
});

test("mocked: accept route ignores a display cookie without an invitation cookie", async () => {
  db = makeDb();
  const route = load("app/api/kitchen/accept/route.ts");
  const response = await route.POST(request(
    "http://local/api/kitchen/accept",
    "POST",
    { phoneLast4: "5678" },
    `aldriva_kitchen_display=${"a".repeat(64)}`
  ));

  assert.equal(response.status, 400);
  assert.equal(db.rpcs.length, 0);
  assert.equal(db.writes.length, 0);
  assert.equal(setCookies(response).length, 0);
});

test("mocked: successful acceptance sets secure session cookie and clears scoped invitation cookie", async () => {
  const invite = "e".repeat(64);
  db = makeDb({}, async (name) => name === "consume_business_worker_invitation"
    ? { data: [{ out_worker_id: "worker-1", out_business_id: "business-1", out_kitchen_id: "kitchen-1", out_session_expires_at: new Date(Date.now() + 29 * 86400000).toISOString() }], error: null }
    : { data: [], error: null });
  const route = load("app/api/kitchen/accept/route.ts");
  const response = await route.POST(request("http://local/api/kitchen/accept", "POST", { phoneLast4: "5678" }, `aldriva_kitchen_invite=${invite}`));
  assert.equal(response.status, 200);
  const cookies = setCookies(response);
  const sessionCookie = cookies.find((cookie) => cookie.includes("aldriva_kitchen_session="));
  const clearedInvite = cookies.find((cookie) => cookie.includes("aldriva_kitchen_invite="));
  assert.match(sessionCookie, /Path=\//);
  assert.match(sessionCookie, /HttpOnly/);
  assert.match(sessionCookie, /Secure/);
  assert.match(sessionCookie, /SameSite=Lax/);
  assert.match(clearedInvite, /Path=\/api\/kitchen\/accept/);
  assert.match(clearedInvite, /Max-Age=0/);
});

test("mocked: session route validates and renews only from the route handler, then refreshes cookie expiry", async () => {
  const session = "f".repeat(64);
  db = makeDb({}, async (name) => name === "validate_and_renew_business_worker_session"
    ? { data: [{ out_worker_id: "worker-1", out_business_id: "business-1", out_kitchen_id: "kitchen-1", out_role: "cook", out_session_expires_at: new Date(Date.now() + 20 * 86400000).toISOString() }], error: null }
    : { data: [], error: null });
  const route = load("app/api/kitchen/session/route.ts");
  const response = await route.GET(request("http://local/api/kitchen/session", "GET", undefined, `aldriva_kitchen_session=${session}`));
  assert.equal(response.status, 200);
  assert.equal(db.rpcs[0].name, "validate_and_renew_business_worker_session");
  assert.equal(db.rpcs[0].params.p_session_token_hash, token(session));
  assert.match(setCookies(response).join("; "), /aldriva_kitchen_session=[a-f0-9]{64}; Path=\/; Max-Age=[1-9][0-9]*; HttpOnly; Secure; SameSite=Lax/);
});

test("mocked: session route ignores a display cookie without a worker session cookie", async () => {
  db = makeDb();
  const route = load("app/api/kitchen/session/route.ts");
  const response = await route.GET(request(
    "http://local/api/kitchen/session",
    "GET",
    undefined,
    `aldriva_kitchen_display=${"b".repeat(64)}`
  ));

  assert.equal(response.status, 401);
  assert.equal(db.rpcs.length, 0);
  assert.equal(db.writes.length, 0);
  assert.match(setCookies(response).join("; "), /aldriva_kitchen_session=; Path=\/; Max-Age=0/);
});

test("mocked: display cookie is invalid after regeneration rotates the stored hash", async () => {
  const oldToken = "1".repeat(64);
  const rotatedToken = "2".repeat(64);
  db = makeDb({
    business_kitchen_display_links: [{ id: "display-1", kitchen_id: "kitchen-1", token_hash: token(rotatedToken), revoked_at: null }],
    business_kitchens: [{ id: "kitchen-1", business_id: "business-a" }],
  });
  const { validateKitchenDisplayToken } = load("lib/kitchen/worker-session.ts");
  assert.equal(await validateKitchenDisplayToken(oldToken), null);
  assert.deepEqual(await validateKitchenDisplayToken(rotatedToken), { kitchenId: "kitchen-1", businessId: "business-a" });
  db.tables.business_kitchen_display_links[0].revoked_at = new Date().toISOString();
  assert.equal(await validateKitchenDisplayToken(rotatedToken), null);

  rateAllowed = true;
  rateCalls.length = 0;
  const route = load("app/api/kitchen/display/bootstrap/route.ts");
  const response = await route.POST(request("http://local/api/kitchen/display/bootstrap", "POST", { token: oldToken }));
  assert.equal(response.status, 400);
  assert.equal(setCookies(response).length, 0);
  assert.ok(rateCalls.some((call) => call.name === "kitchenDisplayBootstrap"));
});

test("mocked: display link resolves to its stored kitchen and business, not caller-supplied scope", async () => {
  const display = "4".repeat(64);
  db = makeDb({
    business_kitchen_display_links: [{ id: "display-1", kitchen_id: "kitchen-a", token_hash: token(display), revoked_at: null }],
    business_kitchens: [{ id: "kitchen-a", business_id: "business-a" }],
  });
  const { validateKitchenDisplayToken } = load("lib/kitchen/worker-session.ts");
  assert.deepEqual(await validateKitchenDisplayToken(display), { kitchenId: "kitchen-a", businessId: "business-a" });
  assert.equal(db.tables.business_kitchen_display_links[0].business_id, undefined);
});

test("mocked: display bootstrap sets a long-lived HttpOnly cookie after strict rate checks", async () => {
  const display = "3".repeat(64);
  db = makeDb({
    business_kitchen_display_links: [{ id: "display-1", kitchen_id: "kitchen-1", token_hash: token(display), revoked_at: null }],
    business_kitchens: [{ id: "kitchen-1", business_id: "business-1" }],
  });
  rateCalls.length = 0;
  const route = load("app/api/kitchen/display/bootstrap/route.ts");
  const response = await route.POST(request("http://local/api/kitchen/display/bootstrap", "POST", { token: display }));
  assert.equal(response.status, 200);
  const cookie = setCookies(response).join("; ");
  assert.match(cookie, /aldriva_kitchen_display=[a-f0-9]{64}/);
  assert.match(cookie, /Path=\/api\/kitchen/);
  assert.match(cookie, /Max-Age=31536000/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.equal(rateCalls.filter((call) => call.name === "kitchenDisplayBootstrap").length >= 2, true);
});

test("mocked: cross-organizer manager cannot create a kitchen for another business", async () => {
  db = makeDb({ businesses: [{ id: "business-b", organizer_id: "organizer-b" }] });
  accessAllowed = true;
  const actions = load("lib/actions/kitchen-management.ts");
  const result = await actions.createKitchen("organizer-a", "business-b");
  assert.deepEqual(result, { ok: false, error: "forbidden" });
  assert.equal(db.writes.length, 0);
  assert.equal(db.tables.business_kitchens, undefined);
});

test("mocked: cook invite stores a hash only and requires valid phone and WhatsApp numbers", async () => {
  db = makeDb({ businesses: [{ id: "business-a", organizer_id: "organizer-a" }] });
  accessAllowed = true;
  const actions = load("lib/actions/kitchen-management.ts");
  const invalid = await actions.inviteCook("organizer-a", "business-a", { fullName: "Cook", phone: "123", whatsappNumber: "+225 1234" });
  assert.equal(invalid.error, "invalid_phone");
  assert.equal(db.writes.length, 0);
  const result = await actions.inviteCook("organizer-a", "business-a", { fullName: "Cook One", phone: "+225 01 23 45 6789", whatsappNumber: "+225 01 23 45 6789" });
  assert.equal(result.ok, true);
  assert.match(result.token, /^[a-f0-9]{64}$/);
  assert.equal(db.tables.business_worker_invitations[0].token_hash, token(result.token));
  assert.notEqual(db.tables.business_worker_invitations[0].token_hash, result.token);
  assert.equal(db.tables.business_workers[0].role, "cook");
  assert.equal(db.tables.business_workers[0].whatsapp_number, "+225 01 23 45 6789");
});

test("mocked: resend rotates the token, clears revoked/consumed state, and revokes existing sessions", async () => {
  const oldHash = token("old-invite-token");
  db = makeDb({
    businesses: [{ id: "business-a", organizer_id: "organizer-a" }],
    business_workers: [{ id: "worker-a", business_id: "business-a", kitchen_id: "kitchen-a", role: "cook", is_active: true, deactivated_at: null }],
    business_worker_invitations: [{ id: "invite-a", worker_id: "worker-a", token_hash: oldHash, expires_at: "2026-01-01T00:00:00.000Z", token_consumed_at: "2025-12-01T00:00:00.000Z", accepted_at: "2025-12-01T00:00:00.000Z", revoked_at: "2026-01-01T00:00:00.000Z" }],
    business_worker_sessions: [{ id: "session-a", worker_id: "worker-a", revoked_at: null }],
  });
  const actions = load("lib/actions/kitchen-management.ts");
  const result = await actions.resendCookInvitation("organizer-a", "worker-a");
  assert.equal(result.ok, true);
  assert.notEqual(db.tables.business_worker_invitations[0].token_hash, oldHash);
  assert.equal(db.tables.business_worker_invitations[0].revoked_at, null);
  assert.equal(db.tables.business_worker_invitations[0].token_consumed_at, null);
  assert.equal(db.tables.business_worker_invitations[0].accepted_at, null);
  assert.ok(db.tables.business_worker_sessions[0].revoked_at);
});

test("mocked: deactivation revokes a never-accepted invitation and all sessions", async () => {
  db = makeDb({
    businesses: [{ id: "business-a", organizer_id: "organizer-a" }],
    business_workers: [{ id: "worker-a", business_id: "business-a", kitchen_id: "kitchen-a", role: "cook", is_active: true, deactivated_at: null }],
    business_worker_invitations: [{ id: "invite-a", worker_id: "worker-a", token_consumed_at: null, accepted_at: null, revoked_at: null }],
    business_worker_sessions: [{ id: "session-a", worker_id: "worker-a", revoked_at: null }],
  });
  const actions = load("lib/actions/kitchen-management.ts");
  const result = await actions.deactivateCook("organizer-a", "worker-a");
  assert.equal(result.ok, true);
  assert.equal(db.tables.business_workers[0].is_active, false);
  assert.ok(db.tables.business_workers[0].deactivated_at);
  assert.ok(db.tables.business_worker_invitations[0].revoked_at);
  assert.ok(db.tables.business_worker_sessions[0].revoked_at);
});

test("mocked: fail-closed rate limiter denies on RPC error or malformed response", async () => {
  const oldRpc = db;
  db = makeDb();
  db.rpc = async () => ({ data: null, error: { message: "offline" } });
  const limiter = load("lib/rate-limit.ts");
  const failed = await limiter.checkRateLimitFailClosed("kitchenDisplayBootstrap", "ip:203.0.113.10");
  assert.equal(failed.allowed, false);
  assert.equal(failed.retryAfter, 60);
  db.rpc = async () => ({ data: null, error: null });
  const malformed = await limiter.checkRateLimitFailClosed("kitchenInviteBootstrap", "ip:203.0.113.10");
  assert.equal(malformed.allowed, false);
  db = oldRpc;
});
