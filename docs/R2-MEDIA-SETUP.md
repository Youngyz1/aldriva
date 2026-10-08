# R2 media deployment setup

This note configures media storage only. Migration 160 was already applied on
staging before this task; this work does not connect to or modify any database.
Migrations 159 and 161 remain pending. Do not place credential values in this
file or in source control.

## Variables

Set these names in the deployment environment:

- `IMAGE_STORAGE_DRIVER`
- `NEXT_PUBLIC_IMAGE_STORAGE_DRIVER` (must match the server setting)
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT`
- `R2_BUCKET`
- `R2_TMP_BUCKET`
- `R2_PRIVATE_BUCKET`
- `MEDIA_BASE_URL`
- `NEXT_PUBLIC_MEDIA_BASE_URL` (same HTTPS hostname as `MEDIA_BASE_URL`)
- `MEDIA_UPLOAD_USER_LIMIT` (default `20`)
- `MEDIA_UPLOAD_USER_WINDOW_SECONDS` (default `600`)
- `MEDIA_UPLOAD_IP_LIMIT` (default `60`)
- `MEDIA_UPLOAD_IP_WINDOW_SECONDS` (default `600`)
- `MEDIA_UPLOAD_DAILY_COUNT_LIMIT` (default `40`)
- `MEDIA_UPLOAD_DAILY_BYTES_LIMIT` (default `209715200`)

The server-side media base URL must be HTTPS. Production builds check that the
public and server media hostnames match. R2 settings are not added to the
`next.config.ts` `env` block.

## Bucket roles and lifecycle

- `R2_BUCKET`: public, processed WebP images.
- `R2_TMP_BUCKET`: private, raw temporary image uploads; no public custom domain.
- `R2_PRIVATE_BUCKET`: private product deliverables; never served with a public URL.

Configure a lifecycle expiration rule on `R2_TMP_BUCKET` to remove all objects
after **1 day** (about 24 hours). Successful finalize requests remove their temp
object immediately. The lifecycle rule covers abandoned uploads and failed
clients.

## Browser CORS

Apply the following CORS rule to each of `R2_TMP_BUCKET`, `R2_BUCKET`, and
`R2_PRIVATE_BUCKET`. The production allowed origin is the canonical site origin
`https://aldriva.com`:

```json
[
  {
    "AllowedOrigins": ["https://aldriva.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

For local development, use this separate rule (do not add the local origin to
the production rule):

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

The browser security policy derives `connect-src` from the configured
`R2_ENDPOINT` origin so signed browser PUT requests can reach the S3 endpoint.

## Limits and replacement behavior

Public raw image limits are purpose-specific: event-banner/gallery/cover/product
image/invitation-image/article-image/campaign-image/CMS allow up to 10 MiB;
avatar/organizer-image/logo allow up to 5 MiB. MIME types are validated against
each purpose, then the server decodes and re-encodes accepted images as WebP.

The user and IP request limits and UTC-day count/byte quota use the environment
variables above. Defaults are 20 requests per authenticated user per 10 minutes,
60 requests per source IP per 10 minutes, 40 upload reservations, and 200 MiB
of declared raw bytes per user per UTC day. Each upload-URL and finalize request
counts against the request limits. These quotas apply to R2-driver uploads;
Supabase-driver uploads do not call the R2 upload routes or quota RPC.

The app calls the four-argument quota RPC introduced by migration 161. Until
161 is applied, the upload-URL route returns HTTP 503 with a clear migration
message rather than failing with a generic server error. Migration 161 keeps
migration 160's two-argument RPC available during rollout.

Replacing an image creates a new immutable R2 object and media row; the old
object is not automatically deleted because the system cannot know whether
other content still references it. It remains available for explicit deletion
through the media delete endpoint or a later orphan-cleanup report.

## Videos and invitation audio (unchanged)

No video or audio upload path is moved in this change. Existing video limits
include 50 MiB for `videos` and 200 MiB on the `event-videos` import path; direct
event video upload currently caps at 50 MiB. Invitation audio is capped at
5 MiB and accepts MP3/MP4 audio MIME types.

Moving video would require server-side byte/MIME verification, a resumable or
multipart upload flow for the 200 MiB path, completion/abort handling, temp
object cleanup, and updates to `components/editor/RichTextEditor.tsx`,
`app/create-event/CreateEventForm.tsx`, `app/create-fundraiser/page.tsx`, and
`app/api/media/import/route.ts`. Moving invitation audio would require deciding
whether delivered audio remains public or becomes signed/private, preserving
event ownership checks and the 5 MiB/MP3/MP4 validation, then updating
`components/invitation/AudioUploadField.tsx`,
`app/api/invitation-media/upload/route.ts`, `lib/uploadAudio.ts`, and
`lib/invitation-cleanup.ts`.
