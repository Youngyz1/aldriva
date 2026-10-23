import type { InvitationPageData } from "@/types/invitation-template";
import type { InvitationPageSnapshot } from "@/lib/types/invitation-page-snapshot";
import { clsx } from "clsx";
import { cn } from "@/lib/utils";
import {
  createPageBlocksLayout,
  isRecord,
  LEGACY_INVITATION_THEME_CLASSES,
  themeForInvitationTemplate,
  type PageGlobalTheme,
  type PageBlocksLayout,
  type PageLayoutBlock,
} from "@/lib/page-composition";
import { getInvitationTemplateDefinition, type InvitationBindingPath } from "@/lib/invitation-template-registry";
import {
  InvitationBlocksLayoutSchema,
  normalizeInvitationBlocksLayout,
  type InvitationBlocksLayout,
} from "@/lib/invitation-template-schema";

export interface ThemeUtilityPreset {
  label: string;
  previewColors: readonly [string, string, string];
  page?: string;
  section?: string;
  heading?: string;
  body?: string;
}

const PALETTE_ROSE: ThemeUtilityPreset = {
    label: "Rose Garden",
    previewColors: ["#fff1f2", "#881337", "#e11d48"],
    page: "bg-rose-50 text-rose-950",
    section: "bg-transparent",
    heading: "text-rose-950",
    body: "text-rose-900",
  };
const PALETTE_EMERALD: ThemeUtilityPreset = {
    label: "Emerald Garden",
    previewColors: ["#ecfdf5", "#064e3b", "#059669"],
    page: "bg-emerald-50 text-emerald-950",
    section: "bg-transparent",
    heading: "text-emerald-950",
    body: "text-emerald-900",
  };
const PALETTE_BOTANICAL: ThemeUtilityPreset = {
  label: "Botanical Reverie",
  previewColors: ["#f4efe4", "#263b31", "#bd8583"],
  page: "bg-[#f4efe4] text-[#263b31]",
  section: "bg-transparent",
  heading: "text-[#263b31]",
  body: "text-[#53665a]",
};
const PALETTE_EVERGREEN: ThemeUtilityPreset = {
  label: "Evergreen Envelope",
  previewColors: ["#f7f5e9", "#48533a", "#a7b14b"],
  page: "bg-[#f7f5e9] text-[#48533a]",
  section: "bg-transparent",
  heading: "text-[#48533a]",
  body: "text-[#68705d]",
};
const PALETTE_OCEAN: ThemeUtilityPreset = {
    label: "Ocean Blue",
    previewColors: ["#f0f9ff", "#082f49", "#0284c7"],
    page: "bg-sky-50 text-slate-950",
    section: "bg-transparent",
    heading: "text-sky-950",
    body: "text-slate-700",
  };
const PALETTE_AMBER: ThemeUtilityPreset = {
    label: "Warm Amber",
    previewColors: ["#fffbeb", "#451a03", "#d97706"],
    page: "bg-amber-50 text-amber-950",
    section: "bg-transparent",
    heading: "text-amber-950",
    body: "text-amber-900",
  };
const PALETTE_SLATE: ThemeUtilityPreset = {
    label: "Slate Night",
    previewColors: ["#020617", "#f1f5f9", "#64748b"],
    page: "bg-slate-950 text-slate-100",
    section: "bg-transparent",
    heading: "text-slate-50",
    body: "text-slate-200",
  };
const PALETTE_DEFAULT: ThemeUtilityPreset = {
  label: "Default",
  previewColors: ["#ffffff", "#18181b", "#ea580c"],
  page: "bg-white text-zinc-950",
  section: "bg-transparent",
  heading: "text-orange-800",
  body: "text-zinc-700",
};
const PALETTE_MINIMAL: ThemeUtilityPreset = {
  label: "Minimal Clean",
  previewColors: ["#ffffff", "#18181b", "#71717a"],
  page: "bg-white text-zinc-950",
  section: "bg-transparent",
  heading: "text-zinc-950",
  body: "text-zinc-700",
};
const PALETTE_BOLD: ThemeUtilityPreset = {
  label: "Bold Electric",
  previewColors: ["#eff6ff", "#172554", "#2563eb"],
  page: "bg-blue-50 text-blue-950",
  section: "bg-transparent",
  heading: "text-blue-950",
  body: "text-slate-800",
};
const PALETTE_MIDNIGHT: ThemeUtilityPreset = {
  label: "Midnight Indigo",
  previewColors: ["#1e1b4b", "#eef2ff", "#6366f1"],
  page: "bg-indigo-950 text-indigo-50",
  section: "bg-transparent",
  heading: "text-indigo-50",
  body: "text-indigo-100",
};

