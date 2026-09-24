import { supabase } from "@/lib/supabase";
import { sanitizeUrl } from "@/lib/sanitize-html";

export const CMS_MEDIA_BUCKET = "cms-media" as const;

export const BUILDER_MEDIA_FOLDERS = ["heroes", "gallery", "team", "avatars", "blocks"] as const;

export type MyMediaItem = {
  path: string;
  name: string;
  publicUrl: string;
  updatedAt?: string;
  createdAt?: string;
  size?: number;
  mimeType?: string;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidTenantId(tenantId: unknown): boolean {
  return typeof tenantId === "string" && UUID_REGEX.test(tenantId.trim());
}

function isSafePathSegment(segment: string): boolean {
  if (!segment || segment === "." || segment === "..") return false;
  if (segment.includes("/") || segment.includes("\\") || segment.includes("\0")) return false;
  if (segment.includes("..")) return false;
  return true;
}

function isSafeTenantPath(tenantId: string, fullPath: string): boolean {
  if (!fullPath.startsWith(`${tenantId}/`)) return false;
  if (fullPath.includes("..") || fullPath.includes("//")) return false;
  const parts = fullPath.split("/").filter(Boolean);
  if (parts[0] !== tenantId) return false;
  for (const p of parts) {
    if (!isSafePathSegment(p)) return false;
  }
  return true;
}

export async function listTenantMedia(
  tenantId: string,
  folders: readonly string[] = BUILDER_MEDIA_FOLDERS
): Promise<MyMediaItem[]> {
  if (!isValidTenantId(tenantId)) {
    throw new Error("Invalid tenant ID");
  }

  const allItems: MyMediaItem[] = [];

  for (const folder of folders) {
    if (!isSafePathSegment(folder)) continue;
    const prefix = `${tenantId}/${folder}`;
    const { data, error } = await supabase.storage.from(CMS_MEDIA_BUCKET).list(prefix, {
      limit: 100,
      sortBy: { column: "updated_at", order: "desc" },
    });
    if (error) {
      // storage.list returns error for non-existent prefix — treat as empty, but surface real errors
      // Supabase returns empty array for missing folder; only throw on unexpected error
      if (error.message && /not found/i.test(error.message)) continue;
      // For other errors, we surface as empty and let caller handle via try/catch
      // To keep MVP simple, we re-throw with generic message (no raw Supabase details)
      throw new Error("Could not load media");
    }
    if (!data || data.length === 0) continue;
    for (const obj of data as Array<{ name: string; id?: string; updated_at?: string; created_at?: string; metadata?: { size?: number; mimetype?: string } }>) {
      if (!obj.name || obj.name.startsWith(".")) continue;
      // Supabase list returns files in folder; directories have null id? Filter only files
      const fileName = obj.name;
      if (!isSafePathSegment(fileName)) continue;
      const fullPath = `${prefix}/${fileName}`;
      if (!isSafeTenantPath(tenantId, fullPath)) continue;
      const { data: urlData } = supabase.storage.from(CMS_MEDIA_BUCKET).getPublicUrl(fullPath);
      const publicUrl = urlData?.publicUrl || "";
      const sanitized = sanitizeUrl(publicUrl);
      if (!sanitized) continue;
      allItems.push({
        path: fullPath,
        name: fileName,
        publicUrl: sanitized,
        updatedAt: obj.updated_at,
        createdAt: obj.created_at,
        size: obj.metadata?.size,
        mimeType: obj.metadata?.mimetype,
      });
    }
  }

  // Sort aggregated by updatedAt desc
  allItems.sort((a, b) => {
    const da = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const db = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return db - da;
  });

  return allItems;
}

export async function deleteTenantMedia(tenantId: string, path: string): Promise<void> {
  if (!isValidTenantId(tenantId)) {
    throw new Error("Invalid tenant ID");
  }
  if (typeof path !== "string" || !path) throw new Error("Invalid path");
  if (!isSafeTenantPath(tenantId, path)) {
    throw new Error("Invalid path: does not belong to tenant");
  }
  // Additional traversal guard
  if (path.includes("..") || path.includes("//")) throw new Error("Invalid path");

  const { error } = await supabase.storage.from(CMS_MEDIA_BUCKET).remove([path]);
  if (error) {
    throw new Error("Failed to delete media");
  }
}

export function isValidTenantPath(tenantId: string, path: string): boolean {
  if (!isValidTenantId(tenantId)) return false;
  return isSafeTenantPath(tenantId, path);
}
