import "server-only";

import { isAdmin } from "@/lib/auth";
import {
  ENTITY_ROLES_CONTENT_WRITE,
  ENTITY_ROLES_MANAGE,
  checkTenantAccess,
} from "@/lib/entity-auth";
import { EVENT_TEAM_ROLES_MANAGE, hasEventOrOrganizerAccess, type EventTeamRole } from "@/lib/event-auth";
import {
  MEDIA_PURPOSE_POLICIES,
  MEDIA_PURPOSES,
  type MediaPurpose,
  type PublicMediaType,
  type UploadMediaPurpose,
  isUploadMediaPurpose,
} from "@/lib/media/constants";

export {
  MAX_PUBLIC_MEDIA_BYTES,
  MEDIA_PURPOSES,
  MEDIA_PURPOSE_POLICIES,
  PUBLIC_MEDIA_TYPES,
  isUploadMediaPurpose,
} from "@/lib/media/constants";
export type { MediaPurpose, UploadMediaPurpose } from "@/lib/media/constants";

export type MediaAction = "upload" | "delete";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isMediaPurpose(value: unknown): value is MediaPurpose {
  return typeof value === "string" && MEDIA_PURPOSES.includes(value as MediaPurpose);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function getMediaTargetKey(userId: string, purpose: UploadMediaPurpose, scopeId: string | null): string {
  return `${userId}/${purpose}/${scopeId ?? "personal"}`;
}

export function parseTemporaryMediaKey(
  key: unknown,
  userId: string
): { key: string; purpose: UploadMediaPurpose; tenantId: string | null; targetId: string | null } | null {
  if (typeof key !== "string") return null;

  const parts = key.split("/");
  if (parts.length !== 4 || parts[0] !== userId || !isUploadMediaPurpose(parts[1]) || !isUuid(parts[3])) {
    return null;
  }

  const purpose = parts[1];
  const policy = MEDIA_PURPOSE_POLICIES[purpose];
  const scopeId = parts[2] === "personal" ? null : parts[2];
  if (scopeId !== null && !isUuid(scopeId)) return null;
  if (policy.targetKind === "personal" && scopeId !== null) return null;
  if (policy.targetKind !== "personal" && scopeId === null) return null;

  return {
    key,
    purpose,
    tenantId: policy.targetKind === "tenant" ? scopeId : null,
    targetId: policy.targetKind === "event" ? scopeId : null,
  };
}

export function getFinalMediaKey(
  userId: string,
  purpose: UploadMediaPurpose,
  tenantId: string | null,
  targetId: string | null,
  objectId: string
): string {
  const policy = MEDIA_PURPOSE_POLICIES[purpose];
  const prefix = policy.targetPrefix
    .replaceAll("{userId}", userId)
    .replaceAll("{tenantId}", tenantId ?? "")
    .replaceAll("{targetId}", targetId ?? "");
  return `${prefix}/${objectId}.webp`;
}

export async function authorizeMediaTarget(
  userId: string,
  purpose: MediaPurpose,
  tenantId: string | null,
  action: MediaAction,
  targetId: string | null = null
): Promise<boolean> {
  if (purpose === "cms") return tenantId === null && targetId === null && (await isAdmin());
  if (purpose === "avatar") return tenantId === null && targetId === null;

  if ((purpose === "event-banner" || purpose === "invitation-image" || (purpose === "event_image" && targetId)) && targetId) {
    const eventRoles: EventTeamRole[] = action === "delete" ? EVENT_TEAM_ROLES_MANAGE : ["event_manager"];
    const entityRoles = action === "delete" ? ENTITY_ROLES_MANAGE : ENTITY_ROLES_CONTENT_WRITE;
    return hasEventOrOrganizerAccess(userId, targetId, eventRoles, entityRoles);
  }

  const tenantPurposes = new Set<MediaPurpose>([
    "gallery", "cover", "organizer-image", "product-image", "article-image", "campaign-image", "logo",
    "event_image", "article_image", "product_image", "campaign_image",
  ]);
  if (!tenantPurposes.has(purpose) || !tenantId || targetId) return false;

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
