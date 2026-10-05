"use client";

import React, { useState, useMemo } from "react";
import {
  FULL_INVITATION_SAMPLE_DATA,
  WEDDING_INVITATION_SAMPLE_DATA,
  BIRTHDAY_INVITATION_SAMPLE_DATA,
  MINIMAL_INVITATION_SAMPLE_DATA,
  PORTRAIT_HERO_SAMPLE_DATA,
  LANDSCAPE_HERO_SAMPLE_DATA,
  BRIGHT_PHOTO_SAMPLE_DATA,
  DARK_PHOTO_SAMPLE_DATA,
  LOWRES_PHOTO_SAMPLE_DATA,
  LONG_TITLE_SAMPLE_DATA,
  ONE_GALLERY_IMAGE_SAMPLE_DATA,
  TWELVE_GALLERY_IMAGES_SAMPLE_DATA,
} from "@/components/invitation/templates/invitation-sample-data";
import {
  INVITATION_CATEGORIES,
  INVITATION_TEMPLATES,
  TemplateCategory,
  getTemplateById,
} from "@/components/invitation/templates/registry";
import { InvitationPageData } from "@/types/invitation-template";
import { Sparkles, Smartphone, Monitor, Image as ImageIcon, User, Layers, Tag } from "lucide-react";

type ScenarioKey =
  | "default"
  | "minimal"
  | "vip"
  | "portrait_hero"
  | "landscape_hero"
  | "bright_photo"
  | "dark_photo"
  | "lowres_photo"
  | "no_hero"
  | "long_title"
  | "one_gallery"
  | "twelve_gallery";

type GuestType = "standard" | "vip" | "no_pass";
type WeddingSubtype = "church" | "civil" | "traditional" | "engagement" | "vow_renewal";

const SCENARIO_LABELS: Record<ScenarioKey, { label: string; description: string }> = {
  default: {
    label: "Template Default (Full Content)",
    description: "Fully populated template data matching the selected event category.",
  },
  minimal: {
    label: "Minimal Content",
    description: "Demonstrates HIDE-IF-EMPTY: missing optional sections close up with zero gaps.",
  },
  vip: {
    label: "VIP Guest View",
    description: "VIP greeting line, VIP badge, and priority seat assignment.",
  },
  portrait_hero: {
    label: "Portrait Hero Photo",
    description: "Tests focal point positioning and vertical image cropping.",
  },
  landscape_hero: {
    label: "Landscape Hero Photo",
    description: "Wide panorama hero image framing.",
  },
  bright_photo: {
    label: "Very Bright Photo",
    description: "High-key photo testing solid text panel contrast & legibility.",
  },
  dark_photo: {
    label: "Very Dark Photo",
    description: "Low-key photo testing dark mode accents and contrast.",
  },
  lowres_photo: {
    label: "Low-Res Photo",
    description: "Small resolution image testing layout stability and no shift.",
  },
  no_hero: {
    label: "No Hero Image (Designed Fallback)",
    description: "Designed geometric / botanical pattern fallback (zero stock photos).",
  },
  long_title: {
    label: "Long Title (80+ Chars)",
    description: "Tests balanced text wrapping and fluid type scale.",
  },
  one_gallery: {
    label: "1 Gallery Image",
    description: "Single featured hero photo with caption.",
  },
  twelve_gallery: {
    label: "12 Gallery Images",
    description: "Full editorial photo spread with mixed aspect mosaic.",
  },
};

/** Get the base dataset for a category / template */
function getBaseDataForTemplate(templateId: string): InvitationPageData {
  if (templateId === "wedding-romantic") {
    return WEDDING_INVITATION_SAMPLE_DATA;
  }
  if (templateId === "birthday-bold") {
    return BIRTHDAY_INVITATION_SAMPLE_DATA;
  }
  return FULL_INVITATION_SAMPLE_DATA;
}

