const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;
let admin = false;
let eventAccess = false;
let tenantAccess = false;
let rateState = { userAllowed: true, ipAllowed: true };
let quotaAllowed = true;
let quotaRpcError = null;
let quotaRpcArgs = null;
let uploadCall = null;
let r2UploadCall = null;
let privateMediaHead = { contentLength: 128, contentType: "application/pdf" };

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

Module._load = function loadMocks(request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "@/lib/auth") return {
    isAdmin: async () => admin,
    getCurrentUser: async () => ({ id: "user-id" }),
    getCurrentUserProfile: async () => ({ status: "active", deleted_at: null }),
  };
  if (request === "@/lib/entity-auth") return {
    ENTITY_ROLES_CONTENT_WRITE: ["owner", "admin", "manager", "editor"],
    ENTITY_ROLES_MANAGE: ["owner", "admin", "manager"],
    checkTenantAccess: async () => ({ hasAccess: tenantAccess }),
  };
  if (request === "@/lib/event-auth") return {
    EVENT_TEAM_ROLES_MANAGE: ["event_manager"],
    hasEventOrOrganizerAccess: async () => eventAccess,
  };
  if (request === "@/lib/supabase-admin") return {
    createSupabaseAdmin: () => ({
      rpc: async (_name, args) => {
        quotaRpcArgs = args;
        return { data: [{ allowed: quotaAllowed }], error: quotaRpcError };
      },
    }),
  };
  if (request === "@/lib/rate-limit") return {
    checkRateLimit: async (name) => ({
      allowed: name === "mediaUpload" ? rateState.userAllowed : rateState.ipAllowed,
      retryAfter: 60,
    }),
    clientIp: () => "203.0.113.20",
    rateLimitResponse: (retryAfter) => ({ status: 429, retryAfter }),
  };
  if (request === "@/lib/supabase") return { supabase: {} };
  if (request === "@/lib/storage/r2") return {
    headObject: async () => privateMediaHead,
    deleteObject: async () => {},
    getSignedGetUrl: async () => "https://r2.test/signed-get",
    getUploadUrl: async (bucket, key, contentType, contentLength) => {
      r2UploadCall = { bucket, key, contentType, contentLength };
      return "https://r2.test/signed-put";
    },
  };
  if (request === "@/lib/uploads") return {
    uploadPublicFile: async (options) => {
      uploadCall = options;
      return { publicUrl: "https://project.supabase.co/storage/v1/object/public/cms-media/homepage/upload.webp" };
    },
  };
  return originalLoad.call(this, request, parent, isMain);
};

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

const { authorizeMediaTarget } = require("../media/public-media.ts");
const { canUseR2Uploads, canUsePrivateR2Media } = require("../media/driver-policy.ts");
const {
  enforcePublicMediaRateLimits,
  getDailyPublicMediaQuotaLimits,
  isWithinDailyPublicMediaQuota,
  PublicMediaQuotaMigrationMissingError,
  reservePublicMediaQuota,
} = require("../media/upload-limits.ts");
const { productAssetStorageProvider } = require("../digital-products.ts");
const { getPublicMediaRateLimitConfig } = require("../rate-limit.ts");
const { verifyPrivateMediaObject } = require("../storage/private-media.ts");
const { safeImageSrc } = require("../image-url.ts");
const { uploadPublicMedia } = require("../media/upload-public-media.ts");
const { POST: createPublicMediaUploadUrl } = require("../../app/api/media/upload-url/route.ts");

function source(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("a non-admin event creator may use the production R2 banner policy", async () => {
  admin = false;
  eventAccess = true;
  const oldEnv = {
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    driver: process.env.IMAGE_STORAGE_DRIVER,
    publicBucket: process.env.R2_BUCKET,
    tempBucket: process.env.R2_TMP_BUCKET,
  };
  process.env.NODE_ENV = "production";
  process.env.VERCEL_ENV = "production";
  process.env.IMAGE_STORAGE_DRIVER = "r2";
  process.env.R2_BUCKET = "public-test";
  process.env.R2_TMP_BUCKET = "private-temp-test";
  try {
    const response = await createPublicMediaUploadUrl(new Request("https://local.test/api/media/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        purpose: "event-banner",
        targetId: "123e4567-e89b-42d3-a456-426614174000",
        contentType: "image/webp",
        size: 1024,
      }),
    }));
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.uploadUrl, "https://r2.test/signed-put");
    assert.equal(r2UploadCall.bucket, "private-temp-test");
    assert.match(r2UploadCall.key, /^user-id\/event-banner\/123e4567-e89b-42d3-a456-426614174000\//);
  } finally {
    if (oldEnv.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv.nodeEnv;
    if (oldEnv.vercelEnv === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = oldEnv.vercelEnv;
    if (oldEnv.driver === undefined) delete process.env.IMAGE_STORAGE_DRIVER; else process.env.IMAGE_STORAGE_DRIVER = oldEnv.driver;
    if (oldEnv.publicBucket === undefined) delete process.env.R2_BUCKET; else process.env.R2_BUCKET = oldEnv.publicBucket;
    if (oldEnv.tempBucket === undefined) delete process.env.R2_TMP_BUCKET; else process.env.R2_TMP_BUCKET = oldEnv.tempBucket;
  }
});