/** Curated picker palettes; unknown and empty ids safely fall back to the saved theme classes. */
export const COLOR_PALETTES: Record<string, ThemeUtilityPreset> = {
  "palette-rose": PALETTE_ROSE,
  "palette-emerald": PALETTE_EMERALD,
  "palette-botanical": PALETTE_BOTANICAL,
  "palette-evergreen": PALETTE_EVERGREEN,
  "palette-ocean": PALETTE_OCEAN,
  "palette-amber": PALETTE_AMBER,
  "palette-slate": PALETTE_SLATE,
  default: PALETTE_DEFAULT,
  "palette-default": PALETTE_DEFAULT,
  minimal: PALETTE_MINIMAL,
  "palette-minimal": PALETTE_MINIMAL,
  bold: PALETTE_BOLD,
  "palette-bold": PALETTE_BOLD,
  warm: PALETTE_AMBER,
  "palette-warm": PALETTE_AMBER,
  forest: PALETTE_EMERALD,
  "palette-forest": PALETTE_EMERALD,
  midnight: PALETTE_MIDNIGHT,
  "palette-midnight": PALETTE_MIDNIGHT,
};

export interface ThemeFontPack {
  label: string;
  heading: string;
  body: string;
  accent?: string;
}

/** Font pairings exposed by the typography pack picker. */
export const FONT_PACKS: Record<string, ThemeFontPack> = {
  "font-serif-classic": { label: "Serif Elegant", heading: "font-serif", body: "font-serif" },
  "font-serif-editorial": { label: "Editorial Serif", heading: "font-serif font-medium", body: "font-serif" },
  "font-script": { label: "Evergreen Script Accent", heading: "font-serif font-medium", body: "font-serif", accent: "font-script" },
  "font-sans-bold": { label: "Modern Bold", heading: "font-sans font-extrabold", body: "font-sans" },
  "font-sans-clean": { label: "Clean Sans", heading: "font-sans font-semibold", body: "font-sans" },
  "font-mono-editorial": { label: "Editorial Mono", heading: "font-mono font-bold", body: "font-mono" },
  // Font Family select aliases from the existing Website settings panel.
  serif: { label: "Serif", heading: "font-serif", body: "font-serif" },
  sans: { label: "Sans", heading: "font-sans font-semibold", body: "font-sans" },
  mono: { label: "Monospace", heading: "font-mono font-bold", body: "font-mono" },
};

/** Applies known presets while preserving unrelated authored theme utilities. */
export function compilePageGlobalTheme(theme: PageGlobalTheme): PageGlobalTheme {
  const palette = theme.palette_id ? COLOR_PALETTES[theme.palette_id] : undefined;
  const fontPack = theme.font_pack_id ? FONT_PACKS[theme.font_pack_id] : undefined;
  const compiledPageClass = clsx(palette?.page, fontPack?.body, theme.classes.page);
  const rawScale = theme.text_scale;
  const textScale = typeof rawScale === "number" && Number.isFinite(rawScale)
    ? Math.min(1.4, Math.max(0.8, rawScale))
    : 1.0;

  return {
    ...theme,
    text_scale: textScale,
    classes: {
      ...theme.classes,
      page: cn(compiledPageClass, palette?.page, fontPack?.body),
      section: cn(clsx(theme.classes.section, palette?.section)),
      heading: cn(clsx(theme.classes.heading, palette?.heading, fontPack?.heading), palette?.heading, fontPack?.heading),
      body: cn(clsx(theme.classes.body, palette?.body, fontPack?.body), palette?.body, fontPack?.body),
    },
  };
}

export function compilePageBlocksLayoutTheme<T extends PageBlocksLayout>(layout: T): T {
  return { ...layout, global_theme: compilePageGlobalTheme(layout.global_theme) };
}

type BindingValue = { $bind: InvitationBindingPath };

const bind = (path: InvitationBindingPath): BindingValue => ({ $bind: path });

/**
 * Converts old flat invitation content into the common block envelope.
 * Values use an explicit path allowlist rather than arbitrary path evaluation.
 */
