/** Invitation-only validation layered over the shared business/page envelope. */
import { z } from "zod";
import { isRecord, PageBlocksLayoutSchema } from "@/lib/page-composition";
import { isValidCmsMediaPublicImageUrl } from "@/lib/invitation-image-url";
import {
  INVITATION_DETAILS_PRESENTATIONS,
  INVITATION_BINDING_PATHS,
  INVITATION_BLOCK_TYPES,
  INVITATION_EFFECT_TYPES,
  type InvitationEffectConfig,
  type InvitationBindingPath,
  type InvitationDetailsPresentation,
  getInvitationTemplateDefinition,
} from "@/lib/invitation-template-registry";

/** Configuration envelope version for invitation microsite layouts. */
export const INVITATION_TEMPLATE_CONFIGURATION_VERSION = 1 as const;

/** Runtime validation for code-owned presentation variants used by the block renderer. */
export const InvitationDetailsPresentationSchema = z.enum(INVITATION_DETAILS_PRESENTATIONS);

export function invitationDetailsPresentationForTemplate(templateId: string): InvitationDetailsPresentation {
  const configured = getInvitationTemplateDefinition(templateId)?.detailsPresentation ?? "editorial";
  return InvitationDetailsPresentationSchema.parse(configured);
}

const LEGACY_INVITATION_BLOCK_TYPES = ["romantic_envelope_gate"] as const;
const ALL_INVITATION_BLOCK_TYPES = [...INVITATION_BLOCK_TYPES, ...LEGACY_INVITATION_BLOCK_TYPES] as const;
const bindingPathSet = new Set<string>(INVITATION_BINDING_PATHS);
const forbiddenObjectKeys = new Set(["__proto__", "prototype", "constructor"]);

function isInvitationBindingPath(value: string): value is InvitationBindingPath {
  return bindingPathSet.has(value);
}

const InvitationBlockContentSchema = z.record(z.string(), z.unknown()).superRefine((content, ctx) => {
  let visitedNodes = 0;

  function validateValue(value: unknown, path: (string | number)[], depth: number): void {
    visitedNodes += 1;
    if (visitedNodes > 3000) {
      ctx.addIssue({ code: "custom", path, message: "Invitation block content is too large." });
      return;
    }
    if (depth > 16) {
      ctx.addIssue({ code: "custom", path, message: "Invitation block content is nested too deeply." });
      return;
    }
    if (typeof value === "string" && value.length > 5000) {
      ctx.addIssue({ code: "custom", path, message: "Invitation block text is too long." });
      return;
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      ctx.addIssue({ code: "custom", path, message: "Invitation block numbers must be finite." });
      return;
    }
    if (Array.isArray(value)) {
      if (value.length > 120) {
        ctx.addIssue({ code: "custom", path, message: "Invitation block arrays are limited to 120 items." });
        return;
      }
      value.forEach((item, index) => validateValue(item, [...path, index], depth + 1));
      return;
    }
    if (!isRecord(value)) return;

    const keys = Object.keys(value);
    if (Object.prototype.hasOwnProperty.call(value, "$bind")) {
      if (keys.length !== 1 || typeof value.$bind !== "string" || !isInvitationBindingPath(value.$bind)) {
        ctx.addIssue({
          code: "custom",
          path,
          message: "Bindings must use one of the declared invitation data paths.",
        });
      }
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (forbiddenObjectKeys.has(key)) {
        ctx.addIssue({ code: "custom", path: [...path, key], message: "Unsafe object key in invitation layout." });
        continue;
      }
      validateValue(child, [...path, key], depth + 1);
    }
  }

  validateValue(content, [], 0);
});

const InvitationBlockSchema = z.object({
  id: z.string().min(1).max(120),
  type: z.enum(ALL_INVITATION_BLOCK_TYPES),
  content: InvitationBlockContentSchema,
}).strict();

const InvitationEffectSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("envelope-reveal"),
    enabled: z.boolean(),
    transitionDurationMs: z.number().int().min(0).max(3000),
  }).strict(),
  z.object({
    type: z.literal("scroll-reveal"),
    enabled: z.boolean(),
    durationMs: z.number().int().min(0).max(1600),
  }).strict(),
  z.object({
    type: z.literal("falling-petals"),
    enabled: z.boolean(),
    density: z.number().int().min(1).max(12),
  }).strict(),
]);

const CmsMediaPhotoSchema = z.string().max(1200).refine(
  isValidCmsMediaPublicImageUrl,
  "Evergreen photos must use an HTTPS public cms-media URL.",
).nullable().optional();

const FocalPointSchema = z.object({
  x: z.number().int().min(0).max(100),
  y: z.number().int().min(0).max(100),
}).strict();

