export const MAX_PUBLIC_MEDIA_BYTES = 10 * 1024 * 1024;
export const PUBLIC_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;
export type PublicMediaType = (typeof PUBLIC_MEDIA_TYPES)[number];

export const MEDIA_PURPOSES = [
  "event_image",
  "article_image",
  "product_image",
  "campaign_image",
  "logo",
  "avatar",
  "cms",
] as const;

export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];
