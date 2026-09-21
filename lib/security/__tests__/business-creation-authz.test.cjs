/**
 * lib/security/__tests__/business-creation-authz.test.cjs
 *
 * Security Regression Test Suite:
 * Asserts that business creation strictly derives owner_id from the authenticated
 * session (supabase.auth.getUser()) and completely ignores/overrides any
 * client-supplied or forged owner_id in the input payload.
 *
 * This test directly invokes createBusiness(maliciousInput) from lib/actions/businesses.ts
 * against a mocked Supabase server client, capturing the actual payload passed to
 * .insert() by the function under test.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
const BUSINESS_ACTIONS_PATH = path.join(ROOT, "lib", "actions", "businesses.ts");
const MIGRATION_127_PATH = path.join(ROOT, "db", "migration_127_ensure_business_organizer_security_definer.sql");

// Compile TypeScript modules on the fly
require.extensions[".ts"] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
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

// Setup path alias resolution for "@/..."
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(ROOT, request.slice(2)),
      parent,
      isMain,
      options
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// Module mock interceptor
let currentUser = null;
let lastCapturedInsertPayload = null;

const originalLoad = Module._load;
Module._load = function loadMocks(request, parent, isMain) {
  if (request === "next/cache") {
    return {
      revalidatePath: () => {},
      revalidateTag: () => {},
    };
  }
  if (request === "@/lib/supabase-server" || request === path.join(ROOT, "lib/supabase-server.ts")) {
    return {
      createSupabaseServer: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: currentUser },
            error: null,
          }),
        },
        from: (table) => {
          assert.equal(table, "businesses", "createBusiness must only query businesses table");
          return {
            select: () => ({
              eq: () => ({
                data: [], // simulate no slug collision
                error: null,
              }),
            }),
            insert: (payload) => {
              lastCapturedInsertPayload = payload;
              return {
                select: () => ({
                  single: async () => ({
                    data: { id: "00000000-0000-4000-a000-000000000099", slug: payload.slug },
                    error: null,
                  }),
                }),
              };
            },
          };
        },
      }),
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

// Now import the real createBusiness action function under test
const { createBusiness } = require("@/lib/actions/businesses");

// Source files for static structural assertions
const actionSource = fs.readFileSync(BUSINESS_ACTIONS_PATH, "utf8");
const migration127Source = fs.readFileSync(MIGRATION_127_PATH, "utf8");

test("createBusiness source extracts user from authenticated session", () => {
  assert.match(
    actionSource,
    /const\s+\{\s*data:\s*\{\s*user\s*\}\s*\}\s*=\s*await\s+supabase\.auth\.getUser\(\)/,
    "createBusiness must fetch authenticated user via supabase.auth.getUser()"
  );

  assert.match(
    actionSource,
    /if\s*\(\s*!user\s*\)\s*\{\s*return\s*\{\s*success:\s*false,\s*error:\s*["']Unauthorized["']\s*\};?\s*\}/,
    "createBusiness must return Unauthorized if session user is absent"
  );
});

test("createBusiness explicitly binds owner_id to user.id in insert payload", () => {
  assert.match(
    actionSource,
    /\.insert\(\s*\{[\s\S]*?owner_id:\s*user\.id[\s\S]*?\}\)/,
    "createBusiness must explicitly hardcode owner_id: user.id in the insert payload"
  );

  assert.doesNotMatch(
    actionSource,
    /owner_id:\s*input(?:\.owner_id|\??\.owner_id)/,
    "createBusiness must NEVER read owner_id from input parameter"
  );
});

test("BusinessInput TypeScript definition excludes owner_id", () => {
  const typeMatch = actionSource.match(/export\s+type\s+BusinessInput\s*=\s*\{([\s\S]*?)\};/);
  assert.ok(typeMatch, "BusinessInput type definition must exist");
  const typeBody = typeMatch[1];

  assert.doesNotMatch(
    typeBody,
    /\bowner_id\b/,
    "BusinessInput type must not declare owner_id as an accepted client property"
  );
});

test("Real createBusiness(maliciousInput) execution ignores client-supplied owner_id and forces session user.id into DB insert", async () => {
  const authenticatedUserId = "00000000-0000-4000-a000-000000000001";
  const attackerSuppliedOwnerId = "99999999-9999-4999-b999-999999999999";

  currentUser = { id: authenticatedUserId, email: "legit@aldriva.com" };
  lastCapturedInsertPayload = null;

  // Construct client payload containing forged owner_id and status attempts
  const maliciousClientInput = {
    name: "Acme High-Tech Solutions",
    description: "A comprehensive business providing verified high-scale cloud and event solutions.",
    industry: "Software & Technology",
    category: "Cloud Services",
    listing_tier: "free",
    owner_id: attackerSuppliedOwnerId, // Client attempt to spoof ownership to another entity/user
    status: "published", // Client attempt to bypass content review workflow
    is_flagged: true,
  };

  // ACTUALLY INVOKE the real createBusiness server action with the malicious input
  const result = await createBusiness(maliciousClientInput);

  // Assert successful response
  assert.equal(result.success, true, "createBusiness must succeed for valid authenticated input");
  assert.ok(result.data, "createBusiness must return created business record");

  // Assert that createBusiness itself passed a safe payload to .insert()
  assert.ok(lastCapturedInsertPayload, "createBusiness must execute .insert() on Supabase");

  assert.equal(
    lastCapturedInsertPayload.owner_id,
    authenticatedUserId,
    "Captured .insert() payload owner_id must strictly match session user.id"
  );

  assert.notEqual(
    lastCapturedInsertPayload.owner_id,
    attackerSuppliedOwnerId,
    "Captured .insert() payload owner_id must NEVER reflect client-supplied owner_id"
  );

  assert.equal(
    lastCapturedInsertPayload.status,
    "published",
    "Captured .insert() payload status must strictly be published on creation per DEC-0016"
  );

  assert.equal(
    lastCapturedInsertPayload.name,
    "Acme High-Tech Solutions",
    "Business name must be preserved"
  );
});

test("Real createBusiness(input) unauthenticated call rejects before reaching .insert()", async () => {
  currentUser = null;
  lastCapturedInsertPayload = null;

  const input = {
    name: "Acme Unauthorized Attempt",
    description: "This request has no active session and must be rejected immediately.",
    industry: "Finance",
    category: "Consulting",
    listing_tier: "free",
  };

  const result = await createBusiness(input);

  assert.equal(result.success, false);
  assert.equal(result.error, "Unauthorized");
  assert.equal(lastCapturedInsertPayload, null, "Insert must never be called when unauthenticated");
});

test("Database trigger ensure_business_organizer derives user_id strictly from business_row.owner_id", () => {
  assert.match(
    migration127Source,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+ensure_business_organizer\s*\(\s*business_row\s+businesses\s*\)/i,
    "migration_127 must define ensure_business_organizer(business_row businesses)"
  );

  assert.match(
    migration127Source,
    /SECURITY\s+DEFINER/i,
    "ensure_business_organizer() must be SECURITY DEFINER"
  );

  assert.match(
    migration127Source,
    /SET\s+search_path\s*=\s*public,\s*pg_catalog/i,
    "ensure_business_organizer() must pin search_path = public, pg_catalog"
  );

  assert.match(
    migration127Source,
    /INSERT\s+INTO\s+organizers\s*\([\s\S]*?user_id[\s\S]*?\)/i,
    "ensure_business_organizer() insert columns must include user_id"
  );

  assert.match(
    migration127Source,
    /VALUES\s*\(\s*business_row\.owner_id,/i,
    "ensure_business_organizer() must source user_id strictly from business_row.owner_id"
  );
});
