/**
 * lib/website-blocks.ts
 *
 * Aldriva Website Design System & Block Catalog Schema (Phase 3).
 *
 * Defines:
 *  1. Complete TypeScript interfaces for all 10 standard block types + 2 legacy types.
 *  2. Write-time and load-time validation with length bounds, array item caps,
 *     UUID format checks, and strict URL safety backed directly by sanitizeUrl() from lib/sanitize-html.ts.
 *  3. parseBlock / parseBlocks fallback parsers for robust, error-free rendering.
 *  4. Theme token presets & style mapping for tenant website palettes.
 */

import { sanitizeUrl, MAX_ARTICLE_HTML_LENGTH } from "./sanitize-html";

// ── 1. Block Component Types ──────────────────────────────────────────────────

export interface BaseBlock {
  type: string;
}

export interface HeroBlock extends BaseBlock {
  type: "hero";
  heading?: string;
  subheading?: string;
  backgroundImage?: string;
  backgroundColor?: string;
  ctaLabel?: string;
  ctaHref?: string;
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
  align?: "left" | "center" | "right";
  variant?: "split" | "center" | "video_bg";
  videoUrl?: string;
  badge?: string;
}

export interface FeatureItem {
  title: string;
  description?: string;
  icon?: string;
  href?: string;
}

export interface FeaturesBlock extends BaseBlock {
  type: "features";
  heading?: string;
  subheading?: string;
  items?: FeatureItem[];
  columns?: 2 | 3 | 4;
}

export interface AboutHighlight {
  label: string;
  value: string;
  icon?: string;
}

export interface AboutBlock extends BaseBlock {
  type: "about";
  heading?: string;
  subheading?: string;
  story?: string;
  mission?: string;
  founderName?: string;
  founderRole?: string;
  founderImage?: string;
  highlights?: AboutHighlight[];
}

export interface GalleryImage {
  src: string;
  alt?: string;
  caption?: string;
}

export interface GalleryBlock extends BaseBlock {
  type: "gallery";
  heading?: string;
  subheading?: string;
  images?: GalleryImage[];
  columns?: 2 | 3 | 4;
  layout?: "grid" | "masonry" | "carousel";
}

export interface TestimonialItem {
  quote: string;
  author?: string;
  role?: string;
  avatar?: string;
  rating?: number; // 1 to 5
}

export interface TestimonialsBlock extends BaseBlock {
  type: "testimonials";
  heading?: string;
  subheading?: string;
  items?: TestimonialItem[];
  layout?: "grid" | "carousel";
}

export interface ContactBlock extends BaseBlock {
  type: "contact";
  heading?: string;
  subheading?: string;
  email?: string;
  phone?: string;
  address?: string;
  hours?: string;
  showMap?: boolean;
  mapQuery?: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface FaqBlock extends BaseBlock {
  type: "faq";
  heading?: string;
  subheading?: string;
  items?: FaqItem[];
}

// ── Live Embed Block Types (Phase 3) ──────────────────────────────────────────

export interface EventsEmbedBlock extends BaseBlock {
  type: "events_embed";
  heading?: string;
  subheading?: string;
  limit?: number; // Clamped 1..12, default 6
  layout?: "grid" | "list";
  showDrafts?: boolean; // Only visible to authenticated team members
  selectedEventIds?: string[]; // Optional specific event ID subset (max 12 UUIDs)
}

export interface ProductsEmbedBlock extends BaseBlock {
  type: "products_embed";
  heading?: string;
  subheading?: string;
  limit?: number; // Clamped 1..12, default 6
  layout?: "grid" | "list";
  showDrafts?: boolean; // Only visible to authenticated team members
  selectedProductIds?: string[]; // Optional specific product ID subset (max 12 UUIDs)
}

export interface FundraiserEmbedBlock extends BaseBlock {
  type: "fundraiser_embed";
  heading?: string;
  subheading?: string;
  limit?: number; // Clamped 1..12, default 6
  layout?: "banner" | "card" | "grid";
  showDrafts?: boolean; // Only visible to authenticated team members
  selectedFundraiserIds?: string[]; // Optional specific fundraiser ID subset (max 12 UUIDs)
}

// ── Legacy Compatibility Blocks (Phase 2) ───────────────────────────────────

export interface RichTextBlock extends BaseBlock {
  type: "rich_text";
  html: string;
}

export interface CtaBannerBlock extends BaseBlock {
  type: "cta_banner";
  heading?: string;
  subheading?: string;
  ctaLabel?: string;
  ctaHref?: string;
  variant?: "brand" | "dark" | "light";
}

export type Block =
  | HeroBlock
  | FeaturesBlock
  | AboutBlock
  | GalleryBlock
  | TestimonialsBlock
  | ContactBlock
  | FaqBlock
  | EventsEmbedBlock
  | ProductsEmbedBlock
  | FundraiserEmbedBlock
  | RichTextBlock
  | CtaBannerBlock;

export const KNOWN_BLOCK_TYPES = [
  "hero",
  "features",
  "about",
  "gallery",
  "testimonials",
  "contact",
  "faq",
  "events_embed",
  "products_embed",
  "fundraiser_embed",
  "rich_text",
  "cta_banner",
] as const;

export type BlockType = (typeof KNOWN_BLOCK_TYPES)[number];

// ── 2. Content Constraints & Validation ──────────────────────────────────────

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const BLOCK_LIMITS = {
  HEADING_MAX_LENGTH: 200,
  SUBHEADING_MAX_LENGTH: 1000,
  BODY_TEXT_MAX_LENGTH: 2000,
  LABEL_MAX_LENGTH: 100,
  CTA_LABEL_MAX_LENGTH: 60,
  URL_MAX_LENGTH: 2048,
  EMAIL_MAX_LENGTH: 254,
  PHONE_MAX_LENGTH: 50,
  ADDRESS_MAX_LENGTH: 300,
  HOURS_MAX_LENGTH: 300,
  MAX_ARRAY_ITEMS: 12,
  DEFAULT_EMBED_LIMIT: 6,
  MIN_EMBED_LIMIT: 1,
  MAX_EMBED_LIMIT: 12,
} as const;

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; issues: ValidationIssue[] };