export function legacyInvitationTemplateToLayout(
  templateId: string,
  savedLayout?: unknown
): InvitationBlocksLayout {
  const templateDefinition = getInvitationTemplateDefinition(templateId);
  const hasSavedEffects = isRecord(savedLayout) && Array.isArray(savedLayout.effects);
  const isRomanticEnvelope = templateDefinition?.composition === "romantic-envelope"
    || templateDefinition?.composition === "botanical-reverie"
    || templateDefinition?.composition === "evergreen-envelope";
  const isEvergreen = templateDefinition?.composition === "evergreen-envelope";
  const blockCatalog: PageLayoutBlock[] = [
    { id: "romantic-envelope-entry", type: "interactive_envelope", content: { enabled: true, transitionDurationMs: 1000 } },
    {
      id: "invitation-hero",
      type: isRomanticEnvelope ? "romantic_hero" : "hero",
      content: {
        eyebrow: bind("eyebrow"), title: bind("title"), subtitle: bind("hostNames"), image: bind("heroImage"),
        imageAlt: bind("heroImageAlt"), imageFocus: bind("heroImageFocus"), scrollPrompt: bind("scrollPrompt"),
      },
    },
    {
      id: "invitation-story", type: "story",
      content: { heading: bind("storyHeadline"), text: bind("storyText"), image: bind("storyImage"), moments: bind("weddingStory") },
    },
    {
      id: "invitation-details", type: "details",
      content: {
        title: bind("title"), eventDate: bind("eventDate"), timezone: bind("timezone"), venue: bind("venue"),
        address: bind("address"), city: bind("city"), parkingNotes: bind("parkingNotes"), dressCode: bind("dressCode"),
        dressCodeNotes: bind("dressCodeNotes"), additionalNotes: bind("additionalNotes"), venues: bind("venues"),
        accommodations: bind("accommodations"), partner1Name: bind("partner1Name"), partner2Name: bind("partner2Name"),
        familyNote: bind("familyNote"), weddingSubtype: bind("weddingSubtype"), colorsOfTheDay: bind("colorsOfTheDay"),
        parentsLine: bind("parents_line"), dressCodeSwatches: bind("dress_code_swatches"),
        adultsOnlyNote: bind("adults_only_note"), monogramInitials: bind("monogram_initials"),
        albumUrl: bind("album_url"), showWishingWell: bind("show_wishing_well"), showAdultsOnly: bind("show_adults_only"),
        registryNote: bind("registryNote"), celebrantName: bind("celebrantName"), ageMilestone: bind("ageMilestone"),
        theme: bind("theme"), giftNote: bind("giftNote"), hashtag: bind("hashtag"),
      },
    },
    { id: "invitation-countdown", type: "countdown", content: { targetDate: bind("eventDate") } },
    {
      id: "invitation-location-map", type: "location_map",
      content: { latitude: bind("latitude"), longitude: bind("longitude"), venue: bind("venue"), address: bind("address"), city: bind("city") },
    },
    { id: "invitation-schedule", type: "schedule", content: { timeline: bind("schedule") } },
    { id: "invitation-gallery", type: "gallery", content: {
      images: bind("gallery"),
      envelopePhoto: bind("envelope_photo_url"), coverPhoto: bind("cover_photo_url"),
      envelopePhotoTwo: bind("envelope_photo_two_url"),
      polaroidPhotoOne: bind("polaroid_photo_one_url"), polaroidPhotoTwo: bind("polaroid_photo_two_url"),
      storyPhotoOne: bind("story_photo_one_url"), storyPhotoTwo: bind("story_photo_two_url"),
      closingPhoto: bind("closing_photo_url"), rsvpPhoto: bind("rsvp_photo_url"),
      photoFocalPoints: bind("photo_focal_points"),
    } },
    { id: "invitation-music", type: "music", content: { audioUrl: bind("musicAudioUrl"), title: bind("musicTitle"), links: bind("musicLinks") } },
    {
      id: "invitation-action-portal", type: "action_portal",
      content: {
        actionType: "RSVP_SUBMISSION", guestName: bind("guest.name"), rsvpStatus: bind("guest.rsvpStatus"),
        seatLabel: bind("seat.label"), qrCode: bind("ticketInstance.qrCode"),
      },
    },
  ];
  const defaultBlockTypes = templateDefinition?.defaultBlockTypes ?? [
    "hero", "story", "details", "location_map", "schedule", "gallery", "music", "action_portal",
  ];
  const blocksByType = new Map<string, PageLayoutBlock>(blockCatalog.map((block) => [block.type, block]));
  const layoutBlocks = defaultBlockTypes
    .map((type) => blocksByType.get(type))
    .filter((block): block is PageLayoutBlock => Boolean(block));

  const normalizedSavedLayout = normalizeInvitationBlocksLayout(savedLayout);
  if (!normalizedSavedLayout) {
    return InvitationBlocksLayoutSchema.parse({
      ...createPageBlocksLayout(layoutBlocks, themeForInvitationTemplate(templateId)),
      effects: templateDefinition?.defaultEffects ?? [],
    });
  }

  const legacyTheme = LEGACY_INVITATION_THEME_CLASSES[templateId];
  if (!templateDefinition) return normalizedSavedLayout;

  const envelopeGate = layoutBlocks.find((block) => block.type === "interactive_envelope");
  const savedBlocks = normalizedSavedLayout.layout_blocks.map((block) => {
    if (block.type === "romantic_envelope_gate") return { ...block, type: "interactive_envelope" };
    if (isRomanticEnvelope && block.type === "hero") return { ...block, type: "romantic_hero" };
    return block;
  });
  const savedEnvelopeGate = savedBlocks.find((block) => block.type === "interactive_envelope");
  const countdownBlock = layoutBlocks.find((block) => block.type === "countdown");
  const locationMapBlock = layoutBlocks.find((block) => block.type === "location_map");
  const requiredTypes = templateDefinition?.requiredBlockTypes ?? [];
  const requiredTypeSet = new Set<string>(requiredTypes);
  const authoredBlocks = isEvergreen
    ? (() => {
        const defaultsByType = new Map(layoutBlocks.map((block) => [block.type, block]));
        const savedByType = new Map(savedBlocks.map((block) => [block.type, block]));
        const canonicalTypes = new Set<string>(templateDefinition.defaultBlockTypes);
        const canonicalBlocks = templateDefinition.defaultBlockTypes
          .map((type) => savedByType.get(type) ?? defaultsByType.get(type))
          .filter((block): block is PageLayoutBlock => Boolean(block));
        const additionalSupportedBlocks = savedBlocks.filter((block) =>
          templateDefinition.supportedBlockTypes.includes(block.type as never) && !canonicalTypes.has(block.type)
        );
        return [...canonicalBlocks, ...additionalSupportedBlocks];
      })()
    : isRomanticEnvelope
    ? (() => {
        const defaultsByType = new Map(layoutBlocks.map((block) => [block.type, block]));
        const savedByType = new Map(savedBlocks.map((block) => [block.type, block]));
        const requiredBlocks = requiredTypes
          .map((type) => savedByType.get(type) ?? defaultsByType.get(type))
          .filter((block): block is PageLayoutBlock => Boolean(block));
        const optionalBlocks = savedBlocks.filter((block) =>
          block.type !== "romantic_envelope_gate" && !requiredTypeSet.has(block.type)
        );
        return [
          ...(savedEnvelopeGate || envelopeGate ? [savedEnvelopeGate ?? envelopeGate!] : []),
          ...requiredBlocks.filter((block) => block.type !== "interactive_envelope"),
          ...optionalBlocks,
        ];
      })()
    : requiredTypes.includes("countdown") && countdownBlock && !savedBlocks.some((block) => block.type === "countdown")
      ? (() => {
          const detailsIndex = savedBlocks.findIndex((block) => block.type === "details");
          const heroIndex = savedBlocks.findIndex((block) => block.type === "hero");
          const insertAt = detailsIndex >= 0 ? detailsIndex + 1 : heroIndex >= 0 ? heroIndex + 1 : 0;
          return [...savedBlocks.slice(0, insertAt), countdownBlock, ...savedBlocks.slice(insertAt)];
        })()
      : savedBlocks;
  const compatibleBlocks = authoredBlocks;

  // Older saved snapshots may already contain a valid layout with generic
  // preset classes. Keep their authored blocks, but restore the template's
  // original premium presentation theme.
  return InvitationBlocksLayoutSchema.parse({
    ...normalizedSavedLayout,
    layout_blocks: isEvergreen || compatibleBlocks.some((block) => block.type === "location_map") || !locationMapBlock
      ? compatibleBlocks
      : [...compatibleBlocks, locationMapBlock],
    global_theme: legacyTheme
      ? {
          ...normalizedSavedLayout.global_theme,
          classes: {
            ...normalizedSavedLayout.global_theme.classes,
            ...legacyTheme,
          },
        }
      : normalizedSavedLayout.global_theme,
    effects: hasSavedEffects ? normalizedSavedLayout.effects ?? [] : templateDefinition.defaultEffects,
  });
}

