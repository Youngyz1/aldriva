import "server-only";

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

export const DAILY_PUBLIC_MEDIA_UPLOAD_LIMIT = 40;
export const DAILY_PUBLIC_MEDIA_BYTES_LIMIT = 200 * 1024 * 1024;

function positiveIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getDailyPublicMediaQuotaLimits() {
  return {
    maxCount: positiveIntegerEnv("MEDIA_UPLOAD_DAILY_COUNT_LIMIT", DAILY_PUBLIC_MEDIA_UPLOAD_LIMIT),
    maxBytes: positiveIntegerEnv("MEDIA_UPLOAD_DAILY_BYTES_LIMIT", DAILY_PUBLIC_MEDIA_BYTES_LIMIT),
  };
}

export function isWithinDailyPublicMediaQuota(
  uploadCount: number,
  uploadedBytes: number,
  requestedBytes: number
): boolean {
  const { maxCount, maxBytes } = getDailyPublicMediaQuotaLimits();
  return Number.isInteger(requestedBytes) && requestedBytes > 0 &&
    uploadCount < maxCount &&
    uploadedBytes + requestedBytes <= maxBytes;
}

export async function enforcePublicMediaRateLimits(
  request: Request,
  userId: string
) {
  const perUser = await checkRateLimit("mediaUpload", `user:${userId}`);
  if (!perUser.allowed) return rateLimitResponse(perUser.retryAfter);

  const perIp = await checkRateLimit("mediaUploadIp", `ip:${clientIp(request)}`);
  if (!perIp.allowed) return rateLimitResponse(perIp.retryAfter);
  return null;
}

/** Atomically reserves the declared raw upload size for the UTC day. */
export async function reservePublicMediaQuota(userId: string, bytes: number): Promise<boolean> {
  const admin = createSupabaseAdmin();
  const { maxCount, maxBytes } = getDailyPublicMediaQuotaLimits();
  const { data, error } = await admin.rpc("reserve_public_media_upload", {
    p_user_id: userId,
    p_bytes: bytes,
    p_max_count: maxCount,
    p_max_bytes: maxBytes,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new PublicMediaQuotaMigrationMissingError();
    }
    throw new Error("Public media quota could not be checked.");
  }
  const row = Array.isArray(data) ? data[0] : data;
  return Boolean(row && typeof row === "object" && "allowed" in row && row.allowed === true);
}

export class PublicMediaQuotaMigrationMissingError extends Error {
  constructor() {
    super("Public media quota RPC is unavailable; verify that migrations 160 and 161 are applied.");
    this.name = "PublicMediaQuotaMigrationMissingError";
  }
}
