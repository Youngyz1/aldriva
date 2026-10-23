import { z } from "zod";
import { getInvitationTemplateDefinition } from "@/lib/invitation-template-registry";

export const PAGE_LAYOUT_VERSION = 1 as const;

export const PAGE_THEME_PRESETS = {
  neutral: {
    classes: {
      page: "min-h-screen bg-white text-zinc-950",
      section: "bg-white",
      heading: "font-sans text-zinc-950",
      body: "font-sans text-zinc-700",
      card: "rounded-xl border border-zinc-200 bg-white shadow-xs",
      button: "rounded-xl bg-orange-700 text-white hover:bg-orange-800",
    },
  },
  gala: {
    classes: {
      page: "min-h-screen bg-stone-50 text-stone-950",
      section: "bg-stone-50",
      heading: "font-serif text-stone-950",
      body: "font-serif text-stone-700",
      card: "rounded-xl border border-stone-200 bg-white shadow-xs",
      button: "rounded-xl bg-stone-900 text-white hover:bg-stone-800",
    },
  },
  blackTie: {
    classes: {
      page: "min-h-screen bg-zinc-950 text-zinc-50",
      section: "bg-zinc-950",
      heading: "font-serif text-amber-100",
      body: "font-serif text-zinc-300",
      card: "rounded-xl border border-zinc-700 bg-zinc-900 shadow-xs",
      button: "rounded-xl bg-amber-500 text-zinc-950 hover:bg-amber-400",
    },
  },
  wedding: {
    classes: {
      page: "min-h-screen bg-rose-50 text-rose-950",
      section: "bg-rose-50",
      heading: "font-serif text-rose-950",
      body: "font-serif text-stone-700",
      card: "rounded-xl border border-rose-200 bg-white shadow-xs",
      button: "rounded-xl bg-rose-800 text-white hover:bg-rose-900",
    },
  },
  luxeEditorial: {
    classes: {
      page: "min-h-screen bg-[#fdfaf6] text-[#4a4a4a] font-serif selection:bg-[#e8d5c4]",
      section: "bg-transparent",
      heading: "font-serif text-[#4a4a4a]",
      body: "font-serif text-[#6a5c52]",
      card: "border border-[#e8d5c4]/70 bg-white shadow-sm",
      button: "rounded-lg bg-[#c5a880] text-white hover:bg-[#b59a72]",
    },
  },
  botanical: {
    classes: {
      page: "min-h-screen bg-[#f4efe4] text-[#263b31]",
      section: "bg-transparent",
      heading: "font-serif text-[#263b31]",
      body: "font-sans text-[#53665a]",
      card: "border border-[#d8d0bb] bg-[#fffdf7] shadow-lg",
      button: "bg-[#365746] text-[#fffdf7] hover:bg-[#284434]",
    },
  },
  evergreen: {
    classes: {
      page: "min-h-screen bg-[#f7f5e9] text-[#48533a]",
      section: "bg-transparent",
      heading: "font-serif text-[#48533a]",
      body: "font-serif text-[#68705d]",
      card: "border border-[#d9ddc6] bg-[#fffdf4] shadow-sm",
      button: "rounded-full bg-[#7d8b48] text-white hover:bg-[#69763a]",
    },
  },
  birthday: {
    classes: {
      page: "min-h-screen bg-amber-50 text-zinc-950",
      section: "bg-amber-50",
      heading: "font-sans text-fuchsia-950",
      body: "font-sans text-zinc-700",
      card: "rounded-xl border border-amber-200 bg-white shadow-xs",
      button: "rounded-xl bg-fuchsia-700 text-white hover:bg-fuchsia-800",
    },
  },
  cover: {
    classes: {
      page: "min-h-screen bg-slate-950 text-white",
      section: "bg-slate-950",
      heading: "font-serif text-white",
      body: "font-sans text-slate-200",
      card: "rounded-xl border border-white/20 bg-slate-900 shadow-xs",
      button: "rounded-xl bg-white text-slate-950 hover:bg-slate-100",
    },
  },
} as const;

export type PageThemePreset = keyof typeof PAGE_THEME_PRESETS;
export type PageThemeClasses = Partial<{
  page: string;
  section: string;
  heading: string;
  body: string;
  card: string;
  button: string;
}>;