/** Generate combined test scenario data tailored to the active template */
function resolveScenarioData(
  templateId: string,
  scenarioKey: ScenarioKey,
  weddingSubtype?: WeddingSubtype
): InvitationPageData {
  const base = getBaseDataForTemplate(templateId);

  let scenarioData: InvitationPageData;

  switch (scenarioKey) {
    case "minimal":
      scenarioData = {
        ...MINIMAL_INVITATION_SAMPLE_DATA,
        title: base.title,
        eventDate: base.eventDate,
      };
      break;
    case "vip":
      scenarioData = {
        ...base,
        guest: {
          ...base.guest,
          isVip: true,
          rsvpStatus: "accepted",
          rsvpAt: "2026-10-01T14:22:00Z",
        },
        seat: {
          label: "Honorary Dais · Seat 1",
          tableNumber: "1",
          tableName: "Presidential Dais",
          isVip: true,
        },
      };
      break;
    case "portrait_hero":
      scenarioData = {
        ...base,
        heroImage: PORTRAIT_HERO_SAMPLE_DATA.heroImage,
        heroImageFocus: PORTRAIT_HERO_SAMPLE_DATA.heroImageFocus,
      };
      break;
    case "landscape_hero":
      scenarioData = {
        ...base,
        heroImage: LANDSCAPE_HERO_SAMPLE_DATA.heroImage,
        heroImageFocus: LANDSCAPE_HERO_SAMPLE_DATA.heroImageFocus,
      };
      break;
    case "bright_photo":
      scenarioData = {
        ...base,
        heroImage: BRIGHT_PHOTO_SAMPLE_DATA.heroImage,
        heroImageFocus: BRIGHT_PHOTO_SAMPLE_DATA.heroImageFocus,
      };
      break;
    case "dark_photo":
      scenarioData = {
        ...base,
        heroImage: DARK_PHOTO_SAMPLE_DATA.heroImage,
        heroImageFocus: DARK_PHOTO_SAMPLE_DATA.heroImageFocus,
      };
      break;
    case "lowres_photo":
      scenarioData = {
        ...base,
        heroImage: LOWRES_PHOTO_SAMPLE_DATA.heroImage,
      };
      break;
    case "no_hero":
      scenarioData = {
        ...base,
        heroImage: null,
      };
      break;
    case "long_title":
      scenarioData = {
        ...base,
        title:
          templateId === "wedding-romantic"
            ? "The Nuptial Blessing & Holy Matrimony Celebration of Elena Victoria Vance & David Alexander Sterling"
            : templateId === "birthday-bold"
            ? "Maya Rodriguez's Spectacular 30th Birthday Disco Extravaganza & Rooftop Bash"
            : LONG_TITLE_SAMPLE_DATA.title,
      };
      break;
    case "one_gallery":
      scenarioData = {
        ...base,
        gallery: ONE_GALLERY_IMAGE_SAMPLE_DATA.gallery,
      };
      break;
    case "twelve_gallery":
      scenarioData = {
        ...base,
        gallery: TWELVE_GALLERY_IMAGES_SAMPLE_DATA.gallery,
      };
      break;
    case "default":
    default:
      scenarioData = { ...base };
      break;
  }

  // Apply wedding subtype if active
  if (templateId === "wedding-romantic" && weddingSubtype) {
    scenarioData.weddingSubtype = weddingSubtype;
  }

  return scenarioData;
}

/** Apply guest-type override strictly so Standard guest never inherits VIP status */
function applyGuestType(base: InvitationPageData, guestType: GuestType): InvitationPageData {
  switch (guestType) {
    case "vip":
      return {
        ...base,
        guest: {
          ...base.guest,
          isVip: true,
          rsvpStatus: base.guest.rsvpStatus,
        },
        seat: base.seat
          ? { ...base.seat, isVip: true }
          : {
              label: "VIP Reserved · Seat 1",
              tableNumber: "1",
              tableName: "VIP Circle",
              isVip: true,
            },
      };
    case "no_pass":
      return {
        ...base,
        guest: {
          ...base.guest,
          isVip: false,
          rsvpStatus: base.guest.rsvpStatus,
        },
        seat: null,
        ticketInstance: null,
      };
    case "standard":
    default:
      return {
        ...base,
        guest: {
          ...base.guest,
          isVip: false,
          rsvpStatus: base.guest.rsvpStatus,
        },
        seat: base.seat ? { ...base.seat, isVip: false } : null,
      };
  }
}

