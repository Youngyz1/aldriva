"use client";

import React, { useState, useMemo } from "react";
import {
  FULL_INVITATION_SAMPLE_DATA,
  MINIMAL_INVITATION_SAMPLE_DATA,
  VIP_INVITATION_SAMPLE_DATA,
  PORTRAIT_HERO_SAMPLE_DATA,
  LANDSCAPE_HERO_SAMPLE_DATA,
  BRIGHT_PHOTO_SAMPLE_DATA,
  DARK_PHOTO_SAMPLE_DATA,
  LOWRES_PHOTO_SAMPLE_DATA,
  NO_HERO_IMAGE_SAMPLE_DATA,
  LONG_TITLE_SAMPLE_DATA,
  ONE_GALLERY_IMAGE_SAMPLE_DATA,
  TWELVE_GALLERY_IMAGES_SAMPLE_DATA,
} from "@/components/invitation/templates/invitation-sample-data";
import { InvitationTemplate1 } from "@/components/invitation/templates/InvitationTemplate1";
import { InvitationPageData } from "@/types/invitation-template";
import { Sparkles, Smartphone, Monitor, Image as ImageIcon, User } from "lucide-react";

type ScenarioKey =
  | "full"
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

const SCENARIOS: Record<
  ScenarioKey,
  { label: string; data: InvitationPageData; description: string }
> = {
  full: {
    label: "Full Content (Standard)",
    data: FULL_INVITATION_SAMPLE_DATA,
    description: "All 12 sections populated with standard hero and 5 gallery photos.",
  },
  minimal: {
    label: "Minimal Content",
    data: MINIMAL_INVITATION_SAMPLE_DATA,
    description: "Demonstrates HIDE-IF-EMPTY: missing sections close up with zero gaps.",
  },
  vip: {
    label: "VIP Guest View",
    data: VIP_INVITATION_SAMPLE_DATA,
    description: "VIP greeting line, VIP badge, and Presidential Dais seat assignment.",
  },
  portrait_hero: {
    label: "Portrait Hero Photo",
    data: PORTRAIT_HERO_SAMPLE_DATA,
    description: "Tests focal point positioning and vertical image cropping.",
  },
  landscape_hero: {
    label: "Landscape Hero Photo",
    data: LANDSCAPE_HERO_SAMPLE_DATA,
    description: "Wide panorama hero image framing.",
  },
  bright_photo: {
    label: "Very Bright Photo",
    data: BRIGHT_PHOTO_SAMPLE_DATA,
    description: "High-key photo testing solid text panel contrast & legibility.",
  },
  dark_photo: {
    label: "Very Dark Photo",
    data: DARK_PHOTO_SAMPLE_DATA,
    description: "Low-key photo testing dark mode accents and contrast.",
  },
  lowres_photo: {
    label: "Low-Res Photo",
    data: LOWRES_PHOTO_SAMPLE_DATA,
    description: "Small resolution image testing layout stability and no shift.",
  },
  no_hero: {
    label: "No Hero Image (Designed Fallback)",
    data: NO_HERO_IMAGE_SAMPLE_DATA,
    description: "Designed geometric & typographic pattern (zero stock photos).",
  },
  long_title: {
    label: "Long Title (80+ Chars)",
    data: LONG_TITLE_SAMPLE_DATA,
    description: "Tests balanced text wrapping and fluid type scale.",
  },
  one_gallery: {
    label: "1 Gallery Image",
    data: ONE_GALLERY_IMAGE_SAMPLE_DATA,
    description: "Single featured hero photo with caption.",
  },
  twelve_gallery: {
    label: "12 Gallery Images",
    data: TWELVE_GALLERY_IMAGES_SAMPLE_DATA,
    description: "Full editorial photo spread with mixed aspect mosaic.",
  },
};

/** Apply a guest-type override on top of a base scenario dataset */
function applyGuestType(base: InvitationPageData, guestType: GuestType): InvitationPageData {
  switch (guestType) {
    case "vip":
      return {
        ...base,
        guest: {
          ...base.guest,
          name: base.guest.name,
          isVip: true,
          rsvpStatus: base.guest.rsvpStatus,
        },
        seat: base.seat ?? {
          label: "VIP Table · Seat 1",
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
        ticketInstance: undefined,
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
        seat: base.seat,
      };
  }
}

export default function InvitationPreviewPage() {
  const [scenarioKey, setScenarioKey] = useState<ScenarioKey>("full");
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [guestType, setGuestType] = useState<GuestType>("standard");

  const currentScenario = SCENARIOS[scenarioKey];
  const mergedData = useMemo(
    () => applyGuestType(currentScenario.data, guestType),
    [currentScenario.data, guestType]
  );

  return (
    <div className="min-h-screen bg-black text-white">
      {/* ── Top Dev Toolbar ───────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-zinc-950/95 border-b border-zinc-800/80 px-4 py-2.5 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-stone-500/20 text-stone-400 border border-stone-500/30">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-stone-400 block">
                Template 1 — Revision 2
              </span>
              <span className="text-[10px] text-zinc-400 hidden md:inline">
                {currentScenario.description}
              </span>
            </div>
          </div>

          {/* Test Controls Strip */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Scenario Dropdown */}
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1 text-xs">
              <ImageIcon className="w-3.5 h-3.5 text-stone-400" />
              <span className="text-[11px] text-zinc-400 uppercase tracking-wider font-bold hidden sm:inline">
                Scenario:
              </span>
              <select
                value={scenarioKey}
                onChange={(e) => setScenarioKey(e.target.value as ScenarioKey)}
                className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer pr-2"
              >
                {Object.entries(SCENARIOS).map(([key, item]) => (
                  <option key={key} value={key} className="bg-zinc-900 text-white">
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Guest Type Dropdown */}
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1 text-xs">
              <User className="w-3.5 h-3.5 text-stone-400" />
              <span className="text-[11px] text-zinc-400 uppercase tracking-wider font-bold hidden sm:inline">
                Guest:
              </span>
              <select
                value={guestType}
                onChange={(e) => setGuestType(e.target.value as GuestType)}
                className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer pr-2"
              >
                <option value="standard" className="bg-zinc-900 text-white">
                  Standard (Dear {"{name}"})
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
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewport("desktop")}
                className={`p-1.5 rounded-lg transition-all flex items-center gap-1 ${
                  viewport === "desktop"
                    ? "bg-stone-500 text-zinc-950 font-bold"
                    : "text-zinc-400 hover:text-white"
                }`}
                title="Desktop 1440px View"
              >
                <Monitor className="w-3.5 h-3.5" />
                <span className="text-[11px] hidden sm:inline">1440px</span>
              </button>

              <button
                type="button"
                onClick={() => setViewport("mobile")}
                className={`p-1.5 rounded-lg transition-all flex items-center gap-1 ${
                  viewport === "mobile"
                    ? "bg-stone-500 text-zinc-950 font-bold"
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

      {/* ── Main Template Container ───────────────────────────────────────── */}
      <main className="w-full flex justify-center bg-zinc-950">
        {viewport === "mobile" ? (
          <div className="my-6 max-w-[390px] w-full min-h-[844px] border-4 border-zinc-800 rounded-[44px] overflow-hidden shadow-2xl bg-zinc-950">
            <InvitationTemplate1 data={mergedData} />
          </div>
        ) : (
          <div className="w-full max-w-[1440px]">
            <InvitationTemplate1 data={mergedData} />
          </div>
        )}
      </main>
    </div>
  );
}
