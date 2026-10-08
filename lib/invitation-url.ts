import { getSiteUrl } from "@/lib/site-url";

/** Builds the public URL of a general invitation share link. */
export function buildShareUrl(token: string): string {
  return `${getSiteUrl()}/invitation/shared/${token}`;
}
