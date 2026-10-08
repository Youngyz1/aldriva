/**
 * lib/digital-products.ts
 *
 * Shared constants + pure validation helpers for Aldriva Shop digital
 * products (migration_116).
 *
 * Pure module — zero runtime imports — so it is safe to import from client
 * components (asset upload preflight), API routes (server-side validation),
 * and node:test regression tests alike. Same convention as
 * lib/video-validation.ts.
 */

export const DIGITAL_ASSET_BUCKET = "product-assets";

export type ProductAssetStorageProvider = "supabase" | "r2";

/** Legacy rows without a column value remain on Supabase during rollout. */
export function productAssetStorageProvider(value: unknown): ProductAssetStorageProvider | null {
  if (value === null || value === undefined || value === "supabase") return "supabase";
  return value === "r2" ? "r2" : null;
}

/** Matches the storage bucket cap in migration_116 (200MB, same as event-videos). */
export const DIGITAL_ASSET_MAX_BYTES = 200 * 1024 * 1024;

export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 40;
export const MAX_PREVIEW_IMAGES = 8;

export const PRODUCT_TYPES = [
  "ebook",
  "guide",
  "workbook",
  "template",
  "spreadsheet",
  "presentation",
  "resource_pack",
  "course",
  "audio",
  "video",
  "bundle",
  "other",
] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  ebook: "E-book",
  guide: "Guide",
  workbook: "Workbook",
  template: "Template",
  spreadsheet: "Spreadsheet",
  presentation: "Presentation",
  resource_pack: "Resource pack",
  course: "Course",
  audio: "Audio",
  video: "Video",
  bundle: "Bundle",
  other: "Other",
};

/**
 * 'other' is the pre-116 default and covers physical merch / unspecified
 * listings — existing inventory behavior is preserved for it. Every other
 * type is a digital listing (stock controls hidden, quantity fixed at 1).
 */
export function isDigitalProductType(value: unknown): boolean {
  return (
    typeof value === "string" &&
    (PRODUCT_TYPES as readonly string[]).includes(value) &&
    value !== "other"
  );
}

export function isValidProductType(value: unknown): value is ProductType {
  return (
    typeof value === "string" &&
    (PRODUCT_TYPES as readonly string[]).includes(value)
  );
}

export const DIGITAL_LICENSES = [
  "personal",
  "commercial",
  "extended",
  "custom",
] as const;

export type DigitalLicense = (typeof DIGITAL_LICENSES)[number];

export const DIGITAL_LICENSE_LABELS: Record<DigitalLicense, string> = {
  personal: "Personal use",
  commercial: "Commercial use",
  extended: "Extended commercial use",
  custom: "Custom license",
};

export function isValidLicense(value: unknown): value is DigitalLicense {
  return (
    typeof value === "string" &&
    (DIGITAL_LICENSES as readonly string[]).includes(value)
  );
}

