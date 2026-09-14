"use client";

import React, { useState } from "react";
import { TicketCard } from "@/components/cards/TicketCard";
import { CardEventInfo } from "@/components/cards/DigitalCardPrimitives";
import {
  Palette,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Save,
  Eye,
  Check,
} from "lucide-react";

export type TemplateType = "modern" | "concert" | "premium" | "minimal";

interface TemplateOption {
  id: TemplateType;
  name: string;
  badge: string;
  tagline: string;
  description: string;
  previewBg: string;
  swatchBg: string;
  swatchDot: string;
}

const TEMPLATE_OPTIONS: TemplateOption[] = [
  {
    id: "modern",
    name: "Modern Dark",
    badge: "Platform Default",
    tagline: "Sleek, dark card with vibrant orange accents",
    description: "Best for tech events, meetups, contemporary shows, and general fundraisers.",
    previewBg: "bg-zinc-900 border-zinc-700",
    swatchBg: "bg-zinc-900 border-zinc-700",
    swatchDot: "bg-orange-500",
  },
  {
    id: "concert",
    name: "Concert Stub",
    badge: "High Contrast",
    tagline: "Classic perforated ticket stub aesthetic",
    description: "Ideal for live music, performances, festivals, and sporting events.",
    previewBg: "bg-zinc-950 border-zinc-700",
    swatchBg: "bg-zinc-950 border-zinc-700",
    swatchDot: "bg-white",
  },
  {
    id: "premium",
    name: "VIP Gold",
    badge: "Luxury / Gala",
    tagline: "Opulent amber gradient with gold trim",
    description: "Tailored for galas, charity dinners, VIP tiers, and exclusive donor experiences.",
    previewBg: "bg-gradient-to-b from-zinc-900 via-zinc-950 to-black border-amber-500/40",
    swatchBg: "bg-gradient-to-r from-zinc-900 to-amber-950 border-amber-500/40",
    swatchDot: "bg-amber-400 ring-1 ring-amber-300",
  },
  {
    id: "minimal",
    name: "Minimal White",
    badge: "Clean & Bright",
    tagline: "Crisp white background with high-contrast print readability",
    description: "Great for daytime conferences, workshops, corporate summits, and easy at-home printing.",
    previewBg: "bg-white border-zinc-300 text-zinc-900",
    swatchBg: "bg-white border-zinc-300",
    swatchDot: "bg-orange-600",
  },
];

interface Props {
  eventId: string;
  event: CardEventInfo;
  initialTemplate: TemplateType;
}