function validateUrlField(
  val: unknown,
  path: string,
  issues: ValidationIssue[]
): string | undefined {
  if (val === undefined || val === null || val === "") return undefined;
  if (typeof val !== "string") {
    issues.push({ path, message: "URL must be a string." });
    return undefined;
  }
  if (val.length > BLOCK_LIMITS.URL_MAX_LENGTH) {
    issues.push({
      path,
      message: `URL exceeds maximum length of ${BLOCK_LIMITS.URL_MAX_LENGTH} characters.`,
    });
    return undefined;
  }
  const sanitized = sanitizeUrl(val);
  if (!sanitized) {
    issues.push({
      path,
      message: `Invalid or disallowed URL scheme for "${val}". Allowed: http, https, mailto, tel, or relative (/path, #hash, ?query).`,
    });
    return undefined;
  }
  return sanitized;
}

function validateStringField(
  val: unknown,
  path: string,
  maxLength: number,
  issues: ValidationIssue[],
  required = false
): string | undefined {
  if (val === undefined || val === null || val === "") {
    if (required) {
      issues.push({ path, message: "Field is required." });
    }
    return undefined;
  }
  if (typeof val !== "string") {
    issues.push({ path, message: "Value must be a string." });
    return undefined;
  }
  const trimmed = val.trim();
  if (required && trimmed.length === 0) {
    issues.push({ path, message: "Field cannot be empty." });
    return undefined;
  }
  if (trimmed.length > maxLength) {
    issues.push({
      path,
      message: `Text exceeds maximum length of ${maxLength} characters (got ${trimmed.length}).`,
    });
    return undefined;
  }
  return trimmed;
}

function validateUuidField(
  val: unknown,
  path: string,
  issues: ValidationIssue[]
): string | undefined {
  if (val === undefined || val === null || val === "") return undefined;
  if (typeof val !== "string") {
    issues.push({ path, message: "ID must be a string." });
    return undefined;
  }
  const trimmed = val.trim();
  if (!UUID_REGEX.test(trimmed)) {
    issues.push({
      path,
      message: `ID "${val}" is not a valid UUID format.`,
    });
    return undefined;
  }
  return trimmed;
}

function clampEmbedLimit(val: unknown): number {
  if (typeof val !== "number" || Number.isNaN(val)) {
    return BLOCK_LIMITS.DEFAULT_EMBED_LIMIT;
  }
  return Math.min(
    Math.max(BLOCK_LIMITS.MIN_EMBED_LIMIT, Math.floor(val)),
    BLOCK_LIMITS.MAX_EMBED_LIMIT
  );
}

/**
 * Validates a single block against the schema, returning a structured result.
 */
