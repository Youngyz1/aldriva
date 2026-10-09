import { getSiteUrl } from "@/lib/site-url";

/** Builds the public URL of a general invitation share link. */
export function buildShareUrl(token: string): string {
  return `${getSiteUrl()}/invitation/shared/${token}`;
}

/** Builds the guest short URL for a Memories photo-upload token (Round 4). */
export function buildMemoryUploadUrl(token: string): string {
  return `${getSiteUrl()}/m/${token}`;
}
