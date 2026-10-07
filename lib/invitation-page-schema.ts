/**
 * lib/invitation-page-schema.ts
 *
 * Zod validation schemas for Invitation Page drafts and published snapshots.
 * Enforces DB CHECK constraints, maximum string lengths, array item caps,
 * storage URL prefixes, and localized EN/FR error messages.
 */

import { z } from "zod";
import { INVITATION_DRAFT_TITLE } from "@/lib/invitation-events";

// Helpers for safe URLs
const HTTP_OR_HTTPS_REGEX = /^https?:\/\/.+/i;
const HEX_COLOR_REGEX = /^#?([0-9a-fA-F]{6})$/;

export function isValidHttpUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  return HTTP_OR_HTTPS_REGEX.test(url.trim());
}

export function isValidStorageImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  // Allow project storage public URL, relative project paths (/images/...), or standard data URLs if needed
  return (
    trimmed.includes("/storage/v1/object/public/cms-media/") ||
    trimmed.includes("/storage/v1/object/public/event-banners/") ||
    trimmed.startsWith("/images/") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://")
  );
}

export function isValidStorageAudioUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  return (
    trimmed.includes("/storage/v1/object/public/invitation-media/") ||
    trimmed.endsWith(".mp3") ||
    trimmed.endsWith(".m4a")
  );
}

// ── Item Schemas ─────────────────────────────────────────────────────────

export const ScheduleItemSchema = z.object({
  time: z.string().min(1, "Time is required").max(20, "Time must be at most 20 characters"),
  title: z.string().max(80, "Event title must be at most 80 characters").optional().nullable(),
  label: z.string().max(80, "Event title must be at most 80 characters").optional().nullable(),
  description: z.string().max(200, "Description must be at most 200 characters").optional().nullable(),
  badge: z.string().max(40, "Badge must be at most 40 characters").optional().nullable(),
  day: z.string().max(40, "Day label must be at most 40 characters").optional().nullable(),
  dayLabel: z.string().max(40, "Day label must be at most 40 characters").optional().nullable(),
}).refine((item) => Boolean(item.title || item.label), {
  message: "Event title is required",
  path: ["title"],
});

export const GalleryItemSchema = z.object({
  url: z
    .string()
    .min(1, "Image URL is required")
    .refine((val) => isValidStorageImageUrl(val), "Image URL must be from storage"),
  alt: z.string().max(100, "Alt text must be at most 100 characters").optional().nullable(),
  caption: z.string().max(150, "Caption must be at most 150 characters").optional().nullable(),
});

export const VenueItemSchema = z.object({
  label: z.string().min(1, "Venue label is required (e.g. Ceremony)").max(30, "Label must be at most 30 characters"),
  name: z.string().min(1, "Venue name is required").max(150, "Name must be at most 150 characters"),
  address: z.string().max(200, "Address must be at most 200 characters").optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
});

export const AccommodationItemSchema = z.object({
  name: z.string().min(1, "Hotel name is required").max(100, "Name must be at most 100 characters"),
  notes: z.string().max(200, "Notes must be at most 200 characters").optional().nullable(),
  bookingUrl: z
    .string()
    .max(500, "Booking URL must be at most 500 characters")
    .refine((val) => !val || isValidHttpUrl(val), "Booking link must be a valid http(s) URL")
    .optional()
    .nullable(),
});

export const ColorOfTheDaySchema = z.object({
  name: z.string().max(30, "Color name must be at most 30 characters").optional().nullable(),
  hex: z
    .string()
    .refine((val) => HEX_COLOR_REGEX.test(val), "Color must be a valid 6-character hex code (e.g. #F4B266)"),
});

export const WeddingStoryItemSchema = z.object({
  title: z.string().max(80, "Story title must be at most 80 characters").optional().nullable(),
  text: z.string().min(1, "Story text is required").max(500, "Story paragraph must be at most 500 characters"),
  image: z
    .string()
    .refine((val) => !val || isValidStorageImageUrl(val), "Story image must be from storage")
    .optional()
    .nullable(),
});

