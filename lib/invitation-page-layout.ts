import type { InvitationPageData } from "@/types/invitation-template";
import type { InvitationPageSnapshot } from "@/lib/types/invitation-page-snapshot";
import { clsx } from "clsx";
import { cn } from "@/lib/utils";
import {
  createPageBlocksLayout,
  isRecord,
  LEGACY_INVITATION_THEME_CLASSES,
  normalizePageBlocksLayout,
  themeForInvitationTemplate,
  type PageGlobalTheme,
  type PageBlocksLayout,
  type PageLayoutBlock,
} from "@/lib/page-composition";

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
}

/** Font pairings exposed by the typography pack picker. */
export const FONT_PACKS: Record<string, ThemeFontPack> = {
  "font-serif-classic": { label: "Serif Elegant", heading: "font-serif", body: "font-serif" },
  "font-serif-editorial": { label: "Editorial Serif", heading: "font-serif font-medium", body: "font-serif" },
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

export function compilePageBlocksLayoutTheme(layout: PageBlocksLayout): PageBlocksLayout {
  return { ...layout, global_theme: compilePageGlobalTheme(layout.global_theme) };
}

type InvitationBindingPath =
  | "title"
  | "eventDate"
  | "timezone"
  | "locale"
  | "eyebrow"
  | "hostNames"
  | "heroImage"
  | "heroImageFocus"
  | "heroImageAlt"
  | "scrollPrompt"
  | "storyHeadline"
  | "storyText"
  | "storyImage"
  | "venue"
  | "address"
  | "city"
  | "endDate"
  | "latitude"
  | "longitude"
  | "parkingNotes"
  | "venues"
  | "schedule"
  | "gallery"
  | "dressCode"
  | "dressCodeNotes"
  | "accommodations"
  | "additionalNotes"
  | "musicAudioUrl"
  | "musicTitle"
  | "musicLinks"
  | "partner1Name"
  | "partner2Name"
  | "familyNote"
  | "weddingSubtype"
  | "colorsOfTheDay"
  | "registryNote"
  | "weddingStory"
  | "celebrantName"
  | "ageMilestone"
  | "theme"
  | "giftNote"
  | "hashtag"
  | "guest.name"
  | "guest.title"
  | "guest.organization"
  | "guest.rsvpStatus"
  | "guest.rsvpAt"
  | "guest.isVip"
  | "seat.label"
  | "seat.tableNumber"
  | "seat.tableName"
  | "seat.isVip"
  | "ticketInstance.qrCode"
  | "ticketInstance.status"
  | "ticketInstance.checkedInAt"
  | "token";

type BindingValue = { $bind: InvitationBindingPath };

const bind = (path: InvitationBindingPath): BindingValue => ({ $bind: path });
const COUNTDOWN_TEMPLATE_IDS = new Set(["wedding-romantic", "gala-editorial", "black-tie", "birthday-bold", "romantic-envelope"]);

/**
 * Converts old flat invitation content into the common block envelope.
 * Values use an explicit path allowlist rather than arbitrary path evaluation.
 */
export function legacyInvitationTemplateToLayout(
  templateId: string,
  savedLayout?: unknown
): PageBlocksLayout {
  const layoutBlocks: PageLayoutBlock[] = [
    ...(templateId === "romantic-envelope"
      ? [{ id: "romantic-envelope-entry", type: "interactive_envelope", content: {} }]
      : []),
    {
      id: "invitation-hero",
      type: templateId === "romantic-envelope" ? "romantic_hero" : "hero",
      content: {
        eyebrow: bind("eyebrow"),
        title: bind("title"),
        subtitle: bind("hostNames"),
        image: bind("heroImage"),
        imageAlt: bind("heroImageAlt"),
        imageFocus: bind("heroImageFocus"),
        scrollPrompt: bind("scrollPrompt"),
      },
    },
    {
      id: "invitation-story",
      type: "story",
      content: {
        heading: bind("storyHeadline"),
        text: bind("storyText"),
        image: bind("storyImage"),
        moments: bind("weddingStory"),
      },
    },
    {
      id: "invitation-details",
      type: "details",
      content: {
        title: bind("title"),
        eventDate: bind("eventDate"),
        timezone: bind("timezone"),
        venue: bind("venue"),
        address: bind("address"),
        city: bind("city"),
        parkingNotes: bind("parkingNotes"),
        dressCode: bind("dressCode"),
        dressCodeNotes: bind("dressCodeNotes"),
        additionalNotes: bind("additionalNotes"),
        venues: bind("venues"),
        accommodations: bind("accommodations"),
        partner1Name: bind("partner1Name"),
        partner2Name: bind("partner2Name"),
        familyNote: bind("familyNote"),
        weddingSubtype: bind("weddingSubtype"),
        colorsOfTheDay: bind("colorsOfTheDay"),
        registryNote: bind("registryNote"),
        celebrantName: bind("celebrantName"),
        ageMilestone: bind("ageMilestone"),
        theme: bind("theme"),
        giftNote: bind("giftNote"),
        hashtag: bind("hashtag"),
      },
    },
    ...(COUNTDOWN_TEMPLATE_IDS.has(templateId)
      ? [{
          id: "invitation-countdown",
          type: "countdown",
          content: { targetDate: bind("eventDate") },
        }]
      : []),
    {
      id: "invitation-location-map",
      type: "location_map",
      content: {
        latitude: bind("latitude"),
        longitude: bind("longitude"),
        venue: bind("venue"),
        address: bind("address"),
        city: bind("city"),
      },
    },
    {
      id: "invitation-schedule",
      type: "schedule",
      content: { timeline: bind("schedule") },
    },
    {
      id: "invitation-gallery",
      type: "gallery",
      content: { images: bind("gallery") },
    },
    {
      id: "invitation-music",
      type: "music",
      content: {
        audioUrl: bind("musicAudioUrl"),
        title: bind("musicTitle"),
        links: bind("musicLinks"),
      },
    },
    {
      id: "invitation-action-portal",
      type: "action_portal",
      content: {
        actionType: "RSVP_SUBMISSION",
        guestName: bind("guest.name"),
        rsvpStatus: bind("guest.rsvpStatus"),
        seatLabel: bind("seat.label"),
        qrCode: bind("ticketInstance.qrCode"),
      },
    },
  ];

  if (templateId === "romantic-envelope") {
    const requiredTypes = ["interactive_envelope", "romantic_hero", "countdown", "story", "schedule", "location_map"];
    const requiredBlocks = requiredTypes
      .map((type) => layoutBlocks.find((block) => block.type === type))
      .filter((block): block is PageLayoutBlock => Boolean(block));
    const optionalBlocks = layoutBlocks.filter((block) => !requiredTypes.includes(block.type));
    layoutBlocks.splice(0, layoutBlocks.length, ...requiredBlocks, ...optionalBlocks);
  }

  const normalizedSavedLayout = normalizePageBlocksLayout(savedLayout);
  if (!normalizedSavedLayout) {
    return createPageBlocksLayout(layoutBlocks, themeForInvitationTemplate(templateId));
  }

  const legacyTheme = LEGACY_INVITATION_THEME_CLASSES[templateId];
  if (!legacyTheme) return normalizedSavedLayout;

  const envelopeGate = layoutBlocks.find((block) => block.type === "interactive_envelope");
  const isRomanticEnvelope = templateId === "romantic-envelope";
  const savedBlocks = normalizedSavedLayout.layout_blocks.map((block) => {
    if (block.type === "romantic_envelope_gate") return { ...block, type: "interactive_envelope" };
    if (isRomanticEnvelope && block.type === "hero") return { ...block, type: "romantic_hero" };
    return block;
  });
  const savedEnvelopeGate = savedBlocks.find((block) => block.type === "interactive_envelope");
  const countdownBlock = layoutBlocks.find((block) => block.type === "countdown");
  const locationMapBlock = layoutBlocks.find((block) => block.type === "location_map");
  const authoredBlocks = isRomanticEnvelope
    ? (() => {
        const requiredTypes = ["interactive_envelope", "romantic_hero", "countdown", "story", "schedule", "location_map"];
        const defaultsByType = new Map(layoutBlocks.map((block) => [block.type, block]));
        const savedByType = new Map(savedBlocks.map((block) => [block.type, block]));
        const requiredBlocks = requiredTypes
          .map((type) => savedByType.get(type) ?? defaultsByType.get(type))
          .filter((block): block is PageLayoutBlock => Boolean(block));
        const optionalBlocks = savedBlocks.filter((block) =>
          block.type !== "romantic_envelope_gate" && !requiredTypes.includes(block.type)
        );
        return [
          ...(savedEnvelopeGate || envelopeGate ? [savedEnvelopeGate ?? envelopeGate!] : []),
          ...requiredBlocks.filter((block) => block.type !== "interactive_envelope"),
          ...optionalBlocks,
        ];
      })()
    : COUNTDOWN_TEMPLATE_IDS.has(templateId) && countdownBlock && !savedBlocks.some((block) => block.type === "countdown")
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
  return {
    ...normalizedSavedLayout,
    layout_blocks: compatibleBlocks.some((block) => block.type === "location_map") || !locationMapBlock
      ? compatibleBlocks
      : [...compatibleBlocks, locationMapBlock],
    global_theme: {
      ...normalizedSavedLayout.global_theme,
      classes: {
        ...normalizedSavedLayout.global_theme.classes,
        ...legacyTheme,
      },
    },
  };
}

export function legacyInvitationSnapshotToLayout(snapshot: InvitationPageSnapshot): PageBlocksLayout {
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