/** Curated presentation themes retained for legacy invitation template IDs. */
export const LEGACY_INVITATION_THEME_CLASSES: Record<string, PageThemeClasses> = {
  "wedding-romantic": {
    page: "min-h-screen bg-stone-50 text-stone-900 font-serif selection:bg-amber-100",
    section: "bg-transparent",
    body: "font-serif text-stone-700",
    card: "bg-white/80 backdrop-blur-sm border border-stone-200/60 shadow-xl rounded-2xl p-8 max-w-2xl mx-auto my-6",
    heading: "font-serif text-amber-900 italic text-center font-normal tracking-wide",
    button: "bg-amber-800 text-white rounded-full font-serif px-8 py-3 tracking-wider hover:bg-amber-900 transition-all",
  },
  "birthday-bold": {
    page: "min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-fuchsia-500",
    section: "bg-transparent",
    body: "font-sans text-slate-200",
    card: "bg-slate-800/80 border border-slate-700 shadow-2xl rounded-3xl p-6",
    heading: "font-black uppercase tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-500 to-violet-400",
    button: "bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white rounded-xl font-bold px-6 py-3 shadow-lg",
  },
  "gala-editorial": {
    page: "min-h-screen bg-zinc-950 text-zinc-100 font-mono tracking-tight",
    section: "bg-transparent",
    body: "font-mono text-zinc-300",
    card: "bg-zinc-900 border border-zinc-800 rounded-none p-8",
    heading: "font-mono font-bold uppercase tracking-widest text-zinc-300",
    button: "border border-zinc-400 hover:bg-white hover:text-black transition-colors rounded-none px-6 py-3 text-xs uppercase",
  },
  "black-tie": {
    page: "min-h-screen bg-zinc-950 text-zinc-100 font-mono tracking-tight",
    section: "bg-transparent",
    body: "font-mono text-zinc-300",
    card: "bg-zinc-900 border border-zinc-800 rounded-none p-8",
    heading: "font-mono font-bold uppercase tracking-widest text-zinc-300",
    button: "border border-zinc-400 hover:bg-white hover:text-black transition-colors rounded-none px-6 py-3 text-xs uppercase",
  },
  "romantic-envelope": {
    page: "min-h-screen bg-[#E6DEC9] text-stone-900 font-serif",
    section: "bg-transparent",
    body: "font-serif text-stone-700",
    card: "bg-white/80 border border-stone-200/50 shadow-md p-5 rounded-xl",
    heading: "font-serif text-amber-900 italic text-center font-normal tracking-wide",
    button: "bg-amber-800 text-white rounded-full font-serif px-8 py-3 tracking-wider hover:bg-amber-900 transition-all",
  },
  "botanical-reverie": {
    page: "min-h-screen bg-[#f4efe4] text-[#263b31]",
    section: "bg-transparent",
    body: "font-sans text-[#53665a]",
    card: "border border-[#d8d0bb] bg-[#fffdf7] shadow-lg",
    heading: "font-serif text-[#263b31]",
    button: "bg-[#365746] text-[#fffdf7] hover:bg-[#284434]",
  },
};

export interface PageGlobalTheme {
  classes: PageThemeClasses;
  palette_id?: string;
  font_pack_id?: string;
  text_scale: number;
}

export interface PageLayoutBlock {
  id: string;
  type: string;
  content: Record<string, unknown>;
}

export interface PageBlocksLayout {
  version: typeof PAGE_LAYOUT_VERSION;
  global_theme: PageGlobalTheme;
  layout_blocks: PageLayoutBlock[];
}

const THEME_SLOTS = ["page", "section", "heading", "body", "card", "button"] as const;
type ThemeSlot = (typeof THEME_SLOTS)[number];

const legacyThemeClassValues: Record<ThemeSlot, string[]> = {
  page: [],
  section: [],
  heading: [],
  body: [],
  card: [],
  button: [],
};
for (const theme of Object.values(LEGACY_INVITATION_THEME_CLASSES)) {
  for (const slot of THEME_SLOTS) {
    const value = theme[slot];
    if (value) legacyThemeClassValues[slot].push(value);
  }
}

const allowedThemeClasses: Record<ThemeSlot, Set<string>> = {
  page: new Set([...Object.values(PAGE_THEME_PRESETS).map((preset) => preset.classes.page), ...legacyThemeClassValues.page]),
  section: new Set([...Object.values(PAGE_THEME_PRESETS).map((preset) => preset.classes.section), ...legacyThemeClassValues.section]),
  heading: new Set([...Object.values(PAGE_THEME_PRESETS).map((preset) => preset.classes.heading), ...legacyThemeClassValues.heading]),
  body: new Set([...Object.values(PAGE_THEME_PRESETS).map((preset) => preset.classes.body), ...legacyThemeClassValues.body]),
  card: new Set([...Object.values(PAGE_THEME_PRESETS).map((preset) => preset.classes.card), ...legacyThemeClassValues.card]),
  button: new Set([...Object.values(PAGE_THEME_PRESETS).map((preset) => preset.classes.button), ...legacyThemeClassValues.button]),
};