export function validateBlock(raw: unknown): ValidationResult<Block> {
  const issues: ValidationIssue[] = [];

  if (!raw || typeof raw !== "object") {
    return {
      success: false,
      error: "Block payload must be a non-null object.",
      issues: [{ path: "", message: "Expected object, received null or primitive." }],
    };
  }

  const obj = raw as Record<string, unknown>;
  const type = obj.type;

  if (typeof type !== "string" || !KNOWN_BLOCK_TYPES.includes(type as BlockType)) {
    return {
      success: false,
      error: `Unknown or missing block type: "${String(type)}"`,
      issues: [
        {
          path: "type",
          message: `Block type must be one of: ${KNOWN_BLOCK_TYPES.join(", ")}`,
        },
      ],
    };
  }

  switch (type) {
    case "hero": {
      const heading = validateStringField(
        obj.heading,
        "heading",
        BLOCK_LIMITS.HEADING_MAX_LENGTH,
        issues
      );
      const subheading = validateStringField(
        obj.subheading,
        "subheading",
        BLOCK_LIMITS.SUBHEADING_MAX_LENGTH,
        issues
      );
      const backgroundImage = validateUrlField(
        obj.backgroundImage,
        "backgroundImage",
        issues
      );
      const backgroundColor = validateStringField(
        obj.backgroundColor,
        "backgroundColor",
        50,
        issues
      );
      const ctaLabel = validateStringField(
        obj.ctaLabel,
        "ctaLabel",
        BLOCK_LIMITS.CTA_LABEL_MAX_LENGTH,
        issues
      );
      const ctaHref = validateUrlField(obj.ctaHref, "ctaHref", issues);
      const secondaryCtaLabel = validateStringField(
        obj.secondaryCtaLabel,
        "secondaryCtaLabel",
        BLOCK_LIMITS.CTA_LABEL_MAX_LENGTH,
        issues
      );
      const secondaryCtaHref = validateUrlField(
        obj.secondaryCtaHref,
        "secondaryCtaHref",
        issues
      );
      const align =
        obj.align === "left" || obj.align === "right" || obj.align === "center"
          ? obj.align
          : "center";
      const variant =
        obj.variant === "split" ||
        obj.variant === "video_bg" ||
        obj.variant === "center"
          ? obj.variant
          : "center";
      const videoUrl = validateUrlField(obj.videoUrl, "videoUrl", issues);
      const badge = validateStringField(obj.badge, "badge", 50, issues);

      if (issues.length > 0) {
        return {
          success: false,
          error: "Validation failed for hero block.",
          issues,
        };
      }

      return {
        success: true,
        data: {
          type: "hero",
          ...(heading ? { heading } : {}),
          ...(subheading ? { subheading } : {}),
          ...(backgroundImage ? { backgroundImage } : {}),
          ...(backgroundColor ? { backgroundColor } : {}),
          ...(ctaLabel ? { ctaLabel } : {}),
          ...(ctaHref ? { ctaHref } : {}),
          ...(secondaryCtaLabel ? { secondaryCtaLabel } : {}),
          ...(secondaryCtaHref ? { secondaryCtaHref } : {}),
          align,
          variant,
          ...(videoUrl ? { videoUrl } : {}),
          ...(badge ? { badge } : {}),
        },
      };
    }

    case "features": {
      const heading = validateStringField(
        obj.heading,
        "heading",
        BLOCK_LIMITS.HEADING_MAX_LENGTH,
        issues
      );
      const subheading = validateStringField(
        obj.subheading,
        "subheading",
        BLOCK_LIMITS.SUBHEADING_MAX_LENGTH,
        issues
      );
      const rawColumns = Number(obj.columns);
      const columns =
        rawColumns === 2 || rawColumns === 4 ? rawColumns : 3;

      const rawItems = Array.isArray(obj.items) ? obj.items : [];
      if (rawItems.length > BLOCK_LIMITS.MAX_ARRAY_ITEMS) {
        issues.push({
          path: "items",
          message: `Features block accepts at most ${BLOCK_LIMITS.MAX_ARRAY_ITEMS} items (received ${rawItems.length}).`,
        });
      }

      const items: FeatureItem[] = [];
      rawItems.slice(0, BLOCK_LIMITS.MAX_ARRAY_ITEMS).forEach((item, idx) => {
        if (!item || typeof item !== "object") {
          issues.push({
            path: `items[${idx}]`,
            message: "Feature item must be an object.",
          });
          return;
        }
        const it = item as Record<string, unknown>;
        const title = validateStringField(
          it.title,
          `items[${idx}].title`,
          BLOCK_LIMITS.LABEL_MAX_LENGTH,
          issues,
          true
        );
        const description = validateStringField(
          it.description,
          `items[${idx}].description`,
          500,
          issues
        );
        const icon = validateStringField(
          it.icon,
          `items[${idx}].icon`,
          50,
          issues
        );
        const href = validateUrlField(it.href, `items[${idx}].href`, issues);

        if (title) {
          items.push({
            title,
            ...(description ? { description } : {}),
            ...(icon ? { icon } : {}),
            ...(href ? { href } : {}),
          });
        }
      });

      if (issues.length > 0) {
        return {
          success: false,
          error: "Validation failed for features block.",
          issues,
        };
      }

      return {
        success: true,
        data: {
          type: "features",
          ...(heading ? { heading } : {}),
          ...(subheading ? { subheading } : {}),
          items,
          columns,
        },
      };
    }

    case "about": {
      const heading = validateStringField(
        obj.heading,
        "heading",
        BLOCK_LIMITS.HEADING_MAX_LENGTH,
        issues
      );
      const subheading = validateStringField(
        obj.subheading,
        "subheading",
        BLOCK_LIMITS.SUBHEADING_MAX_LENGTH,
        issues
      );
      const story = validateStringField(
        obj.story,
        "story",
        BLOCK_LIMITS.BODY_TEXT_MAX_LENGTH,
        issues
      );
      const mission = validateStringField(
        obj.mission,
        "mission",
        BLOCK_LIMITS.SUBHEADING_MAX_LENGTH,
        issues
      );
      const founderName = validateStringField(
        obj.founderName,
        "founderName",
        BLOCK_LIMITS.LABEL_MAX_LENGTH,
        issues
      );
      const founderRole = validateStringField(
        obj.founderRole,
        "founderRole",
        BLOCK_LIMITS.LABEL_MAX_LENGTH,
        issues
      );
      const founderImage = validateUrlField(
        obj.founderImage,
        "founderImage",
        issues
      );

      const rawHighlights = Array.isArray(obj.highlights) ? obj.highlights : [];
      if (rawHighlights.length > BLOCK_LIMITS.MAX_ARRAY_ITEMS) {
        issues.push({
          path: "highlights",
          message: `About block accepts at most ${BLOCK_LIMITS.MAX_ARRAY_ITEMS} highlights (received ${rawHighlights.length}).`,
        });
      }

      const highlights: AboutHighlight[] = [];
      rawHighlights.slice(0, BLOCK_LIMITS.MAX_ARRAY_ITEMS).forEach((hl, idx) => {
        if (!hl || typeof hl !== "object") {
          issues.push({
            path: `highlights[${idx}]`,
            message: "Highlight must be an object.",
          });
          return;
        }
        const h = hl as Record<string, unknown>;
        const label = validateStringField(
          h.label,
          `highlights[${idx}].label`,
          BLOCK_LIMITS.LABEL_MAX_LENGTH,
          issues,
          true
        );
        const value = validateStringField(
          h.value,
          `highlights[${idx}].value`,
          BLOCK_LIMITS.LABEL_MAX_LENGTH,
          issues,
          true
        );
        const icon = validateStringField(
          h.icon,
          `highlights[${idx}].icon`,
          50,
          issues
        );

        if (label && value) {
          highlights.push({
            label,
            value,
            ...(icon ? { icon } : {}),
          });
        }
      });

      if (issues.length > 0) {
        return {
          success: false,
          error: "Validation failed for about block.",
          issues,
        };
      }

      return {
        success: true,
        data: {
          type: "about",
          ...(heading ? { heading } : {}),
          ...(subheading ? { subheading } : {}),
          ...(story ? { story } : {}),
          ...(mission ? { mission } : {}),
          ...(founderName ? { founderName } : {}),
          ...(founderRole ? { founderRole } : {}),
          ...(founderImage ? { founderImage } : {}),
          highlights,
        },
      };
    }

    case "gallery": {
      const heading = validateStringField(
        obj.heading,
        "heading",
        BLOCK_LIMITS.HEADING_MAX_LENGTH,
        issues
      );
      const subheading = validateStringField(
        obj.subheading,
        "subheading",
        BLOCK_LIMITS.SUBHEADING_MAX_LENGTH,
        issues
      );
      const rawColumns = Number(obj.columns);
      const columns =
        rawColumns === 2 || rawColumns === 4 ? rawColumns : 3;
      const layout =
        obj.layout === "masonry" || obj.layout === "carousel"
          ? obj.layout
          : "grid";

      const rawImages = Array.isArray(obj.images) ? obj.images : [];
      if (rawImages.length > BLOCK_LIMITS.MAX_ARRAY_ITEMS) {
        issues.push({
          path: "images",
          message: `Gallery block accepts at most ${BLOCK_LIMITS.MAX_ARRAY_ITEMS} images (received ${rawImages.length}).`,
        });
      }

      const images: GalleryImage[] = [];
      rawImages.slice(0, BLOCK_LIMITS.MAX_ARRAY_ITEMS).forEach((img, idx) => {
        if (!img || typeof img !== "object") {
          issues.push({
            path: `images[${idx}]`,
            message: "Gallery image must be an object.",
          });
          return;
        }
        const im = img as Record<string, unknown>;
        const src = validateUrlField(im.src, `images[${idx}].src`, issues);
        const alt = validateStringField(
          im.alt,
          `images[${idx}].alt`,
          BLOCK_LIMITS.HEADING_MAX_LENGTH,
          issues
        );
        const caption = validateStringField(
          im.caption,
          `images[${idx}].caption`,
          300,
          issues
        );

        if (src) {
          images.push({
            src,
            ...(alt ? { alt } : {}),
            ...(caption ? { caption } : {}),
          });
        }
      });

      if (issues.length > 0) {
        return {
          success: false,
          error: "Validation failed for gallery block.",
          issues,
        };
      }

      return {
        success: true,
        data: {
          type: "gallery",
          ...(heading ? { heading } : {}),
          ...(subheading ? { subheading } : {}),
          images,
          columns,
          layout,
        },
      };
    }

    case "testimonials": {
      const heading = validateStringField(
        obj.heading,
        "heading",
        BLOCK_LIMITS.HEADING_MAX_LENGTH,
        issues
      );
      const subheading = validateStringField(
        obj.subheading,
        "subheading",
        BLOCK_LIMITS.SUBHEADING_MAX_LENGTH,
        issues
      );
      const layout = obj.layout === "carousel" ? "carousel" : "grid";

      const rawItems = Array.isArray(obj.items) ? obj.items : [];
      if (rawItems.length > BLOCK_LIMITS.MAX_ARRAY_ITEMS) {
        issues.push({
          path: "items",
          message: `Testimonials block accepts at most ${BLOCK_LIMITS.MAX_ARRAY_ITEMS} items (received ${rawItems.length}).`,
        });
      }

      const items: TestimonialItem[] = [];
      rawItems.slice(0, BLOCK_LIMITS.MAX_ARRAY_ITEMS).forEach((item, idx) => {
        if (!item || typeof item !== "object") {
          issues.push({
            path: `items[${idx}]`,
            message: "Testimonial item must be an object.",
          });
          return;
        }
        const t = item as Record<string, unknown>;
        const quote = validateStringField(
          t.quote,
          `items[${idx}].quote`,
          BLOCK_LIMITS.SUBHEADING_MAX_LENGTH,
          issues,
          true
        );
        const author = validateStringField(
          t.author,
          `items[${idx}].author`,
          BLOCK_LIMITS.LABEL_MAX_LENGTH,
          issues
        );
        const role = validateStringField(
          t.role,
          `items[${idx}].role`,
          BLOCK_LIMITS.LABEL_MAX_LENGTH,
          issues
        );
        const avatar = validateUrlField(
          t.avatar,
          `items[${idx}].avatar`,
          issues
        );
        const rawRating = Number(t.rating);
        const rating =
          rawRating >= 1 && rawRating <= 5 ? Math.round(rawRating) : undefined;

        if (quote) {
          items.push({
            quote,
            ...(author ? { author } : {}),
            ...(role ? { role } : {}),
            ...(avatar ? { avatar } : {}),
            ...(rating ? { rating } : {}),
          });
        }
      });

      if (issues.length > 0) {
        return {
          success: false,
          error: "Validation failed for testimonials block.",
          issues,
        };
      }

      return {
        success: true,
        data: {
          type: "testimonials",
          ...(heading ? { heading } : {}),
          ...(subheading ? { subheading } : {}),
          items,
          layout,
        },
      };
    }

    case "contact": {
      const heading = validateStringField(
        obj.heading,
        "heading",
        BLOCK_LIMITS.HEADING_MAX_LENGTH,
        issues
      );
      const subheading = validateStringField(
        obj.subheading,
        "subheading",
        BLOCK_LIMITS.SUBHEADING_MAX_LENGTH,
        issues
      );
      const email = validateStringField(
        obj.email,
        "email",
        BLOCK_LIMITS.EMAIL_MAX_LENGTH,
        issues
      );
      const phone = validateStringField(
        obj.phone,
        "phone",
        BLOCK_LIMITS.PHONE_MAX_LENGTH,
        issues
      );
      const address = validateStringField(
        obj.address,
        "address",
        BLOCK_LIMITS.ADDRESS_MAX_LENGTH,
        issues
      );
      const hours = validateStringField(
        obj.hours,
        "hours",
        BLOCK_LIMITS.HOURS_MAX_LENGTH,
        issues
      );
      const showMap = Boolean(obj.showMap);
      const mapQuery = validateStringField(
        obj.mapQuery,
        "mapQuery",
        BLOCK_LIMITS.HEADING_MAX_LENGTH,
        issues
      );

      if (issues.length > 0) {
        return {
          success: false,
          error: "Validation failed for contact block.",
          issues,
        };
      }

      return {
        success: true,
        data: {
          type: "contact",
          ...(heading ? { heading } : {}),
          ...(subheading ? { subheading } : {}),
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
          ...(address ? { address } : {}),
          ...(hours ? { hours } : {}),
          showMap,
          ...(mapQuery ? { mapQuery } : {}),
        },
      };
    }

    case "faq": {
      const heading = validateStringField(
        obj.heading,
        "heading",
        BLOCK_LIMITS.HEADING_MAX_LENGTH,
        issues
      );
      const subheading = validateStringField(
        obj.subheading,
        "subheading",
        BLOCK_LIMITS.SUBHEADING_MAX_LENGTH,
        issues
      );

      const rawItems = Array.isArray(obj.items) ? obj.items : [];
      if (rawItems.length > BLOCK_LIMITS.MAX_ARRAY_ITEMS) {
        issues.push({
          path: "items",
          message: `FAQ block accepts at most ${BLOCK_LIMITS.MAX_ARRAY_ITEMS} items (received ${rawItems.length}).`,
        });
      }

      const items: FaqItem[] = [];
      rawItems.slice(0, BLOCK_LIMITS.MAX_ARRAY_ITEMS).forEach((item, idx) => {
        if (!item || typeof item !== "object") {
          issues.push({
            path: `items[${idx}]`,
            message: "FAQ item must be an object.",
          });
          return;
        }
        const it = item as Record<string, unknown>;
        const question = validateStringField(
          it.question,
          `items[${idx}].question`,
          300,
          issues,
          true
        );
        const answer = validateStringField(
          it.answer,
          `items[${idx}].answer`,
          BLOCK_LIMITS.BODY_TEXT_MAX_LENGTH,
          issues,
          true
        );

        if (question && answer) {
          items.push({ question, answer });
        }
      });

      if (issues.length > 0) {
        return {
          success: false,
          error: "Validation failed for faq block.",
          issues,
        };
      }

      return {
        success: true,
        data: {
          type: "faq",
          ...(heading ? { heading } : {}),
          ...(subheading ? { subheading } : {}),
          items,
        },
      };
    }

    case "events_embed": {
      const heading = validateStringField(
        obj.heading,
        "heading",
        BLOCK_LIMITS.HEADING_MAX_LENGTH,
        issues
      );
      const subheading = validateStringField(
        obj.subheading,
        "subheading",
        BLOCK_LIMITS.SUBHEADING_MAX_LENGTH,
        issues
      );
      const limit = clampEmbedLimit(obj.limit);
      const layout = obj.layout === "list" ? "list" : "grid";
      const showDrafts = Boolean(obj.showDrafts);

      const rawSelected = Array.isArray(obj.selectedEventIds)
        ? obj.selectedEventIds
        : [];
      if (rawSelected.length > BLOCK_LIMITS.MAX_ARRAY_ITEMS) {
        issues.push({
          path: "selectedEventIds",
          message: `selectedEventIds accepts at most ${BLOCK_LIMITS.MAX_ARRAY_ITEMS} IDs (received ${rawSelected.length}).`,
        });
      }

      const selectedEventIds: string[] = [];
      rawSelected
        .slice(0, BLOCK_LIMITS.MAX_ARRAY_ITEMS)
        .forEach((id, idx) => {
          const validId = validateUuidField(
            id,
            `selectedEventIds[${idx}]`,
            issues
          );
          if (validId) {
            selectedEventIds.push(validId);
          }
        });

      if (issues.length > 0) {
        return {
          success: false,
          error: "Validation failed for events_embed block.",
          issues,
        };
      }

      return {
        success: true,
        data: {
          type: "events_embed",
          ...(heading ? { heading } : {}),
          ...(subheading ? { subheading } : {}),
          limit,
          layout,
          showDrafts,
          ...(selectedEventIds.length > 0 ? { selectedEventIds } : {}),
        },
      };
    }

    case "products_embed": {
      const heading = validateStringField(
        obj.heading,
        "heading",
        BLOCK_LIMITS.HEADING_MAX_LENGTH,
        issues
      );
      const subheading = validateStringField(
        obj.subheading,
        "subheading",
        BLOCK_LIMITS.SUBHEADING_MAX_LENGTH,
        issues
      );
      const limit = clampEmbedLimit(obj.limit);
      const layout = obj.layout === "list" ? "list" : "grid";
      const showDrafts = Boolean(obj.showDrafts);

      const rawSelected = Array.isArray(obj.selectedProductIds)
        ? obj.selectedProductIds
        : [];
      if (rawSelected.length > BLOCK_LIMITS.MAX_ARRAY_ITEMS) {
        issues.push({
          path: "selectedProductIds",
          message: `selectedProductIds accepts at most ${BLOCK_LIMITS.MAX_ARRAY_ITEMS} IDs (received ${rawSelected.length}).`,
        });
      }

      const selectedProductIds: string[] = [];
      rawSelected
        .slice(0, BLOCK_LIMITS.MAX_ARRAY_ITEMS)
        .forEach((id, idx) => {
          const validId = validateUuidField(
            id,
            `selectedProductIds[${idx}]`,
            issues
          );
          if (validId) {
            selectedProductIds.push(validId);
          }
        });

      if (issues.length > 0) {
        return {
          success: false,
          error: "Validation failed for products_embed block.",
          issues,
        };
      }

      return {
        success: true,
        data: {
          type: "products_embed",
          ...(heading ? { heading } : {}),
          ...(subheading ? { subheading } : {}),
          limit,
          layout,
          showDrafts,
          ...(selectedProductIds.length > 0 ? { selectedProductIds } : {}),
        },
      };
    }

    case "fundraiser_embed": {
      const heading = validateStringField(
        obj.heading,
        "heading",
        BLOCK_LIMITS.HEADING_MAX_LENGTH,
        issues
      );
      const subheading = validateStringField(
        obj.subheading,
        "subheading",
        BLOCK_LIMITS.SUBHEADING_MAX_LENGTH,
        issues
      );
      const limit = clampEmbedLimit(obj.limit);
      const layout =
        obj.layout === "card" || obj.layout === "grid" ? obj.layout : "banner";
      const showDrafts = Boolean(obj.showDrafts);

      const rawSelected = Array.isArray(obj.selectedFundraiserIds)
        ? obj.selectedFundraiserIds
        : [];
      if (rawSelected.length > BLOCK_LIMITS.MAX_ARRAY_ITEMS) {
        issues.push({
          path: "selectedFundraiserIds",
          message: `selectedFundraiserIds accepts at most ${BLOCK_LIMITS.MAX_ARRAY_ITEMS} IDs (received ${rawSelected.length}).`,
        });
      }

      const selectedFundraiserIds: string[] = [];
      rawSelected
        .slice(0, BLOCK_LIMITS.MAX_ARRAY_ITEMS)
        .forEach((id, idx) => {
          const validId = validateUuidField(
            id,
            `selectedFundraiserIds[${idx}]`,
            issues
          );
          if (validId) {
            selectedFundraiserIds.push(validId);
          }
        });

      if (issues.length > 0) {
        return {
          success: false,
          error: "Validation failed for fundraiser_embed block.",
          issues,
        };
      }

      return {
        success: true,
        data: {
          type: "fundraiser_embed",
          ...(heading ? { heading } : {}),
          ...(subheading ? { subheading } : {}),
          limit,
          layout,
          showDrafts,
          ...(selectedFundraiserIds.length > 0
            ? { selectedFundraiserIds }
            : {}),
        },
      };
    }

    case "rich_text": {
      const rawHtml = obj.html;
      if (typeof rawHtml !== "string" || rawHtml.trim().length === 0) {
        issues.push({
          path: "html",
          message: "HTML content is required for rich_text block.",
        });
      } else if (rawHtml.length > MAX_ARTICLE_HTML_LENGTH) {
        issues.push({
          path: "html",
          message: `HTML content exceeds maximum limit of ${MAX_ARTICLE_HTML_LENGTH} characters.`,
        });
      }

      if (issues.length > 0) {
        return {
          success: false,
          error: "Validation failed for rich_text block.",
          issues,
        };
      }

      return {
        success: true,
        data: {
          type: "rich_text",
          html: String(rawHtml),
        },
      };
    }

    case "cta_banner": {
      const heading = validateStringField(
        obj.heading,
        "heading",
        BLOCK_LIMITS.HEADING_MAX_LENGTH,
        issues
      );
      const subheading = validateStringField(
        obj.subheading,
        "subheading",
        BLOCK_LIMITS.SUBHEADING_MAX_LENGTH,
        issues
      );
      const ctaLabel = validateStringField(
        obj.ctaLabel,
        "ctaLabel",
        BLOCK_LIMITS.CTA_LABEL_MAX_LENGTH,
        issues
      );
      const ctaHref = validateUrlField(obj.ctaHref, "ctaHref", issues);
      const variant =
        obj.variant === "dark" || obj.variant === "light"
          ? obj.variant
          : "brand";

      if (issues.length > 0) {
        return {
          success: false,
          error: "Validation failed for cta_banner block.",
          issues,
        };
      }

      return {
        success: true,
        data: {
          type: "cta_banner",
          ...(heading ? { heading } : {}),
          ...(subheading ? { subheading } : {}),
          ...(ctaLabel ? { ctaLabel } : {}),
          ...(ctaHref ? { ctaHref } : {}),
          variant,
        },
      };
    }

    default:
      return {
        success: false,
        error: `Unhandled block type: ${String(type)}`,
        issues: [{ path: "type", message: "Unhandled block type." }],
      };
  }
}