test("CMS media remains admin-only", async () => {
  admin = false;
  assert.equal(await authorizeMediaTarget("user-id", "cms", null, "upload"), false);
});

test("public R2 uploads reject preview and development deployments", () => {
  assert.equal(canUseR2Uploads({ driver: "r2", nodeEnv: "production", vercelEnv: "production" }), true);
  assert.equal(canUseR2Uploads({ driver: "r2", nodeEnv: "production", vercelEnv: "preview" }), false);
  assert.equal(canUseR2Uploads({ driver: "r2", nodeEnv: "development", vercelEnv: "development" }), false);
  assert.equal(canUsePrivateR2Media({ nodeEnv: "production", vercelEnv: "preview" }), false);
});

test("daily quota rejects a count or byte overage and the database reservation denial", async () => {
  assert.equal(isWithinDailyPublicMediaQuota(39, 0, 1024), true);
  assert.equal(isWithinDailyPublicMediaQuota(40, 0, 1024), false);
  assert.equal(isWithinDailyPublicMediaQuota(0, 200 * 1024 * 1024, 1), false);
  quotaAllowed = false;
  assert.equal(await reservePublicMediaQuota("user-id", 1024), false);
  quotaAllowed = true;
});

test("daily quota defaults are configurable and passed to the atomic reservation", async () => {
  process.env.MEDIA_UPLOAD_DAILY_COUNT_LIMIT = "17";
  process.env.MEDIA_UPLOAD_DAILY_BYTES_LIMIT = "9876543";
  assert.deepEqual(getDailyPublicMediaQuotaLimits(), { maxCount: 17, maxBytes: 9876543 });
  assert.equal(isWithinDailyPublicMediaQuota(16, 9876542, 1), true);
  assert.equal(isWithinDailyPublicMediaQuota(17, 0, 1), false);
  await reservePublicMediaQuota("user-id", 1024);
  assert.deepEqual(quotaRpcArgs, {
    p_user_id: "user-id",
    p_bytes: 1024,
    p_max_count: 17,
    p_max_bytes: 9876543,
  });
  delete process.env.MEDIA_UPLOAD_DAILY_COUNT_LIMIT;
  delete process.env.MEDIA_UPLOAD_DAILY_BYTES_LIMIT;
  assert.deepEqual(getDailyPublicMediaQuotaLimits(), { maxCount: 40, maxBytes: 209715200 });
});

test("missing migration 161 produces a clear service-unavailable response", async () => {
  admin = false;
  eventAccess = true;
  const oldEnv = {
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    driver: process.env.IMAGE_STORAGE_DRIVER,
    publicBucket: process.env.R2_BUCKET,
    tempBucket: process.env.R2_TMP_BUCKET,
  };
  process.env.NODE_ENV = "production";
  process.env.VERCEL_ENV = "production";
  process.env.IMAGE_STORAGE_DRIVER = "r2";
  process.env.R2_BUCKET = "public-test";
  process.env.R2_TMP_BUCKET = "private-temp-test";
  quotaRpcError = { code: "PGRST202" };
  try {
    await assert.rejects(
      reservePublicMediaQuota("user-id", 1024),
      PublicMediaQuotaMigrationMissingError
    );
    const response = await createPublicMediaUploadUrl(new Request("https://local.test/api/media/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        purpose: "event-banner",
        targetId: "123e4567-e89b-42d3-a456-426614174000",
        contentType: "image/webp",
        size: 1024,
      }),
    }));
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.match(body.error, /migration 161 is not applied/);
  } finally {
    quotaRpcError = null;
    if (oldEnv.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv.nodeEnv;
    if (oldEnv.vercelEnv === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = oldEnv.vercelEnv;
    if (oldEnv.driver === undefined) delete process.env.IMAGE_STORAGE_DRIVER; else process.env.IMAGE_STORAGE_DRIVER = oldEnv.driver;
    if (oldEnv.publicBucket === undefined) delete process.env.R2_BUCKET; else process.env.R2_BUCKET = oldEnv.publicBucket;
    if (oldEnv.tempBucket === undefined) delete process.env.R2_TMP_BUCKET; else process.env.R2_TMP_BUCKET = oldEnv.tempBucket;
  }
});

