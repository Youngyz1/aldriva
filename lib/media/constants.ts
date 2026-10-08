export const MAX_PUBLIC_MEDIA_BYTES = 10 * 1024 * 1024;
const FIVE_MIB = 5 * 1024 * 1024;
export const PUBLIC_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;
export type PublicMediaType = (typeof PUBLIC_MEDIA_TYPES)[number];

const COMMON_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Public upload purposes exposed to authenticated users. Prefixes are server-owned. */
export const MEDIA_PURPOSE_POLICIES = {
  "event-banner": {
    recordPurpose: "event_image",
    targetKind: "event",
    targetPrefix: "events/{targetId}/banner",
    supabaseBucket: "event-banners",
    maxBytes: MAX_PUBLIC_MEDIA_BYTES,
    allowedTypes: PUBLIC_MEDIA_TYPES,
    adminOnly: false,
  },
  avatar: {
    recordPurpose: "avatar",
    targetKind: "personal",
    targetPrefix: "users/{userId}/avatar",
    supabaseBucket: "profile-images",
    maxBytes: FIVE_MIB,
    allowedTypes: COMMON_IMAGE_TYPES,
    adminOnly: false,
  },
  gallery: {
    recordPurpose: "campaign_image",
    targetKind: "tenant",
    targetPrefix: "tenants/{tenantId}/gallery",
    supabaseBucket: "cms-media",
    maxBytes: MAX_PUBLIC_MEDIA_BYTES,
    allowedTypes: PUBLIC_MEDIA_TYPES,
    adminOnly: false,
  },
  cover: {
    recordPurpose: "article_image",
    targetKind: "tenant",
    targetPrefix: "tenants/{tenantId}/cover",
    supabaseBucket: "cms-media",
    maxBytes: MAX_PUBLIC_MEDIA_BYTES,
    allowedTypes: PUBLIC_MEDIA_TYPES,
    adminOnly: false,
  },
  "organizer-image": {
    recordPurpose: "logo",
    targetKind: "tenant",
    targetPrefix: "organizers/{tenantId}/images",
    supabaseBucket: "organizer-images",
    maxBytes: FIVE_MIB,
    allowedTypes: COMMON_IMAGE_TYPES,
    adminOnly: false,
  },
  "product-image": {
    recordPurpose: "product_image",
    targetKind: "tenant",
    targetPrefix: "products/{tenantId}/images",
    supabaseBucket: "cms-media",
    maxBytes: MAX_PUBLIC_MEDIA_BYTES,
    allowedTypes: PUBLIC_MEDIA_TYPES,
    adminOnly: false,
  },
  "invitation-image": {
    recordPurpose: "event_image",
    targetKind: "event",
    targetPrefix: "events/{targetId}/invitation-images",
    supabaseBucket: "cms-media",
    maxBytes: MAX_PUBLIC_MEDIA_BYTES,
    allowedTypes: PUBLIC_MEDIA_TYPES,
    adminOnly: false,
  },
  "article-image": {
    recordPurpose: "article_image",
    targetKind: "tenant",
    targetPrefix: "tenants/{tenantId}/articles",
    supabaseBucket: "cms-media",
    maxBytes: MAX_PUBLIC_MEDIA_BYTES,
    allowedTypes: PUBLIC_MEDIA_TYPES,
    adminOnly: false,
  },
  "campaign-image": {
    recordPurpose: "campaign_image",
    targetKind: "tenant",
    targetPrefix: "tenants/{tenantId}/campaigns",
    supabaseBucket: "fundraiser-media",
    maxBytes: MAX_PUBLIC_MEDIA_BYTES,
    allowedTypes: PUBLIC_MEDIA_TYPES,
    adminOnly: false,
  },
  logo: {
    recordPurpose: "logo",
    targetKind: "tenant",
    targetPrefix: "tenants/{tenantId}/logos",
    supabaseBucket: "organizer-images",
    maxBytes: FIVE_MIB,
    allowedTypes: COMMON_IMAGE_TYPES,
    adminOnly: false,
  },
  cms: {
    recordPurpose: "cms",
    targetKind: "personal",
    targetPrefix: "cms/{userId}",
    supabaseBucket: "cms-media",
    maxBytes: MAX_PUBLIC_MEDIA_BYTES,
    allowedTypes: PUBLIC_MEDIA_TYPES,
    adminOnly: true,
  },
} as const;

export type UploadMediaPurpose = keyof typeof MEDIA_PURPOSE_POLICIES;

export const MEDIA_PURPOSES = [
  "event-banner",
  "avatar",
  "gallery",
  "cover",
  "organizer-image",
  "product-image",
  "invitation-image",
  "article-image",
  "campaign-image",
  "logo",
  "cms",
  "event_image",
  "article_image",
  "product_image",
  "campaign_image",
  "logo",
  "avatar",
  "cms",
] as const;

export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

export function isUploadMediaPurpose(value: unknown): value is UploadMediaPurpose {
  return typeof value === "string" && Object.hasOwn(MEDIA_PURPOSE_POLICIES, value);
}