/**
 * Validates an array of blocks, ensuring each item complies with the schema.
 */
export function validateBlocks(rawArray: unknown): ValidationResult<Block[]> {
  if (!Array.isArray(rawArray)) {
    return {
      success: false,
      error: "Blocks payload must be an array.",
      issues: [{ path: "", message: "Expected array of blocks." }],
    };
  }

  const validatedBlocks: Block[] = [];
  const allIssues: ValidationIssue[] = [];

  rawArray.forEach((item, index) => {
    const result = validateBlock(item);
    if (!result.success) {
      result.issues.forEach((issue) => {
        allIssues.push({
          path: `[${index}].${issue.path}`.replace(/\.$/, ""),
          message: issue.message,
        });
      });
    } else {
      validatedBlocks.push(result.data);
    }
  });

  if (allIssues.length > 0) {
    return {
      success: false,
      error: `Validation failed for ${allIssues.length} issue(s) in blocks array.`,
      issues: allIssues,
    };
  }

  return {
    success: true,
    data: validatedBlocks,
  };
}

// ── 3. Graceful Fallback Parsers ──────────────────────────────────────────────

/**
 * Parses raw unknown data into a valid Block, returning null if completely invalid.
 * Cleans unsafe URLs, filters invalid UUIDs, and clamps bounds automatically without throwing errors.
 */