const EvergreenEnvelopeTemplateDataSchema = z.object({
  show_gate: z.boolean().optional(),
  show_cover: z.boolean().optional(),
  show_invitation_card: z.boolean().optional(),
  show_countdown_photos: z.boolean().optional(),
  show_venues: z.boolean().optional(),
  show_schedule: z.boolean().optional(),
  show_dress_code: z.boolean().optional(),
  show_story: z.boolean().optional(),
  show_accommodations_photos: z.boolean().optional(),
  show_closing_photo: z.boolean().optional(),
  show_rsvp: z.boolean().optional(),
  show_location_map: z.boolean().optional(),
  gate_intro: z.string().max(200).nullable().optional(),
  gate_heading: z.string().max(100).nullable().optional(),
  envelope_card_one_type: z.enum(["photo", "text"]).optional(),
  envelope_card_two_type: z.enum(["photo", "text"]).optional(),
  envelope_card_one_title: z.string().max(100).nullable().optional(),
  envelope_card_one_body: z.string().max(300).nullable().optional(),
  envelope_card_two_title: z.string().max(100).nullable().optional(),
  envelope_card_two_body: z.string().max(300).nullable().optional(),
  invitation_line: z.string().max(200).nullable().optional(),
  venues_heading: z.string().max(100).nullable().optional(),
  wishing_well_note: z.string().max(500).nullable().optional(),
  story_forever_word: z.string().max(40).nullable().optional(),
  closing_caption: z.string().max(200).nullable().optional(),
  rsvp_intro: z.string().max(500).nullable().optional(),
  rsvp_deadline: z.string().max(80).nullable().optional(),
  parents_line: z.string().max(200).nullable().optional(),
  dress_code_swatches: z.array(z.object({
    name: z.string().max(30).nullable().optional(),
    hex: z.string().regex(/^#?[0-9a-fA-F]{6}$/),
  }).strict()).max(5).nullable().optional(),
  adults_only_note: z.string().max(300).nullable().optional(),
  monogram_initials: z.string().max(8).nullable().optional(),
  album_url: z.string().max(500).url().nullable().optional(),
  show_wishing_well: z.boolean().optional(),
  show_adults_only: z.boolean().optional(),
  envelope_photo_url: CmsMediaPhotoSchema,
  envelope_photo_two_url: CmsMediaPhotoSchema,
  cover_photo_url: CmsMediaPhotoSchema,
  polaroid_photo_one_url: CmsMediaPhotoSchema,
  polaroid_photo_two_url: CmsMediaPhotoSchema,
  story_photo_one_url: CmsMediaPhotoSchema,
  story_photo_two_url: CmsMediaPhotoSchema,
  closing_photo_url: CmsMediaPhotoSchema,
  rsvp_photo_url: CmsMediaPhotoSchema,
  photo_focal_points: z.object({
    envelope_photo_url: FocalPointSchema.optional(),
    envelope_photo_two_url: FocalPointSchema.optional(),
    cover_photo_url: FocalPointSchema.optional(),
    polaroid_photo_one_url: FocalPointSchema.optional(),
    polaroid_photo_two_url: FocalPointSchema.optional(),
    story_photo_one_url: FocalPointSchema.optional(),
    story_photo_two_url: FocalPointSchema.optional(),
    closing_photo_url: FocalPointSchema.optional(),
    rsvp_photo_url: FocalPointSchema.optional(),
  }).strict().nullable().optional(),
}).strict();

/**
 * Versioned JSON configuration accepted for invitation pages. The generic
 * PageBlocksLayoutSchema remains broader for business-site block adapters.
 */
export const InvitationBlocksLayoutSchema = PageBlocksLayoutSchema
  .extend({
    layout_blocks: z.array(InvitationBlockSchema).max(120),
    effects: z.array(InvitationEffectSchema).max(INVITATION_EFFECT_TYPES.length).optional(),
    template_data: EvergreenEnvelopeTemplateDataSchema.optional(),
  })
  .superRefine((layout, ctx) => {
    const effectTypes = new Set<string>();
    layout.effects?.forEach((effect, index) => {
      if (effectTypes.has(effect.type)) {
        ctx.addIssue({ code: "custom", path: ["effects", index, "type"], message: "Invitation effects must be unique." });
      }
      effectTypes.add(effect.type);
    });

    const ids = new Set<string>();
    layout.layout_blocks.forEach((block, index) => {
      if (ids.has(block.id)) {
        ctx.addIssue({ code: "custom", path: ["layout_blocks", index, "id"], message: "Block IDs must be unique." });
      }
      ids.add(block.id);
      if (block.type === "action_portal" && block.content.actionType !== "RSVP_SUBMISSION") {
        ctx.addIssue({
          code: "custom",
          path: ["layout_blocks", index, "content", "actionType"],
          message: "Invitation action blocks can only submit an RSVP.",
        });
      }
      if (block.type === "interactive_envelope") {
        if (block.content.enabled !== undefined && typeof block.content.enabled !== "boolean") {
          ctx.addIssue({
            code: "custom",
            path: ["layout_blocks", index, "content", "enabled"],
            message: "Envelope reveal enabled must be a boolean.",
          });
        }
        const duration = block.content.transitionDurationMs;
        if (duration !== undefined && (typeof duration !== "number" || !Number.isInteger(duration) || duration < 0 || duration > 3000)) {
          ctx.addIssue({
            code: "custom",
            path: ["layout_blocks", index, "content", "transitionDurationMs"],
            message: "Envelope reveal transition must be between 0 and 3000 milliseconds.",
          });
        }
      }
    });
  });

export type InvitationBlocksLayout = z.infer<typeof InvitationBlocksLayoutSchema>;
export type InvitationEffect = InvitationEffectConfig;

export function normalizeInvitationBlocksLayout(value: unknown): InvitationBlocksLayout | null {
  const parsed = InvitationBlocksLayoutSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