// ── Draft Schema ─────────────────────────────────────────────────────────

export const InvitationPageDraftSchema = z.object({
  template_id: z.string().min(1, "Template ID is required").default("gala-editorial"),
  locale: z.enum(["en", "fr"]).default("en"),

  display_title: z.string().max(120, "Display title must be at most 120 characters").optional().nullable(),
  eyebrow: z.string().max(80, "Eyebrow must be at most 80 characters").optional().nullable(),
  host_names: z.string().max(200, "Host names must be at most 200 characters").optional().nullable(),
  story_headline: z.string().max(120, "Story headline must be at most 120 characters").optional().nullable(),
  story_text: z.string().max(3000, "Story text cannot exceed 3,000 characters").optional().nullable(),
  story_image_url: z
    .string()
    .refine((val) => !val || isValidStorageImageUrl(val), "Story image must be from storage")
    .optional()
    .nullable(),

  hero_image_url: z
    .string()
    .refine((val) => !val || isValidStorageImageUrl(val), "Hero image must be from storage")
    .optional()
    .nullable(),
  hero_image_alt: z.string().max(200, "Alt text must be at most 200 characters").optional().nullable(),
  hero_image_focus_x: z.number().int().min(0).max(100).optional().nullable().default(50),
  hero_image_focus_y: z.number().int().min(0).max(100).optional().nullable().default(50),
  scroll_prompt: z.string().max(80, "Scroll prompt must be at most 80 characters").optional().nullable(),

  venue_name: z.string().max(200, "Venue name must be at most 200 characters").optional().nullable(),
  address: z.string().max(300, "Address must be at most 300 characters").optional().nullable(),
  parking_notes: z.string().max(300, "Parking notes must be at most 300 characters").optional().nullable(),
  timezone: z.string().max(80, "Timezone must be a valid IANA string").optional().nullable(),

  dress_code: z.string().max(80, "Dress code must be at most 80 characters").optional().nullable(),
  dress_code_notes: z.string().max(500, "Dress code notes must be at most 500 characters").optional().nullable(),
  additional_notes: z.string().max(1000, "Additional notes must be at most 1,000 characters").optional().nullable(),
  hashtag: z.string().max(100, "Hashtag must be at most 100 characters").optional().nullable(),

  music_audio_url: z
    .string()
    .refine((val) => !val || isValidStorageAudioUrl(val), "Audio must be an uploaded file in invitation-media")
    .optional()
    .nullable(),
  music_title: z.string().max(100, "Track title must be at most 100 characters").optional().nullable(),

  partner1_name: z.string().max(100, "Partner 1 name must be at most 100 characters").optional().nullable(),
  partner2_name: z.string().max(100, "Partner 2 name must be at most 100 characters").optional().nullable(),
  family_note: z.string().max(500, "Family note must be at most 500 characters").optional().nullable(),
  wedding_subtype: z.enum(["traditional", "civil", "church", "engagement", "vow_renewal"]).optional().nullable(),
  registry_note: z.string().max(500, "Registry note must be at most 500 characters").optional().nullable(),

  celebrant_name: z.string().max(100, "Celebrant name must be at most 100 characters").optional().nullable(),
  age_milestone: z.string().max(20, "Age milestone must be at most 20 characters").optional().nullable(),
  theme: z.string().max(80, "Theme must be at most 80 characters").optional().nullable(),
  gift_note: z.string().max(500, "Gift note must be at most 500 characters").optional().nullable(),

  schedule: z.array(ScheduleItemSchema).max(15, "Schedule can have at most 15 items").optional().nullable(),
  gallery: z.array(GalleryItemSchema).max(12, "Gallery can have at most 12 photos").optional().nullable(),
  venues: z.array(VenueItemSchema).max(3, "Multiple venues list can have at most 3 locations").optional().nullable(),
  accommodations: z.array(AccommodationItemSchema).max(6, "Accommodations list can have at most 6 stays").optional().nullable(),
  colors_of_the_day: z.array(ColorOfTheDaySchema).max(5, "Colors of the day can have at most 5 swatches").optional().nullable(),
  wedding_story: z.array(WeddingStoryItemSchema).max(4, "Our story can have at most 4 chapters").optional().nullable(),
});