/** Extension (with dot) -> expected MIME types. Client MIME is never trusted. */
export const ASSET_EXTENSION_MIMES: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".epub": ["application/epub+zip"],
  ".mobi": ["application/x-mobipocket-ebook", "application/octet-stream"],
  ".zip": ["application/zip", "application/x-zip-compressed"],
  ".xlsx": [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  ".csv": ["text/csv"],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ".pptx": [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  ".mp3": ["audio/mpeg"],
  ".mp4": ["video/mp4"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".webp": ["image/webp"],
};

export const ALLOWED_ASSET_EXTENSIONS = Object.keys(ASSET_EXTENSION_MIMES);

export function assetExtensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  if (idx <= 0) return "";
  return fileName.slice(idx).toLowerCase();
}

export interface AssetRequestValidation {
  valid: boolean;
  error?: string;
  ext?: string;
}

/**
 * Server-side gate for an upload request: extension allowlist, size cap,
 * filename sanity (no path traversal — the storage path is always built
 * server-side from product/asset ids + a sanitized basename).
 */
export function validateAssetRequest(
  fileName: unknown,
  fileSizeBytes: unknown
): AssetRequestValidation {
  if (typeof fileName !== "string" || fileName.trim().length === 0) {
    return { valid: false, error: "A file name is required." };
  }
  if (fileName.length > 255) {
    return { valid: false, error: "File name is too long." };
  }
  // Never allow client-controlled directory structure in the name.
  if (
    fileName.includes("/") ||
    fileName.includes("\\") ||
    fileName.split("..").length > 1
  ) {
    return { valid: false, error: "Invalid file name." };
  }
  const ext = assetExtensionOf(fileName);
  if (!ext || !ALLOWED_ASSET_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Unsupported file type '${ext || "none"}'. Allowed: ${ALLOWED_ASSET_EXTENSIONS.join(", ")}`,
    };
  }
  if (
    typeof fileSizeBytes !== "number" ||
    !Number.isFinite(fileSizeBytes) ||
    fileSizeBytes <= 0
  ) {
    return { valid: false, error: "Invalid file size." };
  }
  if (fileSizeBytes > DIGITAL_ASSET_MAX_BYTES) {
    return {
      valid: false,
      error: `File exceeds the ${DIGITAL_ASSET_MAX_BYTES / 1024 / 1024}MB limit.`,
    };
  }
  return { valid: true, ext };
}

export interface AssetSniffResult {
  valid: boolean;
  mimeType?: string;
  error?: string;
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i]);
  return out;
}

/**
 * Client-side upload preflight: inspect the first bytes of the file and
 * reject obvious spoofs before requesting a signed upload URL.
 *
 * Containers without a reliable magic signature (.csv plain text, .mobi
 * PalmDB, .epub beyond its ZIP envelope) are accepted on extension + size
 * alone here — the note below documents the gap honestly. ZIP-based Office
 * formats (.docx/.xlsx/.pptx) and .epub share the PK envelope and are
 * reported as application/zip; the route re-checks extension consistency.
 */
export function sniffAssetBytes(
  head: Uint8Array,
  ext: string
): AssetSniffResult {
  if (!head || head.length === 0) {
    return { valid: false, error: "File is empty." };
  }

  // PDF: %PDF
  if (
    head.length >= 5 &&
    head[0] === 0x25 &&
    head[1] === 0x50 &&
    head[2] === 0x44 &&
    head[3] === 0x46 &&
    head[4] === 0x2d
  ) {
    return { valid: true, mimeType: "application/pdf" };
  }

  // ZIP envelope: PK\x03\x04 (covers .zip/.epub/.docx/.xlsx/.pptx).
  if (
    head.length >= 4 &&
    head[0] === 0x50 &&
    head[1] === 0x4b &&
    head[2] === 0x03 &&
    head[3] === 0x04
  ) {
    return { valid: true, mimeType: "application/zip" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    head.length >= 8 &&
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47 &&
    head[4] === 0x0d &&
    head[5] === 0x0a &&
    head[6] === 0x1a &&
    head[7] === 0x0a
  ) {
    return { valid: true, mimeType: "image/png" };
  }

  // JPEG: FF D8 FF
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return { valid: true, mimeType: "image/jpeg" };
  }

  // WebP: RIFF .... WEBP
  if (
    head.length >= 12 &&
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[3] === 0x46 &&
    head[8] === 0x57 &&
    head[9] === 0x45 &&
    head[10] === 0x42 &&
    head[11] === 0x50
  ) {
    return { valid: true, mimeType: "image/webp" };
  }

  // MP3: ID3 tag or MPEG frame sync (0xFF 0xE0 mask).
  if (
    (head.length >= 3 &&
      head[0] === 0x49 &&
      head[1] === 0x44 &&
      head[2] === 0x33) ||
    (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0)
  ) {
    return { valid: true, mimeType: "audio/mpeg" };
  }

  // MP4/MOV: .... ftyp (ISO BMFF). Accepts video brands only.
  if (
    head.length >= 12 &&
    head[4] === 0x66 &&
    head[5] === 0x74 &&
    head[6] === 0x79 &&
    head[7] === 0x70
  ) {
    const brand = asciiAt(head, 8, 4);
    if (
      brand === "isom" ||
      brand === "iso2" ||
      brand === "mp41" ||
      brand === "mp42" ||
      brand === "avc1" ||
      brand === "M4V " ||
      brand === "qt  "
    ) {
      return { valid: true, mimeType: "video/mp4" };
    }
    return { valid: false, error: "Unsupported video format." };
  }

  // No reliable envelope: accept on extension alone (documented gap).
  if (ext === ".csv" || ext === ".mobi") {
    return { valid: true, mimeType: ext === ".csv" ? "text/csv" : undefined };
  }

  return {
    valid: false,
    error: "File content does not match its extension.",
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Builds the private-bucket path server-side. Rejects non-UUID ids and any
 * filename that could escape the product directory (fail closed — never
 * trust client-controlled path segments).
 */
export function buildAssetPath(
  productId: string,
  assetId: string,
  fileName: string
): string | null {
  if (!isUuid(productId) || !isUuid(assetId)) return null;
  const check = validateAssetRequest(fileName, 1);
  if (!check.valid) return null;
  const safe = fileName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = safe || "asset";
  return `${productId}/${assetId}/${Date.now()}-${base}`;
}

export type DownloadDecision = "allow" | "deny";

export interface DownloadAccessInput {
  orderFound: boolean;
  orderStatus: string | null;
  /** Authenticated requester id, or null for guests. */
  requesterUserId: string | null;
  orderBuyerId: string | null;
  guestEmail: string | null;
  orderBuyerEmail: string | null;
}

/**
 * Pure download-authorization matrix (DB lookup happens in the route; this
 * is the decision core so it stays unit-testable):
 *
 * - unknown order / non-paid status (pending/cancelled/refunded/anything
 *   else) -> deny. Access is never granted because an order once existed.
 * - authenticated buyer whose id matches the order -> allow.
 * - guest order (buyer_id NULL) with a case-insensitive email match -> allow.
 * - everything else (including another signed-in buyer) -> deny.
 */
export function decideDownloadAccess(input: DownloadAccessInput): DownloadDecision {
  if (!input.orderFound) return "deny";
  if (input.orderStatus !== "paid") return "deny";

  if (
    input.requesterUserId &&
    input.orderBuyerId &&
    input.requesterUserId === input.orderBuyerId
  ) {
    return "allow";
  }

  // Guest path: order must be a guest order (no buyer_id) and the supplied
  // email must match the fulfillment contact on the order. Fail closed on
  // empty values — two empty strings never match.
  if (!input.orderBuyerId && input.guestEmail && input.orderBuyerEmail) {
    const a = input.guestEmail.trim().toLowerCase();
    const b = input.orderBuyerEmail.trim().toLowerCase();
    if (a.length > 0 && a === b) return "allow";
  }

  return "deny";
}

export function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim().toLowerCase().replace(/\s+/g, "-"))
      .filter((t) => t.length > 0 && t.length <= MAX_TAG_LENGTH)
      .slice(0, MAX_TAGS);
  }
  if (typeof value === "string") {
    return normalizeTags(
      value
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    );
  }
  return [];
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