export function parseBlock(raw: unknown): Block | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const type = String(obj.type || "");

  if (!KNOWN_BLOCK_TYPES.includes(type as BlockType)) {
    return null;
  }

  const result = validateBlock(obj);
  if (result.success) {
    return result.data;
  }

  // Graceful fallback for rendering legacy / malformed rows
  switch (type) {
    case "hero":
      return {
        type: "hero",
        heading: typeof obj.heading === "string" ? obj.heading.slice(0, BLOCK_LIMITS.HEADING_MAX_LENGTH) : undefined,
        subheading: typeof obj.subheading === "string" ? obj.subheading.slice(0, BLOCK_LIMITS.SUBHEADING_MAX_LENGTH) : undefined,
        backgroundImage: sanitizeUrl(obj.backgroundImage) || undefined,
        backgroundColor: typeof obj.backgroundColor === "string" ? obj.backgroundColor.slice(0, 50) : undefined,
        ctaLabel: typeof obj.ctaLabel === "string" ? obj.ctaLabel.slice(0, BLOCK_LIMITS.CTA_LABEL_MAX_LENGTH) : undefined,
        ctaHref: sanitizeUrl(obj.ctaHref) || undefined,
        secondaryCtaLabel: typeof obj.secondaryCtaLabel === "string" ? obj.secondaryCtaLabel.slice(0, BLOCK_LIMITS.CTA_LABEL_MAX_LENGTH) : undefined,
        secondaryCtaHref: sanitizeUrl(obj.secondaryCtaHref) || undefined,
        align: obj.align === "left" || obj.align === "right" ? obj.align : "center",
        variant: obj.variant === "split" || obj.variant === "video_bg" ? obj.variant : "center",
        videoUrl: sanitizeUrl(obj.videoUrl) || undefined,
        badge: typeof obj.badge === "string" ? obj.badge.slice(0, 50) : undefined,
      };

    case "features":
      return {
        type: "features",
        heading: typeof obj.heading === "string" ? obj.heading.slice(0, BLOCK_LIMITS.HEADING_MAX_LENGTH) : undefined,
        subheading: typeof obj.subheading === "string" ? obj.subheading.slice(0, BLOCK_LIMITS.SUBHEADING_MAX_LENGTH) : undefined,
        columns: obj.columns === 2 || obj.columns === 4 ? obj.columns : 3,
        items: Array.isArray(obj.items)
          ? obj.items.slice(0, BLOCK_LIMITS.MAX_ARRAY_ITEMS).map((it) => ({
              title: typeof it?.title === "string" ? it.title.slice(0, BLOCK_LIMITS.LABEL_MAX_LENGTH) : "Feature",
              description: typeof it?.description === "string" ? it.description.slice(0, 500) : undefined,
              icon: typeof it?.icon === "string" ? it.icon.slice(0, 50) : undefined,
              href: sanitizeUrl(it?.href) || undefined,
            }))
          : [],
      };

    case "about":
      return {
        type: "about",
        heading: typeof obj.heading === "string" ? obj.heading.slice(0, BLOCK_LIMITS.HEADING_MAX_LENGTH) : undefined,
        subheading: typeof obj.subheading === "string" ? obj.subheading.slice(0, BLOCK_LIMITS.SUBHEADING_MAX_LENGTH) : undefined,
        story: typeof obj.story === "string" ? obj.story.slice(0, BLOCK_LIMITS.BODY_TEXT_MAX_LENGTH) : undefined,
        mission: typeof obj.mission === "string" ? obj.mission.slice(0, BLOCK_LIMITS.SUBHEADING_MAX_LENGTH) : undefined,
        founderName: typeof obj.founderName === "string" ? obj.founderName.slice(0, BLOCK_LIMITS.LABEL_MAX_LENGTH) : undefined,
        founderRole: typeof obj.founderRole === "string" ? obj.founderRole.slice(0, BLOCK_LIMITS.LABEL_MAX_LENGTH) : undefined,
        founderImage: sanitizeUrl(obj.founderImage) || undefined,
        highlights: Array.isArray(obj.highlights)
          ? obj.highlights.slice(0, BLOCK_LIMITS.MAX_ARRAY_ITEMS).map((h) => ({
              label: typeof h?.label === "string" ? h.label.slice(0, BLOCK_LIMITS.LABEL_MAX_LENGTH) : "",
              value: typeof h?.value === "string" ? h.value.slice(0, BLOCK_LIMITS.LABEL_MAX_LENGTH) : "",
              icon: typeof h?.icon === "string" ? h.icon.slice(0, 50) : undefined,
            }))
          : [],
      };

    case "gallery":
      return {
        type: "gallery",
        heading: typeof obj.heading === "string" ? obj.heading.slice(0, BLOCK_LIMITS.HEADING_MAX_LENGTH) : undefined,
        subheading: typeof obj.subheading === "string" ? obj.subheading.slice(0, BLOCK_LIMITS.SUBHEADING_MAX_LENGTH) : undefined,
        columns: obj.columns === 2 || obj.columns === 4 ? obj.columns : 3,
        layout: obj.layout === "masonry" || obj.layout === "carousel" ? obj.layout : "grid",
        images: Array.isArray(obj.images)
          ? obj.images
              .slice(0, BLOCK_LIMITS.MAX_ARRAY_ITEMS)
              .map((img) => ({
                src: sanitizeUrl(img?.src) || "",
                alt: typeof img?.alt === "string" ? img.alt.slice(0, BLOCK_LIMITS.HEADING_MAX_LENGTH) : undefined,
                caption: typeof img?.caption === "string" ? img.caption.slice(0, 300) : undefined,
              }))
              .filter((img) => Boolean(img.src))
          : [],
      };

    case "testimonials":
      return {
        type: "testimonials",
        heading: typeof obj.heading === "string" ? obj.heading.slice(0, BLOCK_LIMITS.HEADING_MAX_LENGTH) : undefined,
        subheading: typeof obj.subheading === "string" ? obj.subheading.slice(0, BLOCK_LIMITS.SUBHEADING_MAX_LENGTH) : undefined,
        layout: obj.layout === "carousel" ? "carousel" : "grid",
        items: Array.isArray(obj.items)
          ? obj.items
              .slice(0, BLOCK_LIMITS.MAX_ARRAY_ITEMS)
              .map((t) => ({
                quote: typeof t?.quote === "string" ? t.quote.slice(0, BLOCK_LIMITS.SUBHEADING_MAX_LENGTH) : "",
                author: typeof t?.author === "string" ? t.author.slice(0, BLOCK_LIMITS.LABEL_MAX_LENGTH) : undefined,
                role: typeof t?.role === "string" ? t.role.slice(0, BLOCK_LIMITS.LABEL_MAX_LENGTH) : undefined,
                avatar: sanitizeUrl(t?.avatar) || undefined,
                rating: Number(t?.rating) >= 1 && Number(t?.rating) <= 5 ? Math.round(Number(t.rating)) : undefined,
              }))
              .filter((t) => Boolean(t.quote))
          : [],
      };

    case "contact":
      return {
        type: "contact",
        heading: typeof obj.heading === "string" ? obj.heading.slice(0, BLOCK_LIMITS.HEADING_MAX_LENGTH) : undefined,
        subheading: typeof obj.subheading === "string" ? obj.subheading.slice(0, BLOCK_LIMITS.SUBHEADING_MAX_LENGTH) : undefined,
        email: typeof obj.email === "string" ? obj.email.slice(0, BLOCK_LIMITS.EMAIL_MAX_LENGTH) : undefined,
        phone: typeof obj.phone === "string" ? obj.phone.slice(0, BLOCK_LIMITS.PHONE_MAX_LENGTH) : undefined,
        address: typeof obj.address === "string" ? obj.address.slice(0, BLOCK_LIMITS.ADDRESS_MAX_LENGTH) : undefined,
        hours: typeof obj.hours === "string" ? obj.hours.slice(0, BLOCK_LIMITS.HOURS_MAX_LENGTH) : undefined,
        showMap: Boolean(obj.showMap),
        mapQuery: typeof obj.mapQuery === "string" ? obj.mapQuery.slice(0, BLOCK_LIMITS.HEADING_MAX_LENGTH) : undefined,
      };

    case "faq":
      return {
        type: "faq",
        heading: typeof obj.heading === "string" ? obj.heading.slice(0, BLOCK_LIMITS.HEADING_MAX_LENGTH) : undefined,
        subheading: typeof obj.subheading === "string" ? obj.subheading.slice(0, BLOCK_LIMITS.SUBHEADING_MAX_LENGTH) : undefined,
        items: Array.isArray(obj.items)
          ? obj.items
              .slice(0, BLOCK_LIMITS.MAX_ARRAY_ITEMS)
              .map((it) => ({
                question: typeof it?.question === "string" ? it.question.slice(0, 300) : "",
                answer: typeof it?.answer === "string" ? it.answer.slice(0, BLOCK_LIMITS.BODY_TEXT_MAX_LENGTH) : "",
              }))
              .filter((it) => Boolean(it.question && it.answer))
          : [],
      };

    case "events_embed":
      return {
        type: "events_embed",
        heading: typeof obj.heading === "string" ? obj.heading.slice(0, BLOCK_LIMITS.HEADING_MAX_LENGTH) : undefined,
        subheading: typeof obj.subheading === "string" ? obj.subheading.slice(0, BLOCK_LIMITS.SUBHEADING_MAX_LENGTH) : undefined,
        limit: clampEmbedLimit(obj.limit),
        layout: obj.layout === "list" ? "list" : "grid",
        showDrafts: Boolean(obj.showDrafts),
        selectedEventIds: Array.isArray(obj.selectedEventIds)
          ? obj.selectedEventIds
              .filter((id) => typeof id === "string" && UUID_REGEX.test(id.trim()))
              .map((id) => id.trim())
              .slice(0, BLOCK_LIMITS.MAX_ARRAY_ITEMS)
          : undefined,
      };

    case "products_embed":
      return {
        type: "products_embed",
        heading: typeof obj.heading === "string" ? obj.heading.slice(0, BLOCK_LIMITS.HEADING_MAX_LENGTH) : undefined,
        subheading: typeof obj.subheading === "string" ? obj.subheading.slice(0, BLOCK_LIMITS.SUBHEADING_MAX_LENGTH) : undefined,
        limit: clampEmbedLimit(obj.limit),
        layout: obj.layout === "list" ? "list" : "grid",
        showDrafts: Boolean(obj.showDrafts),
        selectedProductIds: Array.isArray(obj.selectedProductIds)
          ? obj.selectedProductIds
              .filter((id) => typeof id === "string" && UUID_REGEX.test(id.trim()))
              .map((id) => id.trim())
              .slice(0, BLOCK_LIMITS.MAX_ARRAY_ITEMS)
          : undefined,
      };

    case "fundraiser_embed":
      return {
        type: "fundraiser_embed",
        heading: typeof obj.heading === "string" ? obj.heading.slice(0, BLOCK_LIMITS.HEADING_MAX_LENGTH) : undefined,
        subheading: typeof obj.subheading === "string" ? obj.subheading.slice(0, BLOCK_LIMITS.SUBHEADING_MAX_LENGTH) : undefined,
        limit: clampEmbedLimit(obj.limit),
        layout: obj.layout === "card" || obj.layout === "grid" ? obj.layout : "banner",
        showDrafts: Boolean(obj.showDrafts),
        selectedFundraiserIds: Array.isArray(obj.selectedFundraiserIds)
          ? obj.selectedFundraiserIds
              .filter((id) => typeof id === "string" && UUID_REGEX.test(id.trim()))
              .map((id) => id.trim())
              .slice(0, BLOCK_LIMITS.MAX_ARRAY_ITEMS)
          : undefined,
      };

    case "rich_text":
      return {
        type: "rich_text",
        html: typeof obj.html === "string" ? obj.html.slice(0, MAX_ARTICLE_HTML_LENGTH) : "",
      };

    case "cta_banner":
      return {
        type: "cta_banner",
        heading: typeof obj.heading === "string" ? obj.heading.slice(0, BLOCK_LIMITS.HEADING_MAX_LENGTH) : undefined,
        subheading: typeof obj.subheading === "string" ? obj.subheading.slice(0, BLOCK_LIMITS.SUBHEADING_MAX_LENGTH) : undefined,
        ctaLabel: typeof obj.ctaLabel === "string" ? obj.ctaLabel.slice(0, BLOCK_LIMITS.CTA_LABEL_MAX_LENGTH) : undefined,
        ctaHref: sanitizeUrl(obj.ctaHref) || undefined,
        variant: obj.variant === "dark" || obj.variant === "light" ? obj.variant : "brand",
      };

    default:
      return null;
  }
}

