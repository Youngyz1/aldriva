/**
 * lib/memories/photo-format.ts
 *
 * Pure photo-format helpers — Round 4. No imports: safe for client
 * components and the hermetic test suite.
 */

/** Must match the `event-memories` bucket limit (migration 162). */
export const MEMORY_MAX_BYTES = 15 * 1024 * 1024;

/**
 * Decompression-bomb caps. HEIC is capped lower (30 MP) because its decode
 * runs in JS/WASM (heic-convert) rather than native code, and because a
 * failed header parse rejects the file outright instead of falling back.
 * JPEG/PNG/WebP decode natively via sharp with a 50 MP input cap plus an
 * explicit post-decode check at the same bound.
 */
export const MEMORY_MAX_PIXELS = 50_000_000;
export const MEMORY_MAX_PIXELS_HEIC = 30_000_000;

/** HEIC conversion budget. Exceeding it fails the upload cleanly. */
export const HEIC_CONVERT_TIMEOUT_MS = 20_000;

/** Declared upload MIME → allowed magic-byte kinds (issuance-time gate). */
export const MEMORY_UPLOAD_MIME_ALLOWLIST: Record<string, readonly string[]> = {
  "image/jpeg": ["jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/heic": ["heic"],
  "image/heif": ["heic"],
};

export type MemoryPhotoKind = "jpeg" | "png" | "webp" | "heic";

/**
 * Sniffs the photo kind from magic bytes. Returns null for anything that
 * is not a supported photo (scripts, SVG, BMP, TIFF, AVIF, … are rejected).
 */
export function detectPhotoKind(bytes: Uint8Array): MemoryPhotoKind | null {
  if (bytes.length < 12) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "png";
  }
  // WebP: RIFF....WEBP
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "webp";
  }
  // HEIC/HEIF: ....ftyp + compatible brand.
  if (
    bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1", "heif", "heIx"].includes(brand)) {
      return "heic";
    }
  }
  return null;
}

/**
 * Rejects images over the pixel cap. Throws a caller-mappable Error;
 * pure so the hermetic suite can pin the boundary exactly.
 */
export function enforceMaxPixels(
  width: number | null | undefined,
  height: number | null | undefined,
  cap: number = MEMORY_MAX_PIXELS
): void {
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1 ||
    width * height > cap
  ) {
    throw new Error(`Photo exceeds the ${Math.round(cap / 1_000_000)} megapixel limit.`);
  }
}

function readU32(bytes: Uint8Array, offset: number): number | null {
  if (offset + 4 > bytes.length) return null;
  return (
    bytes[offset] * 0x1000000 +
    ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])
  );
}

/**
 * Reads HEIC/HEIF dimensions from the container header WITHOUT decoding
 * pixels: walks top-level boxes into meta → iprp → ipco → ispe and reads
 * the spatial extents. Returns null on anything malformed (caller falls
 * back to post-decode enforcement). Pure and allocation-free beyond the
 * input view.
 */
export function readHeicDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const boxAt = (offset: number): { type: string; header: number; end: number } | null => {
    const size = readU32(bytes, offset);
    if (size === null || size < 8 || offset + size > bytes.length) return null;
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );
    return { type, header: offset + 8, end: offset + size };
  };

  // Top-level scan for the meta box (a FullBox: 4 version/flags bytes first).
  let cursor = 0;
  while (cursor + 8 <= bytes.length) {
    const box = boxAt(cursor);
    if (!box) return null;
    if (box.type === "meta") {
      let inner = box.header + 4; // skip FullBox version/flags
      const dive = (want: string): { header: number; end: number } | null => {
        while (inner + 8 <= box.end) {
          const child = boxAt(inner);
          if (!child || child.end > box.end) return null;
          if (child.type === want) return { header: child.header, end: child.end };
          inner = child.end;
        }
        return null;
      };
      const iprp = dive("iprp");
      if (!iprp) return null;
      // Re-scope the scan to iprp's children.
      const diveIn = (want: string, start: number, end: number): { header: number; end: number } | null => {
        let c = start;
        while (c + 8 <= end) {
          const child = boxAt(c);
          if (!child || child.end > end) return null;
          if (child.type === want) return { header: child.header, end: child.end };
          c = child.end;
        }
        return null;
      };
      const ipco = diveIn("ipco", iprp.header, iprp.end);
      if (!ipco) return null;
      const ispe = diveIn("ispe", ipco.header, ipco.end);
      if (!ispe) return null;
      // ispe is a FullBox: version/flags (4) + width u32 + height u32.
      const width = readU32(bytes, ispe.header + 4);
      const height = readU32(bytes, ispe.header + 8);
      if (width === null || height === null || width < 1 || height < 1) return null;
      return { width, height };
    }
    cursor = box.end;
  }
  return null;
}

/**
 * Races async work against a budget. On timeout the work is NOT cancelled
 * (JS cannot preempt it) — the caller must treat the late settlement as
 * inert and clean up (the pipeline deletes the pending object and rejects
 * the upload). Rejects with a clean, caller-mappable Error.
 */
export function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s.`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
