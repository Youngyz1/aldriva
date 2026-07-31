# Image upload pipeline

This document covers the shared image-upload system: what it does, how to use it, and how to add a new upload point to the app. Scope is **images only** — video upload/compression is a separate, future task and is untouched by this system.

## Architecture

Two files, one responsibility each:

- **`lib/imageCompression.ts`** — pure compression logic. Wraps [`browser-image-compression`](https://www.npmjs.com/package/browser-image-compression), runs in a Web Worker, exposes the shared size/dimension/type constants every other file imports instead of redefining.
- **`lib/uploadImage.ts`** — the actual pipeline: validate → compress → validate again → upload → return URL. This is the one function every upload point in the app calls. It delegates the real Supabase Storage call to the existing `lib/uploads.ts` (`uploadPublicFile`) rather than reimplementing it, so path-building and filename-sanitization logic stays in one place.
- **`hooks/use-image-upload.ts`** — a thin React wrapper around `uploadImage()` for components that want `uploading`/`progress` state and a ready-made file-input trigger, instead of managing that state by hand.

```
<input type="file"> change event
        │
        ▼
  uploadImage(file, bucket, folder)      lib/uploadImage.ts
        │
        ├─ validate original file (type, size)         lib/imageCompression.ts constants
        ├─ assert it actually decodes as an image       createImageBitmap()
        ├─ compressImage(file)                          lib/imageCompression.ts
        │     └─ browser-image-compression, Web Worker
        ├─ validate compressed size
        └─ uploadPublicFile({ supabase, bucket, file, folder, ... })   lib/uploads.ts
              └─ supabase.storage.from(bucket).upload() + getPublicUrl()
        │
        ▼
  returns the public URL, or throws UploadImageError
```

## Upload flow

1. **Select** — user picks a file via `<input type="file">`.
2. **Validate (original)** — reject anything that isn't `image/jpeg`, `image/png`, or `image/webp`; reject anything over 5MB.
3. **Decode check** — the file is run through `createImageBitmap()`; if that throws, the file is treated as corrupted/not a real image.
4. **Compress** — `browser-image-compression`, off the main thread (`useWebWorker: true`):
   - Resizes so neither dimension exceeds **1920px**, preserving aspect ratio.
   - Targets **~1MB** output (typically lands in the 0.5–1MB range for real photos; simple images may compress smaller, which is fine).
   - Corrects orientation using the file's EXIF tag automatically (this is `browser-image-compression`'s default behavior — it reads the orientation tag and rotates the canvas before re-encoding, so the output is already right-side-up).
   - Keeps the original MIME type — no forced format conversion.
5. **Validate (compressed)** — if compression somehow leaves the file over 5MB, it's rejected rather than silently uploaded oversized.
6. **Upload** — sent to Supabase Storage via the existing `uploadPublicFile()` helper, which builds a collision-resistant path (`folder/timestamp-random-sanitized-name`) and sets the object's content type.
7. **Return** — the object's public URL.

Existing images already in Storage are never touched by any of this — compression only ever runs on a freshly-selected `File` object in the browser, before the very first upload of that file. There is no code path here that reads back or rewrites an existing Storage object.

## File limits

| Limit | Value |
|---|---|
| Max original upload size | 5MB |
| Target compressed size | ~0.5–1MB |
| Max width or height | 1920px |
| Allowed types | `image/jpeg`, `image/png`, `image/webp` |

All of these are named constants in `lib/imageCompression.ts` (`MAX_ORIGINAL_BYTES`, `TARGET_COMPRESSED_MB`, `MAX_DIMENSION_PX`, `ALLOWED_IMAGE_TYPES`) — change them there, not per call site.

## Using `uploadImage()`

```ts
import { uploadImage, UploadImageError } from "@/lib/uploadImage";

try {
  const url = await uploadImage(file, "profile-images", userId);
  // save `url` wherever it belongs (a form field, a DB update, etc.)
} catch (err) {
  if (err instanceof UploadImageError) {
    // err.code is one of: "invalid_type" | "too_large" | "corrupted"
    //   | "compression_failed" | "upload_failed" | "network_error"
    // err.message is already a UI-safe, human-readable string
    showErrorToast(err.message);
  }
}
```

