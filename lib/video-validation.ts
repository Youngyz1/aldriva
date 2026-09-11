/**
 * lib/video-validation.ts
 *
 * Magic-byte validation for video uploads (P1 F-09).
 *
 * Pure module — zero imports — so it is safe to import from client
 * components (create-fundraiser/create-event pages, RichTextEditor), API
 * routes (media/import), and node:test regression tests alike.
 *
 * Same validation *approach* as validateImageMagicBytes
 * (lib/image-processing.ts): inspect actual file bytes, never trust the
 * filename extension or the client-reported Content-Type. A separate
 * function (not an extension of the image one) because video container
 * signatures are disjoint from image signatures, the size cap differs
 * (50MB vs 8MB), and image-processing.ts is server-only (it imports the
 * Supabase admin client) while upload call sites are mostly client-side.
 *
 * Accepted containers (fail closed on everything else):
 *  - MP4  (ISO BMFF ftyp + video brand)            -> video/mp4
 *  - MOV  (ISO BMFF ftyp brand "qt  ")             -> video/quicktime
 *  - M4V  (ISO BMFF ftyp brand "M4V ")             -> video/x-m4v
 *  - WebM (EBML header + DocType "webm")           -> video/webm
 *  - Ogg  ("OggS" page capture pattern)            -> video/ogg
 *  - AVI  ("RIFF" .... "AVI ")                     -> video/x-msvideo
 * Deliberately rejected: audio-only brands (M4A/M4B), Matroska DocType
 * (shares EBML magic with WebM but is a different container), HEIC photos
 * (ftyp brand "heic"), and anything unrecognised.
 *
 * Callers pass a head slice (first 64KB is more than enough — every
 * signature above sits within the first bytes, DocType within the EBML
 * header) plus the total file size for the cap check, so browsers never
 * need to buffer a whole 50MB file to validate it.
 */

export interface VideoValidationResult {
  valid: boolean;
  error?: string;
  mimeType?: string;
  sizeBytes?: number;
}

/** Matches the client MAX_VIDEO_SIZE and lib DEFAULT_VIDEO_MAX_BYTES. */
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

export const VIDEO_MAGIC_HEAD_BYTES = 64 * 1024;

const GENERIC_ERROR = "Unsupported video format. Use MP4, WebM, Ogg, or QuickTime.";

/** ISO BMFF major brands that denote a video file (4 chars each). */
const MP4_VIDEO_BRANDS = new Set([
  "isom",
  "iso2",
  "iso3",
  "iso4",
  "iso5",
  "iso6",
  "mp41",
  "mp42",
  "M4V ",
  "avc1",
  "qt  ",
]);

export function videoMimeToExtension(mimeType: string): string {
  switch (mimeType) {
    case "video/webm":
      return "webm";
    case "video/ogg":
      return "ogg";
    case "video/quicktime":
      return "mov";
    case "video/x-msvideo":
      return "avi";
    case "video/x-m4v":
      return "m4v";
    default:
      return "mp4";
  }
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i]);
  return out;
}

/**
 * Reads the DocType string from an EBML header (bytes 0..3 already checked
 * as 1A 45 DF A3). Returns it, or null when absent/unparseable (fail closed).
 */
function readEbmlDocType(head: Uint8Array): string | null {
  if (head.length < 6) return null;
  // VINT data-size of the EBML header element at offset 4.
  const first = head[4];
  let width = 1;
  let mask = 0x80;
  while (width <= 8 && (first & mask) === 0) {
    mask >>= 1;
    width += 1;
  }
  if (width > 8) return null;
  let size = first & (mask - 1);
  let pos = 4;
  for (let i = 1; i < width; i++) {
    pos += 1;
    if (pos >= head.length) return null;
    size = size * 256 + head[pos];
  }
  pos += 1; // start of header content
  const end = Math.min(pos + size, head.length);
  // Scan header elements for DocType (ID 0x42 0x82, 1-byte VINT size).
  while (pos + 3 < end) {
    if (head[pos] === 0x42 && head[pos + 1] === 0x82) {
      const sizeByte = head[pos + 2];
      if ((sizeByte & 0x80) === 0) return null;
      const strLen = sizeByte & 0x7f;
      const start = pos + 3;
      if (strLen === 0 || start + strLen > head.length) return null;
      return asciiAt(head, start, strLen);
    }
    pos += 1;
  }
  return null;
}

export function validateVideoMagicBytes(
  head: Uint8Array,
  fileSizeBytes?: number,
  maxBytes: number = VIDEO_MAX_BYTES
): VideoValidationResult {
  if (!head || head.length === 0) {
    return { valid: false, error: "File is empty." };
  }

  const size = fileSizeBytes ?? head.length;
  if (size > maxBytes) {
    return {
      valid: false,
      error: `File size exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit.`,
    };
  }

  if (head.length < 12) {
    return { valid: false, error: "File is too small to be a valid video." };
  }

  // MP4 / MOV / M4V: [4-byte box size] "ftyp" [4-byte major brand].
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
    const brand = asciiAt(head, 8, 4);
    if (MP4_VIDEO_BRANDS.has(brand)) {
      const mimeType =
        brand === "qt  " ? "video/quicktime" : brand === "M4V " ? "video/x-m4v" : "video/mp4";
      return { valid: true, mimeType, sizeBytes: size };
    }
    return { valid: false, error: GENERIC_ERROR };
  }

  // WebM: EBML header 1A 45 DF A3 + DocType "webm". Matroska ("matroska")
  // shares the EBML magic and is rejected by the DocType check.
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    if (readEbmlDocType(head) === "webm") {
      return { valid: true, mimeType: "video/webm", sizeBytes: size };
    }
    return { valid: false, error: GENERIC_ERROR };
  }

  // Ogg: "OggS" page capture pattern.
  if (head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53) {
    return { valid: true, mimeType: "video/ogg", sizeBytes: size };
  }

  // AVI: "RIFF" [4-byte size] "AVI ".
  if (
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[3] === 0x46 &&
    head[8] === 0x41 &&
    head[9] === 0x56 &&
    head[10] === 0x49 &&
    head[11] === 0x20
  ) {
    return { valid: true, mimeType: "video/x-msvideo", sizeBytes: size };
  }

  return { valid: false, error: GENERIC_ERROR };
}