/**
 * Parses an array of unknown blocks, discarding non-object or invalid entries.
 */
export function parseBlocks(rawArray: unknown): Block[] {
  if (!Array.isArray(rawArray)) return [];
  const blocks: Block[] = [];
  for (const item of rawArray) {
    const parsed = parseBlock(item);
    if (parsed) {
      blocks.push(parsed);
    }
  }
  return blocks;
}

// ── 4. Theme Tokens & Palettes ────────────────────────────────────────────────

export type ThemePreset =
  | "default"
  | "zinc_orange"
  | "dark"
  | "slate"
  | "warm_amber"
  | "forest";

export interface ThemeTokens {
  preset: ThemePreset;
  primary: string;
  primaryHover: string;
  primaryLight: string;
  background: string;
  surface: string;
  surfaceSubtle: string;
  border: string;
  borderSubtle: string;
  text: string;
  textMuted: string;
  accent: string;
}

export const THEME_PALETTES: Record<ThemePreset, ThemeTokens> = {
  default: {
    preset: "default",
    primary: "#c2410c", // Brand orange-700
    primaryHover: "#9a3412", // Orange-800
    primaryLight: "#ffedd5", // Orange-100
    background: "#ffffff",
    surface: "#fafafa", // Zinc-50
    surfaceSubtle: "#f4f4f5", // Zinc-100
    border: "#e4e4e7", // Zinc-200
    borderSubtle: "#f4f4f5",
    text: "#18181b", // Zinc-900
    textMuted: "#71717a", // Zinc-500
    accent: "#ea580c",
  },
  zinc_orange: {
    preset: "zinc_orange",
    primary: "#c2410c",
    primaryHover: "#9a3412",
    primaryLight: "#ffedd5",
    background: "#ffffff",
    surface: "#fafafa",
    surfaceSubtle: "#f4f4f5",
    border: "#e4e4e7",
    borderSubtle: "#f4f4f5",
    text: "#18181b",
    textMuted: "#71717a",
    accent: "#ea580c",
  },
  dark: {
    preset: "dark",
    primary: "#f97316", // Orange-500
    primaryHover: "#fb923c",
    primaryLight: "#431407",
    background: "#09090b", // Zinc-950
    surface: "#18181b", // Zinc-900
    surfaceSubtle: "#27272a", // Zinc-800
    border: "#27272a", // Zinc-800
    borderSubtle: "#3f3f46",
    text: "#f4f4f5", // Zinc-100
    textMuted: "#a1a1aa", // Zinc-400
    accent: "#f97316",
  },
  slate: {
    preset: "slate",
    primary: "#0f172a", // Slate-900
    primaryHover: "#334155", // Slate-700
    primaryLight: "#f1f5f9", // Slate-100
    background: "#ffffff",
    surface: "#f8fafc", // Slate-50
    surfaceSubtle: "#f1f5f9", // Slate-100
    border: "#e2e8f0", // Slate-200
    borderSubtle: "#cbd5e1",
    text: "#0f172a", // Slate-900
    textMuted: "#64748b", // Slate-500
    accent: "#3b82f6", // Blue-500
  },
  warm_amber: {
    preset: "warm_amber",
    primary: "#d97706", // Amber-600
    primaryHover: "#b45309", // Amber-700
    primaryLight: "#fef3c7", // Amber-100
    background: "#fffbeb", // Amber-50/20
    surface: "#ffffff",
    surfaceSubtle: "#fef3c7",
    border: "#fde68a", // Amber-200
    borderSubtle: "#fef3c7",
    text: "#451a03", // Amber-950
    textMuted: "#92400e", // Amber-800
    accent: "#f59e0b",
  },
  forest: {
    preset: "forest",
    primary: "#15803d", // Green-700
    primaryHover: "#166534", // Green-800
    primaryLight: "#dcfce7", // Green-100
    background: "#ffffff",
    surface: "#f0fdf4", // Green-50
    surfaceSubtle: "#dcfce7",
    border: "#bbf7d0", // Green-200
    borderSubtle: "#dcfce7",
    text: "#14532d", // Green-900
    textMuted: "#166534",
    accent: "#22c55e",
  },
};