export function legacyInvitationSnapshotToLayout(snapshot: InvitationPageSnapshot): InvitationBlocksLayout {
  return legacyInvitationTemplateToLayout(snapshot.template_id, snapshot.blocks_layout);
}

const BINDING_READERS: Record<InvitationBindingPath, (data: InvitationPageData) => unknown> = {
  title: (data) => data.title,
  eventDate: (data) => data.eventDate,
  timezone: (data) => data.timezone,
  locale: (data) => data.locale,
  eyebrow: (data) => data.eyebrow,
  hostNames: (data) => data.hostNames,
  heroImage: (data) => data.heroImage,
  heroImageFocus: (data) => data.heroImageFocus,
  heroImageAlt: (data) => data.heroImageAlt,
  scrollPrompt: (data) => data.scrollPrompt,
  storyHeadline: (data) => data.storyHeadline,
  storyText: (data) => data.storyText,
  storyImage: (data) => data.storyImage,
  venue: (data) => data.venue,
  address: (data) => data.address,
  city: (data) => data.city,
  endDate: (data) => data.endDate,
  latitude: (data) => data.latitude,
  longitude: (data) => data.longitude,
  parkingNotes: (data) => data.parkingNotes,
  venues: (data) => data.venues,
  schedule: (data) => data.schedule,
  gallery: (data) => data.gallery,
  dressCode: (data) => data.dressCode,
  dressCodeNotes: (data) => data.dressCodeNotes,
  accommodations: (data) => data.accommodations,
  additionalNotes: (data) => data.additionalNotes,
  musicAudioUrl: (data) => data.musicAudioUrl,
  musicTitle: (data) => data.musicTitle,
  musicLinks: (data) => data.musicLinks,
  partner1Name: (data) => data.partner1Name,
  partner2Name: (data) => data.partner2Name,
  familyNote: (data) => data.familyNote,
  weddingSubtype: (data) => data.weddingSubtype,
  colorsOfTheDay: (data) => data.colorsOfTheDay,
  registryNote: (data) => data.registryNote,
  weddingStory: (data) => data.weddingStory,
  celebrantName: (data) => data.celebrantName,
  ageMilestone: (data) => data.ageMilestone,
  theme: (data) => data.theme,
  giftNote: (data) => data.giftNote,
  hashtag: (data) => data.hashtag,
  parents_line: (data) => data.parentsLine,
  dress_code_swatches: (data) => data.dressCodeSwatches,
  adults_only_note: (data) => data.adultsOnlyNote,
  monogram_initials: (data) => data.monogramInitials,
  album_url: (data) => data.albumUrl,
  show_wishing_well: (data) => data.showWishingWell,
  show_adults_only: (data) => data.showAdultsOnly,
  envelope_photo_url: (data) => data.envelopePhoto,
  envelope_photo_two_url: (data) => data.envelopePhotoTwo,
  cover_photo_url: (data) => data.coverPhoto,
  polaroid_photo_one_url: (data) => data.polaroidPhotoOne,
  polaroid_photo_two_url: (data) => data.polaroidPhotoTwo,
  story_photo_one_url: (data) => data.storyPhotoOne,
  story_photo_two_url: (data) => data.storyPhotoTwo,
  closing_photo_url: (data) => data.closingPhoto,
  rsvp_photo_url: (data) => data.rsvpPhoto,
  photo_focal_points: (data) => data.photoFocalPoints,
  "guest.name": (data) => data.guest.name,
  "guest.title": (data) => data.guest.title,
  "guest.organization": (data) => data.guest.organization,
  "guest.rsvpStatus": (data) => data.guest.rsvpStatus,
  "guest.rsvpAt": (data) => data.guest.rsvpAt,
  "guest.isVip": (data) => data.guest.isVip,
  "seat.label": (data) => data.seat?.label,
  "seat.tableNumber": (data) => data.seat?.tableNumber,
  "seat.tableName": (data) => data.seat?.tableName,
  "seat.isVip": (data) => data.seat?.isVip,
  "ticketInstance.qrCode": (data) => data.ticketInstance?.qrCode,
  "ticketInstance.status": (data) => data.ticketInstance?.status,
  "ticketInstance.checkedInAt": (data) => data.ticketInstance?.checkedInAt,
  token: (data) => data.token,
};

/** Resolve { "$bind": "title" } objects without evaluating arbitrary paths. */
export function resolveInvitationBindings(value: unknown, data: InvitationPageData): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveInvitationBindings(item, data));
  if (!isRecord(value)) return value;

  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === "$bind" && typeof value.$bind === "string") {
    const reader = BINDING_READERS[value.$bind as InvitationBindingPath];
    return reader ? reader(data) : undefined;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, resolveInvitationBindings(child, data)])
  );
}