test("per-user and per-IP rate limits reject requests", async () => {
  rateState = { userAllowed: false, ipAllowed: true };
  assert.deepEqual(await enforcePublicMediaRateLimits(new Request("https://local.test"), "user-id"), {
    status: 429,
    retryAfter: 60,
  });
  rateState = { userAllowed: true, ipAllowed: false };
  assert.deepEqual(await enforcePublicMediaRateLimits(new Request("https://local.test"), "user-id"), {
    status: 429,
    retryAfter: 60,
  });
  rateState = { userAllowed: true, ipAllowed: true };
  assert.equal(await enforcePublicMediaRateLimits(new Request("https://local.test"), "user-id"), null);
});

test("public media request rate limits are configurable with current defaults", () => {
  assert.deepEqual(getPublicMediaRateLimitConfig(), {
    user: { limit: 20, windowSeconds: 600 },
    ip: { limit: 60, windowSeconds: 600 },
  });
  process.env.MEDIA_UPLOAD_USER_LIMIT = "9";
  process.env.MEDIA_UPLOAD_USER_WINDOW_SECONDS = "300";
  process.env.MEDIA_UPLOAD_IP_LIMIT = "31";
  process.env.MEDIA_UPLOAD_IP_WINDOW_SECONDS = "120";
  assert.deepEqual(getPublicMediaRateLimitConfig(), {
    user: { limit: 9, windowSeconds: 300 },
    ip: { limit: 31, windowSeconds: 120 },
  });
  delete process.env.MEDIA_UPLOAD_USER_LIMIT;
  delete process.env.MEDIA_UPLOAD_USER_WINDOW_SECONDS;
  delete process.env.MEDIA_UPLOAD_IP_LIMIT;
  delete process.env.MEDIA_UPLOAD_IP_WINDOW_SECONDS;
});