export default function InvitationPreviewPage() {
  const [templateId, setTemplateId] = useState<string>("gala-editorial");
  const [scenarioKey, setScenarioKey] = useState<ScenarioKey>("default");
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [guestType, setGuestType] = useState<GuestType>("standard");
  const [weddingSubtype, setWeddingSubtype] = useState<WeddingSubtype>("church");

  const currentTemplate = useMemo(() => getTemplateById(templateId), [templateId]);
  const activeCategory = currentTemplate.category;

  const currentCategoryTemplates = useMemo(
    () => INVITATION_TEMPLATES.filter((t) => t.category === activeCategory),
    [activeCategory]
  );

  const scenarioData = useMemo(
    () => resolveScenarioData(templateId, scenarioKey, weddingSubtype),
    [templateId, scenarioKey, weddingSubtype]
  );

  const finalPageData = useMemo(
    () => applyGuestType(scenarioData, guestType),
    [scenarioData, guestType]
  );

  const TemplateComponent = currentTemplate.component;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* ── Top Dev Toolbar ───────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-zinc-900/95 border-b border-zinc-800 px-4 py-2.5 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Brand & Template Descriptor */}
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-amber-400 block">
                {currentTemplate.name}
              </span>
              <span className="text-[10px] text-zinc-400 hidden md:inline">
                {currentTemplate.description}
              </span>
            </div>
          </div>

          {/* Test Controls Strip */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Category Dropdown */}
            <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1 text-xs">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] text-zinc-400 uppercase tracking-wider font-bold hidden sm:inline">
                Category:
              </span>
              <select
                value={activeCategory}
                onChange={(e) => {
                  const newCat = e.target.value as TemplateCategory;
                  const firstInCat = INVITATION_TEMPLATES.find((t) => t.category === newCat);
                  if (firstInCat) setTemplateId(firstInCat.id);
                }}
                className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer pr-1"
              >
                {Object.entries(INVITATION_CATEGORIES).map(([key, item]) => (
                  <option key={key} value={key} className="bg-zinc-900 text-white">
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Template Dropdown */}
            <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1 text-xs">
              <Tag className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] text-zinc-400 uppercase tracking-wider font-bold hidden sm:inline">
                Template:
              </span>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer pr-1"
              >
                {currentCategoryTemplates.map((item) => (
                  <option key={item.id} value={item.id} className="bg-zinc-900 text-white">
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Wedding Subtype (Visible only when in Wedding category) */}
            {activeCategory === "wedding" && (
              <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1 text-xs">
                <span className="text-[11px] text-rose-300 uppercase tracking-wider font-bold hidden sm:inline">
                  Subtype:
                </span>
                <select
                  value={weddingSubtype}
                  onChange={(e) => setWeddingSubtype(e.target.value as WeddingSubtype)}
                  className="bg-transparent text-rose-200 font-bold text-xs focus:outline-none cursor-pointer pr-1"
                >
                  <option value="church" className="bg-zinc-900 text-white">
                    Church / White Wedding
                  </option>
                  <option value="civil" className="bg-zinc-900 text-white">
                    Civil / Court
                  </option>
                  <option value="traditional" className="bg-zinc-900 text-white">
                    Traditional
                  </option>
                  <option value="engagement" className="bg-zinc-900 text-white">
                    Engagement
                  </option>
                  <option value="vow_renewal" className="bg-zinc-900 text-white">
                    Vow Renewal
                  </option>
                </select>
              </div>
            )}

            {/* Scenario Dropdown */}
            <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1 text-xs">
              <ImageIcon className="w-3.5 h-3.5 text-zinc-400" />
              <select
                value={scenarioKey}
                onChange={(e) => setScenarioKey(e.target.value as ScenarioKey)}
                className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer pr-1"
              >
                {Object.entries(SCENARIO_LABELS).map(([key, item]) => (
                  <option key={key} value={key} className="bg-zinc-900 text-white">
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Guest Type Dropdown */}
            <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1 text-xs">
              <User className="w-3.5 h-3.5 text-zinc-400" />
              <select
                value={guestType}
                onChange={(e) => setGuestType(e.target.value as GuestType)}
                className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer pr-1"
              >
                <option value="standard" className="bg-zinc-900 text-white">
                  Standard Guest
                </option>
                <option value="vip" className="bg-zinc-900 text-white">
                  VIP Guest
                </option>
                <option value="no_pass" className="bg-zinc-900 text-white">
                  No Seat / No Pass
                </option>
              </select>
            </div>

            {/* Viewport Width Toggles */}
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewport("desktop")}
                className={`p-1.5 rounded-lg transition-all flex items-center gap-1 ${
                  viewport === "desktop"
                    ? "bg-amber-500 text-zinc-950 font-bold"
                    : "text-zinc-400 hover:text-white"
                }`}
                title="Desktop View"
              >
                <Monitor className="w-3.5 h-3.5" />
                <span className="text-[11px] hidden sm:inline">1440px</span>
              </button>

              <button
                type="button"
                onClick={() => setViewport("mobile")}
                className={`p-1.5 rounded-lg transition-all flex items-center gap-1 ${
                  viewport === "mobile"
                    ? "bg-amber-500 text-zinc-950 font-bold"
                    : "text-zinc-400 hover:text-white"
                }`}
                title="Mobile 390px View"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="text-[11px] hidden sm:inline">390px</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main Template Container (Full Width on Desktop, Phone Frame on Mobile) ── */}
      <main className="w-full flex-1 flex justify-center bg-zinc-950 overflow-x-hidden">
        {viewport === "mobile" ? (
          <div className="my-6 max-w-[390px] w-full min-h-[844px] border-4 border-zinc-800 rounded-[44px] overflow-hidden shadow-2xl bg-white">
            <TemplateComponent data={finalPageData} />
          </div>
        ) : (
          <div className="w-full">
            <TemplateComponent data={finalPageData} />
          </div>
        )}
      </main>
    </div>
  );
}