const ThemeClassesSchema = z
  .object({
    page: z.string().max(180).optional(),
    section: z.string().max(180).optional(),
    heading: z.string().max(180).optional(),
    body: z.string().max(180).optional(),
    card: z.string().max(180).optional(),
    button: z.string().max(180).optional(),
  })
  .strict()
  .superRefine((classes, ctx) => {
    for (const slot of THEME_SLOTS) {
      const value = classes[slot];
      if (value !== undefined && !allowedThemeClasses[slot].has(value)) {
        ctx.addIssue({
          code: "custom",
          path: [slot],
          message: `Unsupported global theme class for ${slot}. Use a declared page theme preset.`,
        });
      }
    }
  });

const LayoutBlockSchema = z
  .object({
    id: z.string().min(1).max(120),
    type: z.string().min(1).max(80).regex(/^[a-z][a-z0-9_:-]*$/),
    content: z.record(z.string(), z.unknown()),
  })
  .strict();

export const PageBlocksLayoutSchema = z
  .object({
    version: z.literal(PAGE_LAYOUT_VERSION).default(PAGE_LAYOUT_VERSION),
    global_theme: z
      .object({
        palette_id: z.string().trim().max(80).optional(),
        font_pack_id: z.string().trim().max(80).optional(),
        text_scale: z.number().min(0.8).max(1.4).default(1.0),
        classes: ThemeClassesSchema,
      })
      .strict(),
    layout_blocks: z.array(LayoutBlockSchema).max(120),
  })
  .strict();

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function themeCardHasPadding(theme: PageGlobalTheme): boolean {
  return /(?:^|\s)(?:sm:)?p(?:[xytrblse])?-\S+/.test(theme.classes.card ?? "");
}

/** Keeps legacy preset padding from competing with the card's authored spacing. */
export function pageThemeCardClassName(theme: PageGlobalTheme, fallbackPadding: string): string {
  const cardClasses = theme.classes.card ?? "";
  return [themeCardHasPadding(theme) ? "" : fallbackPadding, cardClasses].filter(Boolean).join(" ");
}

export function pageThemeButtonClassName(theme: PageGlobalTheme, fallbackStyle: string): string {
  const buttonClasses = theme.classes.button ?? "";
  const hasPadding = /(?:^|\s)(?:sm:)?p(?:[xytrblse])?-\S+/.test(buttonClasses);
  return [hasPadding ? "" : fallbackStyle, buttonClasses].filter(Boolean).join(" ");
}

/** Returns a validated layout, or null when the JSON shape is not supported. */
export function normalizePageBlocksLayout(value: unknown): PageBlocksLayout | null {
  const parsed = PageBlocksLayoutSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function createPageBlocksLayout(
  layoutBlocks: PageLayoutBlock[],
  theme: PageGlobalTheme = { classes: { ...PAGE_THEME_PRESETS.neutral.classes }, text_scale: 1.0 }
): PageBlocksLayout {
  const parsed = PageBlocksLayoutSchema.parse({
    version: PAGE_LAYOUT_VERSION,
    global_theme: theme,
    layout_blocks: layoutBlocks,
  });
  return parsed;
}

/**
 * Adapts the existing business WebsiteBlock array into the common layout
 * envelope. The block renderer receives the original properties again after
 * the envelope is unpacked, so existing site blocks remain compatible.
 */
export function websiteBlocksToPageLayout(
  blocks: unknown,
  globalTheme: PageGlobalTheme = { classes: {}, text_scale: 1.0 }
): PageBlocksLayout {
  const normalized = normalizePageBlocksLayout(blocks);
  if (normalized) return normalized;

  const layoutBlocks: PageLayoutBlock[] = [];
  if (Array.isArray(blocks)) {
    blocks.forEach((raw, index) => {
      if (!isRecord(raw) || typeof raw.type !== "string" || !raw.type) return;
      const { id: rawId, type, ...content } = raw;
      const id = typeof rawId === "string" && rawId.trim() ? rawId : `website-${index}-${type}`;
      layoutBlocks.push({ id, type, content });
    });
  }

  return createPageBlocksLayout(layoutBlocks, globalTheme);
}

/** Unwraps canonical blocks for the existing business BlockRenderer. */
export function pageLayoutToWebsiteBlocks(layout: PageBlocksLayout): Record<string, unknown>[] {
  return layout.layout_blocks.map((block) => ({
    ...block.content,
    id: block.id,
    type: block.type,
  }));
}

export function themeForInvitationTemplate(templateId: string): PageGlobalTheme {
  const preset: PageThemePreset = getInvitationTemplateDefinition(templateId)?.defaultThemePreset ?? "gala";
  return {
    text_scale: 1.0,
    classes: {
      ...PAGE_THEME_PRESETS[preset].classes,
      ...LEGACY_INVITATION_THEME_CLASSES[templateId],
    },
    ...(templateId === "botanical-reverie" ? {
      palette_id: "palette-botanical",
      font_pack_id: "font-serif-editorial",
    } : {}),
    ...(templateId === "evergreen-envelope" ? {
      palette_id: "palette-evergreen",
      font_pack_id: "font-script",
    } : {}),
  };
}
