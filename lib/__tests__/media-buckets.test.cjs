/**
 * lib/__tests__/media-buckets.test.cjs
 *
 * Round 3 COMMIT 3e (Part C): every storage bucket referenced in code is
 * created by a migration — no hand-created bucket may be load-bearing.
 * - Each code bucket appears in migration_158 or a prior creator
 *   migration (12, 74, 82, 87, 106, 116, 117, 154).
 * - migration_158 is idempotent, mirrored to supabase/migrations, and
 *   has a rollback twin that never deletes stored objects.
 * - The uploader maps storage failures (missing bucket, permission,
 *   size) to localized messages instead of raw provider text.
 */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.join(__dirname, "../..");
function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}
function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

// Bucket -> migration that creates it (first creator wins).
const BUCKET_CREATORS = {
  "event-banners": "db/migration_158_media_buckets_setup.sql",
  "fundraiser-media": "db/migration_158_media_buckets_setup.sql",
  "organizer-banners": "db/migration_158_media_buckets_setup.sql",
  "organizer-images": "db/migration_158_media_buckets_setup.sql",
  videos: "db/migration_158_media_buckets_setup.sql",
  "event-videos": "db/migration_158_media_buckets_setup.sql",
  "profile-images": "db/migration_12_profile_account_info.sql",
  "cms-media": "db/migration_117_cms_media_storage.sql",
  "guest-images": "db/migration_106_storage_bucket_upload_posture.sql",
  "invitation-media": "db/migration_154_invitation_pages.sql",
  "product-assets": "db/migration_116_shop_digital_products.sql",
  "article-audio": "db/migration_74_article_audio.sql",
  "organizer-verification-docs": "db/migration_82_organizer_verification_storage.sql",
  "user-identity-docs": "db/migration_87_user_identity_verifications.sql",
};

describe("every code bucket has a creating migration", () => {
  test("buckets referenced by uploader call sites are covered", () => {
    const callSites = [
      ["lib/media/constants.ts", "event-banners"],
      ["app/events/edit/[id]/page.tsx", "event-banners"],
      ["app/create-fundraiser/page.tsx", "fundraiser-media"],
      ["app/dashboard/settings/profile/ProfileClient.tsx", "profile-images"],
      ["components/dashboard/website/builder/inspectors/common/MediaUploadField.tsx", "cms-media"],
      ["components/invitation/InvitationImageUploadField.tsx", "cms-media"],
      ["lib/uploadAudio.ts", "invitation-media"],
      ["lib/media/my-media.ts", "cms-media"],
      ["lib/digital-products.ts", "product-assets"],
    ];
    for (const [f, bucket] of callSites) {
      assert.ok(src(f).includes(bucket), `${f} references ${bucket}`);
      assert.ok(BUCKET_CREATORS[bucket], `${bucket} has a creator migration`);
    }
  });

  for (const [bucket, migration] of Object.entries(BUCKET_CREATORS)) {
    test(`${bucket} is created by ${migration}`, () => {
      const sql = src(migration);
      assert.ok(
        sql.includes(`'${bucket}'`) && /INSERT INTO storage\.buckets/i.test(sql),
        `${migration} inserts ${bucket}`
      );
    });
  }

  test("migration_158 itself is idempotent", () => {
    const sql = src("db/migration_158_media_buckets_setup.sql");
    assert.ok(/ON CONFLICT.*DO NOTHING/i.test(sql), "buckets insert-if-missing");
    assert.ok(/DROP POLICY IF EXISTS/i.test(sql), "policies drop-if-exists");
  });
});

describe("migration 158 shape", () => {
  const FWD = "db/migration_158_media_buckets_setup.sql";
  const BACK = "db/migration_158_media_buckets_setup_rollback.sql";
  const MIRROR = "supabase/migrations/20261008000001_migration_158_media_buckets_setup.sql";

  test("forward, rollback and mirror exist; mirror is byte-identical", () => {
    assert.ok(exists(FWD) && exists(BACK) && exists(MIRROR), "all three files present");
    assert.equal(src(MIRROR), src(FWD), "mirror is byte-identical");
    assert.ok(!exists("supabase/migrations/20261008000001_migration_158_media_buckets_setup_rollback.sql"), "no rollback in mirrors");
  });

  test("limits match the migration_106 caps", () => {
    const s = src(FWD);
    assert.ok(s.includes("15728640"), "event-banners 15MB");
    assert.ok(s.includes("5242880"), "media 5MB");
    assert.ok(s.includes("52428800"), "videos 50MB");
    assert.ok(s.includes("209715200"), "event-videos 200MB");
  });

  test("rollback never deletes stored objects", () => {
    const s = src(BACK);
    assert.ok(s.includes("NOT EXISTS (SELECT 1 FROM storage.objects"), "buckets dropped only when empty");
    assert.ok(!/DELETE FROM storage\.objects/i.test(s), "no object deletion");
  });

  test("event-banners keeps its scoped manager policy", () => {
    assert.ok(!src(FWD).includes("Event managers can upload event banners"), "scoped policy untouched");
  });
});

describe("uploader storage errors stay localized", () => {
  test("missing bucket maps to storage_unavailable, never raw text", () => {
    const s = src("lib/uploadImage.ts");
    assert.ok(s.includes("storage_unavailable"), "new code present");
    assert.ok(s.includes("NoSuchBucket"), "provider variants detected");
    assert.ok(s.includes("db/migration_158_media_buckets_setup.sql"), "fix is referenced");
  });

  test("no raw provider message reaches err.message", () => {
    const s = src("lib/uploadImage.ts");
    assert.ok(!s.includes("err instanceof Error ? err.message : undefined"), "passthrough removed");
    assert.ok(s.includes("never reaches err.message"), "intent documented");
  });

  test("EN and FR copies exist for storage failures", () => {
    const s = src("lib/uploadImage.ts");
    assert.ok(s.includes("getUploadErrorMessage"), "localized accessor present");
    assert.ok(s.includes("Le stockage d'images"), "FR bucket copy present");
    assert.ok(s.includes("Le téléversement a échoué"), "FR failure copy present");
  });

  test("publish form keeps banner data on storage failure", () => {
    const s = src("app/create-event/CreateEventForm.tsx");
    assert.ok(s.includes("err instanceof UploadImageError ? err.message :"), "safe message reuse");
    const clears = s.match(/setBannerFile\(null\)/g) ?? [];
    assert.equal(clears.length, 1, "only the user's own Remove button clears the banner");
  });
});