test("private product files use HEAD metadata verification without image conversion", async () => {
  const helper = source("lib/storage/private-media.ts");
  const uploadRoute = source("app/api/products/[id]/upload-url/route.ts");
  const confirmRoute = source("app/api/products/[id]/assets/confirm/route.ts");
  assert.match(helper, /headObject\(/);
  assert.doesNotMatch(helper, /sharp|processPublicImage/);
  assert.doesNotMatch(uploadRoute, /sharp|processPublicImage/);
  assert.match(confirmRoute, /verifyPrivateMediaObject/);

  process.env.R2_PRIVATE_BUCKET = "private-media-test";
  delete process.env.R2_BUCKET;
  delete process.env.R2_TMP_BUCKET;
  const extensionMimeTypes = { pdf: ["application/pdf"] };
  assert.deepEqual(await verifyPrivateMediaObject({
    key: "products/product/asset/guide.pdf",
    expectedBytes: 128,
    maxBytes: 1024,
    extensionMimeTypes,
  }), { size: 128, contentType: "application/pdf", extension: ".pdf" });
  assert.equal(await verifyPrivateMediaObject({
    key: "products/product/asset/guide.svg",
    expectedBytes: 128,
    maxBytes: 1024,
    extensionMimeTypes,
  }), null);
  privateMediaHead = { contentLength: 129, contentType: "application/pdf" };
  assert.equal(await verifyPrivateMediaObject({
    key: "products/product/asset/guide.pdf",
    expectedBytes: 128,
    maxBytes: 1024,
    extensionMimeTypes,
  }), null);
  privateMediaHead = { contentLength: 128, contentType: "text/plain" };
  assert.equal(await verifyPrivateMediaObject({
    key: "products/product/asset/guide.pdf",
    expectedBytes: 128,
    maxBytes: 1024,
    extensionMimeTypes,
  }), null);
  privateMediaHead = { contentLength: 128, contentType: "application/pdf" };
  delete process.env.R2_PRIVATE_BUCKET;
});

test("paid product download selects the provider stored on each asset", () => {
  assert.equal(productAssetStorageProvider("supabase"), "supabase");
  assert.equal(productAssetStorageProvider("r2"), "r2");
  assert.equal(productAssetStorageProvider(undefined), "supabase");
  assert.equal(productAssetStorageProvider("other"), null);
  const route = source("app/api/products/[id]/download/route.ts");
  assert.match(route, /storage_provider/);
  assert.match(route, /getPrivateMediaSignedGetUrl/);
  assert.match(route, /createSignedUrl/);
});

test("image display allowlist accepts the configured R2 host and Supabase, rejects foreign hosts", () => {
  process.env.NEXT_PUBLIC_MEDIA_BASE_URL = "https://media.aldriva.com";
  assert.equal(safeImageSrc("https://media.aldriva.com/events/banner.webp"), "https://media.aldriva.com/events/banner.webp");
  assert.equal(safeImageSrc("https://project.supabase.co/storage/v1/object/public/event-banners/banner.webp"), "https://project.supabase.co/storage/v1/object/public/event-banners/banner.webp");
  assert.equal(safeImageSrc("/images/local.webp"), "/images/local.webp");
  assert.equal(safeImageSrc("/\\attacker.test/banner.webp"), null);
  assert.equal(safeImageSrc("https://images.unsplash.com/photo.jpg"), null);
  assert.equal(safeImageSrc("https://media.aldriva.com.attacker.test/banner.webp"), null);
  delete process.env.NEXT_PUBLIC_MEDIA_BASE_URL;
});

test("CMS uploads dispatch through the selected driver", async () => {
  const file = { name: "hero.webp", type: "image/webp", size: 100 };
  process.env.NEXT_PUBLIC_IMAGE_STORAGE_DRIVER = "supabase";
  uploadCall = null;
  const supabaseUrl = await uploadPublicMedia(file, "cms");
  assert.equal(supabaseUrl.includes("supabase.co"), true);
  assert.equal(uploadCall.bucket, "cms-media");

  const originalFetch = global.fetch;
  const originalXhr = global.XMLHttpRequest;
  const fetchCalls = [];
  global.fetch = async (url) => {
    fetchCalls.push(String(url));
    return fetchCalls.length === 1
      ? { ok: true, json: async () => ({ uploadUrl: "https://r2.test/put", tempKey: "temp" }) }
      : { ok: true, json: async () => ({ publicUrl: "https://media.aldriva.com/cms/image.webp" }) };
  };
  global.XMLHttpRequest = class {
    upload = {};
    status = 200;
    open() {}
    setRequestHeader() {}
    send() { this.onload(); }
  };
  try {
    process.env.NEXT_PUBLIC_IMAGE_STORAGE_DRIVER = "r2";
    const r2Url = await uploadPublicMedia(file, "cms");
    assert.equal(r2Url, "https://media.aldriva.com/cms/image.webp");
    assert.equal(fetchCalls[0], "/api/media/upload-url");
    assert.equal(fetchCalls[1], "/api/media/finalize");
  } finally {
    global.fetch = originalFetch;
    global.XMLHttpRequest = originalXhr;
    delete process.env.NEXT_PUBLIC_IMAGE_STORAGE_DRIVER;
  }
});

test("migration 159 defaults existing product assets to Supabase and is mirrored", () => {
  const forward = source("db/migration_159_product_asset_storage_provider.sql");
  const rollback = source("db/migration_159_product_asset_storage_provider_rollback.sql");
  const mirror = source("supabase/migrations/20261008000002_migration_159_product_asset_storage_provider.sql");
  assert.match(forward, /DEFAULT 'supabase'/);
  assert.match(forward, /'supabase', 'r2'/);
  assert.match(rollback, /storage_provider = 'r2'/);
  assert.equal(forward, mirror);

  const publicMediaForward = source("db/migration_160_public_media_quota_and_targets.sql");
  const publicMediaMirror = source("supabase/migrations/20261008000003_migration_160_public_media_quota_and_targets.sql");
  const publicMediaRollback = source("db/migration_160_public_media_quota_and_targets_rollback.sql");
  const configurableForward = source("db/migration_161_configurable_public_media_quota.sql");
  const configurableMirror = source("supabase/migrations/20261008000004_migration_161_configurable_public_media_quota.sql");
  const configurableRollback = source("db/migration_161_configurable_public_media_quota_rollback.sql");
  assert.equal(publicMediaForward, publicMediaMirror);
  assert.match(publicMediaForward, /reserve_public_media_upload/);
  assert.match(publicMediaRollback, /DROP FUNCTION IF EXISTS public\.reserve_public_media_upload/);
  assert.match(publicMediaRollback, /media rows with target_id exist/);
  assert.match(publicMediaRollback, /owner-scoped event images exist/);
  assert.equal(configurableForward, configurableMirror);
  assert.match(configurableForward, /p_max_count INTEGER/);
  assert.match(configurableForward, /p_max_bytes BIGINT/);
  assert.match(configurableForward, /GRANT EXECUTE .*service_role/s);
  assert.match(configurableRollback, /upload_count < 40/);
  assert.match(configurableRollback, /209715200/);
});
