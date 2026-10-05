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
import { InvitationLocale } from "@/lib/invitation-i18n";
import {
  Sparkles,
  Smartphone,
  Monitor,
  Image as ImageIcon,
  User,
  Layers,
  Tag,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

type ScenarioKey =
  | "default"
  | "minimal"
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
  const [locale, setLocale] = useState<InvitationLocale>("en");
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);

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
    () => ({
      ...applyGuestType(scenarioData, guestType),
      locale,
    }),
    [scenarioData, guestType, locale]
  );

  const TemplateComponent = currentTemplate.component;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* ── Compact Dev Toolbar (Single compact row on mobile, expandable) ──── */}
      <header className="sticky top-0 z-50 bg-zinc-900/95 border-b border-zinc-800 px-3 py-2 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          {/* Brand & Active Template Pill */}
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0">
              <span className="text-xs font-black uppercase tracking-wider text-amber-400 truncate block">
                {currentTemplate.name}
              </span>
              <span className="text-[10px] text-zinc-400 hidden xl:inline truncate">
                {currentTemplate.description}
              </span>
            </div>
          </div>

          {/* Desktop Controls (Always visible lg+) */}
          <div className="hidden lg:flex items-center gap-1.5 flex-wrap">
            {/* Category Dropdown */}
            <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
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
            <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs">
              <Tag className="w-3.5 h-3.5 text-amber-400" />
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

            {/* Wedding Subtype */}
            {activeCategory === "wedding" && (
              <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs">
                <select
                  value={weddingSubtype}
                  onChange={(e) => setWeddingSubtype(e.target.value as WeddingSubtype)}
                  className="bg-transparent text-rose-200 font-bold text-xs focus:outline-none cursor-pointer pr-1"
                >
                  <option value="church" className="bg-zinc-900 text-white">Church Wedding</option>
                  <option value="civil" className="bg-zinc-900 text-white">Civil / Court</option>
                  <option value="traditional" className="bg-zinc-900 text-white">Traditional</option>
                  <option value="engagement" className="bg-zinc-900 text-white">Engagement</option>
                  <option value="vow_renewal" className="bg-zinc-900 text-white">Vow Renewal</option>
                </select>
              </div>
            )}

            {/* Scenario Dropdown */}
            <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs">
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
            <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs">
              <User className="w-3.5 h-3.5 text-zinc-400" />
              <select
                value={guestType}
                onChange={(e) => setGuestType(e.target.value as GuestType)}
                className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer pr-1"
              >
                <option value="standard" className="bg-zinc-900 text-white">Standard Guest</option>
                <option value="vip" className="bg-zinc-900 text-white">VIP Guest</option>
                <option value="no_pass" className="bg-zinc-900 text-white">No Pass</option>
              </select>
            </div>

            {/* Language Switcher */}
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setLocale("en")}
                className={`px-2 py-1 rounded-md text-[11px] font-black uppercase transition-all ${
                  locale === "en" ? "bg-amber-500 text-zinc-950" : "text-zinc-400 hover:text-white"
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLocale("fr")}
                className={`px-2 py-1 rounded-md text-[11px] font-black uppercase transition-all ${
                  locale === "fr" ? "bg-amber-500 text-zinc-950" : "text-zinc-400 hover:text-white"
                }`}
              >
                FR
              </button>
            </div>

            {/* Viewport Width Toggles */}
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewport("desktop")}
                className={`p-1.5 rounded-md transition-all flex items-center gap-1 ${
                  viewport === "desktop"
                    ? "bg-amber-500 text-zinc-950 font-bold"
                    : "text-zinc-400 hover:text-white"
                }`}
                title="Desktop View"
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setViewport("mobile")}
                className={`p-1.5 rounded-md transition-all flex items-center gap-1 ${
                  viewport === "mobile"
                    ? "bg-amber-500 text-zinc-950 font-bold"
                    : "text-zinc-400 hover:text-white"
                }`}
                title="Mobile 390px View"
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Mobile Right Controls: Language + Collapse Button */}
          <div className="flex items-center gap-1.5 lg:hidden">
            {/* Quick Language Toggle */}
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5 text-[10px]">
              <button
                type="button"
                onClick={() => setLocale("en")}
                className={`px-1.5 py-0.5 rounded font-black ${
                  locale === "en" ? "bg-amber-500 text-zinc-950" : "text-zinc-400"
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLocale("fr")}
                className={`px-1.5 py-0.5 rounded font-black ${
                  locale === "fr" ? "bg-amber-500 text-zinc-950" : "text-zinc-400"
                }`}
              >
                FR
              </button>
            </div>

            {/* Toggle Panel Button */}
            <button
              type="button"
              onClick={() => setMobileControlsOpen((prev) => !prev)}
              className="px-2 py-1 rounded-lg bg-zinc-800 text-xs font-bold text-zinc-200 flex items-center gap-1 border border-zinc-700"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px]">Controls</span>
              {mobileControlsOpen ? (
                <ChevronUp className="w-3 h-3 text-zinc-400" />
              ) : (
                <ChevronDown className="w-3 h-3 text-zinc-400" />
              )}
            </button>
          </div>
        </div>

        {/* Expandable Panel for Narrow / Mobile View */}
        {mobileControlsOpen && (
          <div className="mt-2 pt-2 border-t border-zinc-800 grid grid-cols-2 sm:grid-cols-3 gap-2 lg:hidden">
            {/* Category */}
            <div className="flex flex-col gap-0.5 bg-zinc-950 border border-zinc-800 rounded-lg p-1.5">
              <span className="text-[9px] uppercase font-bold text-zinc-400">Category</span>
              <select
                value={activeCategory}
                onChange={(e) => {
                  const newCat = e.target.value as TemplateCategory;
                  const firstInCat = INVITATION_TEMPLATES.find((t) => t.category === newCat);
                  if (firstInCat) setTemplateId(firstInCat.id);
                }}
                className="bg-transparent text-white font-bold text-xs focus:outline-none"
              >
                {Object.entries(INVITATION_CATEGORIES).map(([key, item]) => (
                  <option key={key} value={key} className="bg-zinc-900 text-white">
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Template */}
            <div className="flex flex-col gap-0.5 bg-zinc-950 border border-zinc-800 rounded-lg p-1.5">
              <span className="text-[9px] uppercase font-bold text-zinc-400">Template</span>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="bg-transparent text-white font-bold text-xs focus:outline-none"
              >
                {currentCategoryTemplates.map((item) => (
                  <option key={item.id} value={item.id} className="bg-zinc-900 text-white">
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Scenario */}
            <div className="flex flex-col gap-0.5 bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 col-span-2 sm:col-span-1">
              <span className="text-[9px] uppercase font-bold text-zinc-400">Scenario</span>
              <select
                value={scenarioKey}
                onChange={(e) => setScenarioKey(e.target.value as ScenarioKey)}
                className="bg-transparent text-white font-bold text-xs focus:outline-none"
              >
                {Object.entries(SCENARIO_LABELS).map(([key, item]) => (
                  <option key={key} value={key} className="bg-zinc-900 text-white">
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Guest */}
            <div className="flex flex-col gap-0.5 bg-zinc-950 border border-zinc-800 rounded-lg p-1.5">
              <span className="text-[9px] uppercase font-bold text-zinc-400">Guest Type</span>
              <select
                value={guestType}
                onChange={(e) => setGuestType(e.target.value as GuestType)}
                className="bg-transparent text-white font-bold text-xs focus:outline-none"
              >
                <option value="standard" className="bg-zinc-900 text-white">Standard Guest</option>
                <option value="vip" className="bg-zinc-900 text-white">VIP Guest</option>
                <option value="no_pass" className="bg-zinc-900 text-white">No Pass</option>
              </select>
            </div>

            {/* Wedding Subtype (if applicable) */}
            {activeCategory === "wedding" && (
              <div className="flex flex-col gap-0.5 bg-zinc-950 border border-zinc-800 rounded-lg p-1.5">
                <span className="text-[9px] uppercase font-bold text-rose-300">Subtype</span>
                <select
                  value={weddingSubtype}
                  onChange={(e) => setWeddingSubtype(e.target.value as WeddingSubtype)}
                  className="bg-transparent text-rose-200 font-bold text-xs focus:outline-none"
                >
                  <option value="church" className="bg-zinc-900 text-white">Church</option>
                  <option value="civil" className="bg-zinc-900 text-white">Civil</option>
                  <option value="traditional" className="bg-zinc-900 text-white">Traditional</option>
                  <option value="engagement" className="bg-zinc-900 text-white">Engagement</option>
                  <option value="vow_renewal" className="bg-zinc-900 text-white">Vow Renewal</option>
                </select>
              </div>
            )}
          </div>
        )}
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
