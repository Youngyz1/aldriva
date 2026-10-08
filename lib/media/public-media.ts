import { isAdmin } from "@/lib/auth";
import {
  ENTITY_ROLES_CONTENT_WRITE,
  ENTITY_ROLES_MANAGE,
  checkTenantAccess,
} from "@/lib/entity-auth";
import {
  MEDIA_PURPOSES,
  type MediaPurpose,
} from "@/lib/media/constants";
import type { PublicMediaType } from "@/lib/media/constants";

export { MAX_PUBLIC_MEDIA_BYTES, MEDIA_PURPOSES, PUBLIC_MEDIA_TYPES } from "@/lib/media/constants";
export type { MediaPurpose } from "@/lib/media/constants";
export type MediaAction = "upload" | "delete";

const TENANT_MEDIA_PURPOSES = new Set<MediaPurpose>([
  "event_image",
  "article_image",
  "product_image",
  "campaign_image",
  "logo",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isMediaPurpose(value: unknown): value is MediaPurpose {
  return typeof value === "string" && MEDIA_PURPOSES.includes(value as MediaPurpose);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function getMediaTargetKey(userId: string, purpose: MediaPurpose, tenantId: string | null): string {
  return userId + "/" + purpose + "/" + (tenantId ?? "personal");
}

export function parseTemporaryMediaKey(
  key: unknown,
  userId: string
): { key: string; purpose: MediaPurpose; tenantId: string | null } | null {
  if (typeof key !== "string") return null;

  const parts = key.split("/");
  if (parts.length !== 4 || parts[0] !== userId || !isMediaPurpose(parts[1]) || !isUuid(parts[3])) {
    return null;
  }

  const tenantId = parts[2] === "personal" ? null : parts[2];
  if (tenantId !== null && !isUuid(tenantId)) return null;
  const purpose = parts[1];
  if ((purpose === "cms" || purpose === "avatar") !== (tenantId === null)) return null;
  return { key, purpose, tenantId };
}

export async function authorizeMediaTarget(
  userId: string,
  purpose: MediaPurpose,
  tenantId: string | null,
  action: MediaAction
): Promise<boolean> {
  if (purpose === "cms") return tenantId === null && (await isAdmin());
  if (purpose === "avatar") return tenantId === null;
  if (!TENANT_MEDIA_PURPOSES.has(purpose) || !tenantId) return false;

  const roles = action === "delete" ? ENTITY_ROLES_MANAGE : ENTITY_ROLES_CONTENT_WRITE;
  const access = await checkTenantAccess(userId, tenantId, roles);
  return access.hasAccess;
}

export function imageTypeForSharpFormat(
  format: string | undefined,
  compression: string | undefined
): PublicMediaType | null {
  switch (format) {
    case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "avif": return "image/avif";
    case "heif": return compression === "av1" ? "image/avif" : null;
    default: return null;
  }
}