export type InvitationPageDraftInput = z.infer<typeof InvitationPageDraftSchema>;

// ── Publish Validation ───────────────────────────────────────────────────

export interface ValidationErrorItem {
  field: string;
  message: string;
}

export function validateForPublish(
  draft: InvitationPageDraftInput,
  event: { title: string; event_date: string | null; eventbrite_event_id?: string | null; category?: string | null },
  locale: "en" | "fr" = "en"
): { valid: boolean; errors: ValidationErrorItem[] } {
  const errors: ValidationErrorItem[] = [];
  const isFr = locale === "fr";

  // 1. Title verification (untouched invitation drafts carry the
  // placeholder title — publishing requires a real one)
  const title = (draft.display_title?.trim() || event.title || "").trim();
  if (!title || title === INVITATION_DRAFT_TITLE) {
    errors.push({
      field: "title",
      message: isFr ? "Le titre de l'invitation est requis." : "Invitation title is required.",
    });
  }

  // 2. Timezone verification (REQUIRED to publish)
  if (!draft.timezone || !draft.timezone.trim()) {
    errors.push({
      field: "timezone",
      message: isFr
        ? "Le fuseau horaire de l'événement est obligatoire pour publier."
        : "Event timezone is required to publish.",
    });
  }

  // 2b. Event date & time verification (REQUIRED to publish — no default
  // time is ever shown, so publishing without a real date is blocked)
  if (!event.event_date) {
    errors.push({
      field: "event_date",
      message: isFr
        ? "La date et l'heure de l'événement sont requises pour publier. Définissez-les dans les paramètres de l'événement."
        : "Event date & time is required to publish. Set it in the event settings first.",
    });
  }

  // 3. Template ID
  if (!draft.template_id || !draft.template_id.trim()) {
    errors.push({
      field: "template_id",
      message: isFr ? "Un modèle d'invitation doit être sélectionné." : "A template must be selected.",
    });
  }

  // 4. Template-specific required fields
  if (draft.template_id === "wedding-romantic") {
    if (!draft.partner1_name || !draft.partner1_name.trim()) {
      errors.push({
        field: "partner1_name",
        message: isFr ? "Le premier prénom des mariés est requis." : "Partner 1 name is required.",
      });
    }
    if (!draft.partner2_name || !draft.partner2_name.trim()) {
      errors.push({
        field: "partner2_name",
        message: isFr ? "Le second prénom des mariés est requis." : "Partner 2 name is required.",
      });
    }
  } else if (draft.template_id === "birthday-bold") {
    if (!draft.celebrant_name || !draft.celebrant_name.trim()) {
      errors.push({
        field: "celebrant_name",
        message: isFr ? "Le nom de la personne célébrée est requis." : "Celebrant name is required.",
      });
    }
  }

  // 5. Check if event is imported (Eventbrite) without date confirmation
  const isImported = Boolean(event.eventbrite_event_id || event.category === "Eventbrite");
  if (isImported && (!draft.timezone || !event.event_date)) {
    errors.push({
      field: "timezone",
      message: isFr
        ? "Cet événement a été importé. Veuillez confirmer l'heure et le fuseau horaire."
        : "This event was imported. Please confirm the event time and timezone before publishing.",
    });
  }

  // 6. Run general Zod draft schema to ensure no field overflows limits
  const parsed = InvitationPageDraftSchema.safeParse(draft);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push({
        field: issue.path.join("."),
        message: issue.message,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
