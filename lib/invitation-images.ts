/**
 * lib/invitation-images.ts
 *
 * Pure (DOM-free) helpers for the invitation image uploader:
 * resize math, EXIF orientation handling, focal-point normalization,
 * gallery bounds/reordering, and byte formatting.
 *
 * Kept free of canvas/File APIs so the logic is unit-testable in Node.
 * The client component (`InvitationImageUploader`) applies these results
 * to a real canvas at upload time.
 */

/** Long edge (px) invitation uploads are resized to. Never upscales. */
export const INVITATION_MAX_LONG_EDGE_PX = 1600;

/** Maximum gallery photos per invitation page (matches Zod schema cap). */
export const INVITATION_GALLERY_MAX = 12;

/** EXIF orientation values as defined by the EXIF spec (1-8). */
export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Computes the output dimensions for an image: the long edge is scaled to
 * `maxLongEdge` (default 1600) keeping the aspect ratio. Images already at
 * or below the ceiling are returned unchanged — never upscaled.
 */
export function computeResizeTarget(
  natural: ImageDimensions,
  maxLongEdge: number = INVITATION_MAX_LONG_EDGE_PX
): ImageDimensions {
  const { width, height } = natural;
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) return { width, height };
  const scale = maxLongEdge / longEdge;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

/**
 * EXIF orientations 5-8 store the image sideways: the decoded bitmap
 * dimensions must be swapped before any resize math or canvas layout.
 */
export function exifSwapsDimensions(orientation: number): boolean {
  return orientation >= 5 && orientation <= 8;
}

/** Effective decoded dimensions after accounting for EXIF rotation. */
export function orientedDimensions(
  natural: ImageDimensions,
  orientation: number
): ImageDimensions {
  if (exifSwapsDimensions(orientation)) {
    return { width: natural.height, height: natural.width };
  }
  return { width: natural.width, height: natural.height };
}

export type CanvasFlip = "none" | "horizontal" | "vertical";

export interface CanvasOrientationTransform {
  /** Clockwise rotation to apply (degrees). */
  rotateDeg: 0 | 90 | 180 | 270;
  flip: CanvasFlip;
}

/**
 * Maps an EXIF orientation tag to the canvas transform that bakes the
 * intended display orientation into the pixels (so the output file needs
 * no EXIF tag to render correctly).
 *
 * Application order in the component: translate to center, rotate
 * clockwise by `rotateDeg`, scale by `flip`, draw centered — i.e.
 * p' = R(rotateDeg) · S(flip) · p. This matches the canonical canvas
 * EXIF recipe (rotate-then-scale composition), verified against the
 * transpose cases 5 and 7. User rotation composes by addition:
 * total = (rotateDeg + userRotateDeg) % 360 with the same flip.
 */
export function exifToCanvasTransform(orientation: number): CanvasOrientationTransform {
  switch (orientation) {
    case 2:
      return { rotateDeg: 0, flip: "horizontal" };
    case 3:
      return { rotateDeg: 180, flip: "none" };
    case 4:
      return { rotateDeg: 0, flip: "vertical" };
    case 5:
      return { rotateDeg: 90, flip: "vertical" };
    case 6:
      return { rotateDeg: 90, flip: "none" };
    case 7:
      return { rotateDeg: 270, flip: "vertical" };
    case 8:
      return { rotateDeg: 270, flip: "none" };
    case 1:
    default:
      return { rotateDeg: 0, flip: "none" };
  }
}

/**
 * Reads the EXIF orientation tag (0x0112) from raw JPEG bytes.
 * Returns 1 when absent/unparseable — never throws.
 */
export function readExifOrientation(bytes: ArrayBuffer | Uint8Array): ExifOrientation {
  try {
    const view = bytes instanceof Uint8Array ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new DataView(bytes);
    if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return 1; // not a JPEG
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      if (view.getUint8(offset) !== 0xff) break;
      const marker = view.getUint8(offset + 1);
      const size = view.getUint16(offset + 2, false);
      if (size < 2) break;
      if (marker === 0xe1) {
        // APP1 — check for "Exif\0\0" header
        if (
          offset + 10 <= view.byteLength &&
          view.getUint32(offset + 4, false) === 0x45786966 && // "Exif"
          view.getUint16(offset + 8, false) === 0x0000
        ) {
          const tiffStart = offset + 10;
          const littleEndian =
            view.getUint16(tiffStart, false) === 0x4949
              ? true
              : view.getUint16(tiffStart, false) === 0x4d4d
                ? false
                : null;
          if (littleEndian === null) return 1;
          const ifdOffset = view.getUint32(tiffStart + 4, littleEndian);
          const entries = view.getUint16(tiffStart + ifdOffset, littleEndian);
          for (let i = 0; i < entries; i++) {
            const entry = tiffStart + ifdOffset + 2 + i * 12;
            if (entry + 12 > view.byteLength) break;
            if (view.getUint16(entry, littleEndian) === 0x0112) {
              const value = view.getUint16(entry + 8, littleEndian);
              if (value >= 1 && value <= 8) return value as ExifOrientation;
              return 1;
            }
          }
        }
        return 1; // APP1 without parsable EXIF — orientation unknown, assume normal
      }
      if (marker === 0xda || marker === 0xd9) break; // SOS / EOI — no more headers
      offset += 2 + size;
    }
  } catch {
    // fall through to default
  }
  return 1;
}

/** Focal point in 0-100 percentages (matches hero_image_focus_x/y). */
export interface FocalPoint {
  x: number;
  y: number;
}

/** Clamps and rounds a focal point to integer 0-100 percentages. */
export function normalizeFocalPoint(x: number, y: number): FocalPoint {
  const clamp = (v: number) =>
    Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : 50;
  return { x: clamp(x), y: clamp(y) };
}

/**
 * Converts a focal point to a CSS `object-position` value — the same
 * mechanism the invitation templates use (`heroFocusStyle`), so the
 * picker preview matches guest rendering exactly.
 */
export function focalToObjectPosition(focal: FocalPoint): string {
  const { x, y } = normalizeFocalPoint(focal.x, focal.y);
  return `${x}% ${y}%`;
}

/**
 * Converts a pointer position inside an image element to a focal point.
 */
export function pointerToFocalPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number }
): FocalPoint {
  if (rect.width <= 0 || rect.height <= 0) return { x: 50, y: 50 };
  return normalizeFocalPoint(
    ((clientX - rect.left) / rect.width) * 100,
    ((clientY - rect.top) / rect.height) * 100
  );
}

/** Gallery helpers (mirror the Zod 12-item cap). */
export function canAddGalleryItem(count: number): boolean {
  return count < INVITATION_GALLERY_MAX;
}

/** Moves an item one slot; out-of-range moves return the array unchanged. */
export function moveGalleryItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return items;
  }
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Human-readable byte size for before/after upload display. */
export function formatImageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Output MIME type for the re-encode step: JPEG stays JPEG, PNG/WebP
 * become WebP so phone photos (including >5MB originals, after the
 * 1600px resize) always land well under storage limits.
 */
export function invitationOutputMime(sourceType: string): "image/jpeg" | "image/webp" {
  return sourceType === "image/jpeg" ? "image/jpeg" : "image/webp";
}

/** File extension matching `invitationOutputMime`. */
export function invitationOutputExtension(sourceType: string): "jpg" | "webp" {
  return invitationOutputMime(sourceType) === "image/jpeg" ? "jpg" : "webp";
}