`uploadImage(file, bucket, folder, options?)`:
- `file` — the `File` from an `<input>` change event, drop event, etc.
- `bucket` — the Supabase Storage bucket name (e.g. `"organizer-banners"`).
- `folder` — path prefix inside the bucket. Convention used throughout the app: the owning entity's id where one exists at upload time (`userId`, `organizerId`, `fundraiser.id`), otherwise a purpose label (`"editor-images"`).
- `options.upsert` — pass `true` to overwrite an existing object at the same path (used for profile photos, which always live at a fixed per-user path).
- `options.onProgress` — `(progress: { stage: "validating" | "compressing" | "uploading"; percent?: number }) => void`. `percent` is only meaningful during `"compressing"` (real numbers from the compressor); see the note below on upload progress.

### Using the hook instead

For a component that just needs a file input, a spinner, and a callback:

```tsx
const { uploading, progress, fileInputRef, triggerUpload, handleFileChange } = useImageUpload({
  bucket: "organizer-images",
  folder: organizerId,
  onSuccess: (url) => setPhoto(url),
  onError: (message) => toast.error(message),
});

<input ref={fileInputRef} type="file" accept={ALLOWED_IMAGE_TYPES.join(",")} onChange={handleFileChange} className="hidden" />
<button onClick={triggerUpload} disabled={uploading}>
  {uploading ? <Spinner /> : "Change photo"}
</button>
```

### A note on upload progress

`browser-image-compression`'s `onProgress` gives real 0–100 progress during compression. The Supabase JS client's `storage.upload()` wraps `fetch`, which does not expose upload-progress events — there is no reliable byte-level progress number available for the network-upload phase with the current client. `onProgress` still fires with `{ stage: "uploading" }` (no `percent`) so the UI can show an indeterminate "Uploading…" state rather than nothing. If true upload-progress becomes a hard requirement later, it would need a custom `XMLHttpRequest`-based upload instead of the Supabase SDK's `upload()` — not implemented here since it wasn't asked for beyond "if possible."

## Error handling

Every failure mode throws a typed `UploadImageError` with a `.code` and a ready-to-display `.message`:

| Code | When |
|---|---|
| `invalid_type` | File isn't JPEG/PNG/WebP |
| `too_large` | Original file over 5MB, or (rare) still over 5MB after compression |
| `corrupted` | File claims to be an image but doesn't decode |
| `compression_failed` | `browser-image-compression` itself threw |
| `upload_failed` | Supabase returned an error (bucket/policy/quota issue, etc.) |
| `network_error` | The upload request failed at the network level (`fetch` `TypeError`) |

Catch `UploadImageError` specifically to get a code you can branch on; any other error is unexpected and should be treated as a bug.

## Migrating an existing upload point / adding a new one

1. Import `uploadImage` (and `UploadImageError` if you want typed error branching) from `@/lib/uploadImage`.
2. Call `await uploadImage(file, bucketName, folder)` instead of any direct `supabase.storage.from(bucket).upload(...)` call.
3. Do not re-implement size/type validation locally — `uploadImage` already does it. If you need the accepted-types list for an `<input accept="...">`, import `ALLOWED_IMAGE_TYPES` from `@/lib/imageCompression` (or re-exported from `@/hooks/use-image-upload`) rather than hardcoding a new list.
4. If the upload point is a simple "pick a file, show a spinner, get a URL back" component, use the `useImageUpload` hook instead of calling `uploadImage` directly — it already wires up `uploading`/`progress` state and the hidden file input pattern used elsewhere in the app.
5. Wrap the call in a `try/catch`, catch `UploadImageError`, and show `err.message` to the user (toast, inline error, `alert`, whatever the surrounding component already uses).

## What this system does not do

- **No video handling.** Video uploads (event videos, fundraiser videos, the rich-text editor's video embed) are untouched — they still call Supabase Storage directly, unchanged. Video compression is a separate future task.
- **No retroactive processing.** Images already in Storage are never re-compressed, re-validated, or re-uploaded by anything in this system.
- **No server-side compression.** `uploadImage` is browser-only (it needs `File`, `Canvas`, and Web Worker support). The one server-side upload path in the app (`app/api/media/import/route.ts`, used for importing images from external sources like Eventbrite/GoFundMe) calls `uploadPublicFile` directly and is intentionally left alone — there's no user-selected `File` object to compress there, since it downloads and re-uploads bytes fetched from an external URL.