/**
 * Resolves theme tokens for a tenant site, applying overrides for custom primary colors.
 */
export function resolveThemeTokens(
  preset?: string | null,
  customPrimaryColor?: string | null,
  darkMode?: boolean
): ThemeTokens {
  const normalizedPreset = (
    darkMode ? "dark" : preset || "default"
  ) as ThemePreset;

  const baseTokens =
    THEME_PALETTES[normalizedPreset] || THEME_PALETTES.default;

  if (customPrimaryColor && /^#[0-9a-fA-F]{6}$/.test(customPrimaryColor)) {
    return {
      ...baseTokens,
      primary: customPrimaryColor,
      primaryHover: customPrimaryColor,
      accent: customPrimaryColor,
    };
  }

  return baseTokens;
}

/**
 * Serializes ThemeTokens to CSS custom properties dictionary.
 */
export function themeTokensToStyle(tokens: ThemeTokens): Record<string, string> {
  return {
    "--site-primary": tokens.primary,
    "--site-primary-hover": tokens.primaryHover,
    "--site-primary-light": tokens.primaryLight,
    "--site-bg": tokens.background,
    "--site-surface": tokens.surface,
    "--site-surface-subtle": tokens.surfaceSubtle,
    "--site-border": tokens.border,
    "--site-border-subtle": tokens.borderSubtle,
    "--site-text": tokens.text,
    "--site-text-muted": tokens.textMuted,
    "--site-accent": tokens.accent,
  };
}
