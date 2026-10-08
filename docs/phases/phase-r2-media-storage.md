# R2 Media Storage Foundation

## Status

**PARTIALLY COMPLETE — implementation and local code verification are complete; database application and live R2 verification remain.** This is a focused media-storage milestone and does not advance the numbered platform roadmap phases.

## Scope

- Authenticated public image upload and deletion through Cloudflare R2.
- Private temporary bucket configured by `R2_TMP_BUCKET`; processed media stored in public `R2_BUCKET` and served through `MEDIA_BASE_URL`.
- Allowlisted image purposes only: event, article, product, campaign, logo, avatar, and CMS images. No private documents or video/audio flows.
- Browser validation and compression reuse `lib/uploadImage.ts` / `useImageUpload`; server revalidates bytes and image format, auto-rotates, strips metadata by WebP re-encoding, and fits output within 2000×2000.
- CMS images require an active platform admin. Tenant purposes use `checkTenantAccess()` with content-write roles. Delete requires tenant manager roles, CMS active admin, or avatar owner.
- Canonical migration 157 and timestamped Supabase mirror create RLS-protected media metadata. The service-role API performs inserts and deletes after authorization.

## Implementation Files

- `lib/storage/r2.ts`, `lib/media/constants.ts`, `lib/media/public-media.ts`, `lib/media/process-public-image.ts`, and `lib/media/upload-public-media.ts`.
- `app/api/media/upload-url/route.ts`, `app/api/media/finalize/route.ts`, and `app/api/media/[id]/route.ts`.
- `db/migration_157_public_media_r2.sql`, its canonical rollback twin, and `supabase/migrations/20261008000000_migration_157_public_media_r2.sql`.
- `app/admin/homepage/HomepageCmsTabs.tsx` uses the CMS purpose and displays a public-media notice. The shared Supabase image path keeps its existing defaults; its new transport/limit options are opt-in.
- `next.config.ts` permits the public media host and derives the R2 S3 endpoint origin for `connect-src`; no R2 variables are added to the Next `env` block.
- The routes use Next.js 16's default Node.js runtime. `cacheComponents` requires Node.js and Next rejects a route-level `runtime` export when that flag is enabled; each route sets `maxDuration = 60` explicitly.

## Verification Still Required

- Apply migration 157 in the intended database and confirm the table/RLS policies.
- Configure a separate private `R2_TMP_BUCKET` with no public domain and verify browser CORS from localhost and a preview deployment.
- Complete the manual checklist in the implementation report: public final URL, EXIF/GPS removal, orientation, 2000px limit, auth and malformed-file rejects, temp cleanup, and delete.
- Configure a lifecycle expiration policy for abandoned temporary uploads; finalized uploads are cleaned up by the API, while clients that never call finalize can leave temporary objects behind.
- Browser review of the CMS upload form at 375, 768, 1024, and 1440px remains unverified because the local review session redirected to login and no authenticated admin session was available.

## Local Verification

- ESLint: passed with 0 errors and 4 existing warnings in `HomepageCmsTabs.tsx`.
- TypeScript: `npx tsc --noEmit` passed.
- Production build: `npm run build` passed (354 static pages); sandbox network restrictions caused external event-provider fetch warnings during static generation.
- Full test suite: 1,424 tests across 96 suites passed, 0 failed.
- `git diff --check`: passed.
- Sharp advisory GHSA-wq5f-xc86-pv6w confirms versions before 0.35.5 are affected; dependency is pinned to 0.35.5 and SVG decoding is blocked.

## Finding — Not Changed

The website-builder `MediaUploadField` still uploads directly to Supabase `cms-media` for tenant users, while migration 117 grants bucket writes only to active platform admins. This policy mismatch is reported for a separate decision; this R2 milestone changes only the homepage admin `CmsImageField`.