export default function TicketDesignClient({
  eventId,
  event,
  initialTemplate,
}: Props) {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>(initialTemplate);
  const [savedTemplate, setSavedTemplate] = useState<TemplateType>(initialTemplate);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [previewTier, setPreviewTier] = useState<"general" | "vip">("vip");

  const hasUnsavedChanges = selectedTemplate !== savedTemplate;
  const currentOption = TEMPLATE_OPTIONS.find((t) => t.id === selectedTemplate) || TEMPLATE_OPTIONS[0];

  async function handleSave() {
    setSaving(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/events/${eventId}/ticket-design`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketTemplate: selectedTemplate }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFeedback({
          type: "error",
          message: data.error || "Failed to update ticket design. Please try again.",
        });
        return;
      }

      setSavedTemplate(selectedTemplate);
      setFeedback({
        type: "success",
        message: `Ticket design successfully updated to "${TEMPLATE_OPTIONS.find((t) => t.id === selectedTemplate)?.name}". All attendee passes will now render using this template.`,
      });
      setTimeout(() => setFeedback(null), 5000);
    } catch {
      setFeedback({
        type: "error",
        message: "A network error occurred. Please check your connection and try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-24 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 sm:p-2 rounded-xl bg-orange-50 text-orange-600 border border-orange-200">
              <Palette className="w-4 h-4 sm:w-5 h-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">Ticket Pass Design</h1>
          </div>
          <p className="text-xs sm:text-sm text-zinc-500 mt-1 max-w-2xl">
            Choose the visual pass template used for all attendee admission tickets, confirmation pages, and shareable digital passes.
          </p>
        </div>

        {/* Desktop Header Save Button (hidden on mobile, mobile uses sticky bottom bar) */}
        <div className="hidden sm:flex items-center gap-3 shrink-0">
          {hasUnsavedChanges && (
            <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl animate-pulse">
              Unsaved Changes
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !hasUnsavedChanges}
            className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:bg-zinc-200 disabled:text-zinc-400 text-white text-xs font-black uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-md shadow-orange-600/10 transition disabled:shadow-none"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Ticket Design</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-3 sm:p-4 rounded-2xl flex items-center gap-3 text-xs font-bold border transition ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Mobile Compact Template Selector (2x2 grid, visible on screens < lg) */}
      <div className="block lg:hidden space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-zinc-600">
            Select Template
          </h2>
          <span className="text-[11px] font-semibold text-zinc-500">
            Selected: <span className="font-bold text-zinc-900">{currentOption.name}</span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {TEMPLATE_OPTIONS.map((opt) => {
            const isSelected = selectedTemplate === opt.id;
            const isCurrentSaved = savedTemplate === opt.id;

            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelectedTemplate(opt.id)}
                className={`flex items-center gap-2 p-2.5 rounded-xl border-2 transition-all text-left relative ${
                  isSelected
                    ? "border-orange-500 bg-orange-50/50 shadow-sm ring-2 ring-orange-500/20"
                    : "border-zinc-200 bg-white hover:bg-zinc-50"
                }`}
              >
                {/* Swatch */}
                <div
                  className={`w-6 h-6 rounded-lg shrink-0 border flex items-center justify-center ${opt.swatchBg}`}
                >
                  <div className={`w-2 h-2 rounded-full ${opt.swatchDot}`} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`text-xs font-black truncate ${
                        isSelected ? "text-orange-950" : "text-zinc-800"
                      }`}
                    >
                      {opt.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {isCurrentSaved ? (
                      <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.2 rounded-md inline-flex items-center gap-0.5">
                        <Check className="w-2.5 h-2.5" /> Active
                      </span>
                    ) : (
                      <span className="text-[9px] font-semibold text-zinc-400 truncate">
                        {opt.badge}
                      </span>
                    )}
                  </div>
                </div>

                {isSelected && (
                  <div className="w-4 h-4 rounded-full bg-orange-500 text-white flex items-center justify-center shrink-0">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Short Tagline Blurb for selected template on mobile */}
        <div className="text-[11px] text-zinc-500 bg-zinc-50 border border-zinc-200/80 rounded-xl px-3 py-1.5 flex items-center justify-between">
          <span className="truncate">{currentOption.tagline}</span>
          <span className="text-[10px] font-bold text-orange-600 shrink-0 ml-2">Live Preview Below ↓</span>
        </div>
      </div>

      {/* Main Grid: Template Selector (Left) + Live Preview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Rich Desktop Template Cards (hidden on mobile, visible on lg) */}
        <div className="hidden lg:block lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wider text-zinc-700">
              Select Design Template
            </h2>
            <span className="text-xs text-zinc-400 font-semibold">4 Designs Available</span>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            {TEMPLATE_OPTIONS.map((opt) => {
              const isSelected = selectedTemplate === opt.id;
              const isCurrentSaved = savedTemplate === opt.id;

              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedTemplate(opt.id)}
                  className={`relative text-left p-4 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                    isSelected
                      ? "border-orange-500 bg-orange-50/20 shadow-md ring-2 ring-orange-500/20"
                      : "border-zinc-200 hover:border-zinc-300 bg-white hover:bg-zinc-50/50"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-4 h-4 rounded-md border flex items-center justify-center ${opt.swatchBg}`}
                        >
                          <div className={`w-1.5 h-1.5 rounded-full ${opt.swatchDot}`} />
                        </div>
                        <span
                          className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            isSelected
                              ? "bg-orange-500 text-white"
                              : "bg-zinc-100 text-zinc-600 border border-zinc-200"
                          }`}
                        >
                          {opt.badge}
                        </span>
                      </div>

                      {isCurrentSaved && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <Check className="w-3 h-3" /> Active
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-black text-zinc-900 tracking-tight">{opt.name}</h3>
                    <p className="text-xs font-semibold text-zinc-500 mt-1 leading-snug">{opt.tagline}</p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-zinc-100 text-[11px] text-zinc-400 leading-relaxed">
                    {opt.description}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Helper Callout */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 text-xs text-zinc-600 space-y-1.5">
            <p className="font-bold text-zinc-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-orange-500" />
              How attendee pass rendering works
            </p>
            <p>
              When an attendee purchases a ticket or looks up their order, their pass will automatically render in this design. Attendees will no longer see template controls, keeping the visual identity consistent with your event brand.
            </p>
          </div>
        </div>

        {/* Right Column: Live Pass Preview (full width on mobile, 6 cols on lg) */}
        <div className="lg:col-span-6 bg-zinc-950/5 rounded-2xl sm:rounded-3xl p-3 sm:p-6 border border-zinc-200 flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-3 pb-2.5 border-b border-zinc-200/80">
            <div className="flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-orange-600" />
              <span className="text-xs font-black uppercase tracking-wider text-zinc-800">
                Live Pass Preview
              </span>
            </div>

            {/* Toggle sample pass type */}
            <div className="flex items-center gap-1 bg-zinc-200/60 p-0.5 sm:p-1 rounded-xl text-[11px] sm:text-xs font-bold">
              <button
                type="button"
                onClick={() => setPreviewTier("vip")}
                className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg transition ${
                  previewTier === "vip"
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                VIP Pass
              </button>
              <button
                type="button"
                onClick={() => setPreviewTier("general")}
                className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg transition ${
                  previewTier === "general"
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                General Entry
              </button>
            </div>
          </div>

          {/* Render Actual TicketCard Preview with hardcoded allowTemplateSwitching={false} */}
          <div className="w-full max-w-sm sm:max-w-md my-1">
            <TicketCard
              qrCode="SAMPLE-ALDRIVA-PASS-9988"
              orderId="ord_sample_9847"
              event={{
                title: event.title || "Your Event Title",
                slug: event.slug,
                eventDate: event.eventDate || new Date().toISOString(),
                endDate: event.endDate,
                venue: event.venue || "Metropolitan Grand Hall",
                city: event.city || "San Francisco, CA",
                banner: event.banner,
                ticketTemplate: selectedTemplate,
              }}
              ticketName={previewTier === "vip" ? "VIP All-Access" : "General Admission"}
              price={previewTier === "vip" ? 150 : 45}
              quantity={1}
              seat={
                previewTier === "vip"
                  ? {
                      label: "Section A · Row 1 · Seat 12",
                      isVip: true,
                      section: "Section A",
                      row: "1",
                      seatNumber: "12",
                    }
                  : null
              }
              buyerName="Alex Morgan"
              buyerEmail="alex.morgan@example.com"
              status="valid"
              issuedAt={new Date().toISOString()}
              initialTemplate={selectedTemplate}
              allowTemplateSwitching={false}
            />
          </div>
        </div>
      </div>

      {/* Sticky Bottom Bar for Mobile (and responsive for desktop) */}
      <div className="fixed bottom-0 left-0 right-0 z-30 p-3 sm:p-4 bg-white/95 backdrop-blur-md border-t border-zinc-200 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-black text-zinc-900 truncate">
                {currentOption.name}
              </p>
              <p className="text-[10px] font-semibold text-zinc-500 truncate">
                {hasUnsavedChanges ? "Changes not yet saved" : "Current active design"}
              </p>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !hasUnsavedChanges}
            className="flex items-center gap-1.5 sm:gap-2 bg-orange-600 hover:bg-orange-700 disabled:bg-zinc-200 disabled:text-zinc-400 text-white text-xs font-black uppercase tracking-wider px-4 sm:px-6 py-2.5 rounded-xl shadow-md shadow-orange-600/15 transition disabled:shadow-none shrink-0"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save Design</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
