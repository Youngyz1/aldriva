"use client";

import React, { useState } from "react";
import { Mail, CheckCircle2, AlertCircle, Loader2, Sparkles, Save, Eye, Check, Filter } from "lucide-react";
import { InvitationTemplate, INVITATION_CATEGORIES } from "@/lib/invitation-types";
import { InvitationCardRenderer } from "@/components/invitation/InvitationCardRenderer";

interface Props {
  eventId: string;
  event: {
    title: string;
    slug: string;
    eventDate: string | null;
    endDate: string | null;
    venue: string | null;
    city: string | null;
    banner: string | null;
  };
  templates: InvitationTemplate[];
  initialTemplateId: string | null;
}

export default function InvitationDesignClient({
  eventId,
  event,
  templates,
  initialTemplateId,
}: Props) {
  const [selectedId, setSelectedId] = useState<string>(initialTemplateId || templates[0]?.id || "");
  const [savedId, setSavedId] = useState<string>(initialTemplateId || templates[0]?.id || "");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [previewTier, setPreviewTier] = useState<"vip" | "standard">("vip");
  const [showCustomNote, setShowCustomNote] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const selectedTemplate = templates.find((t) => t.id === selectedId || t.slug === selectedId) || templates[0];
  const hasUnsavedChanges = selectedId !== savedId;

  const filteredTemplates =
    selectedCategory === "All"
      ? templates
      : templates.filter((t) => t.category === selectedCategory);

  async function handleSave() {
    setSaving(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/events/${eventId}/invitation-design`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationTemplateId: selectedTemplate.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFeedback({
          type: "error",
          message: data.error || "Failed to update invitation template. Please try again.",
        });
        return;
      }

      setSavedId(selectedTemplate.id);
      setFeedback({
        type: "success",
        message: `Invitation design updated to "${selectedTemplate.name}". All sent invitations and RSVP cards will now render with this template.`,
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
            <span className="p-1.5 sm:p-2 rounded-xl bg-purple-50 text-purple-600 border border-purple-200">
              <Mail className="w-4 h-4 sm:w-5 sm:h-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
              Invitation Card Design
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-zinc-500 mt-1 max-w-2xl">
            Choose the artwork template for your event invitations. Sent invitation emails and public RSVP passes will render using this design.
          </p>
        </div>

        {/* Desktop Save Button */}
        <div className="hidden sm:flex items-center gap-3 shrink-0">
          {hasUnsavedChanges && (
            <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl animate-pulse">
              Unsaved Changes
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !hasUnsavedChanges}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-200 disabled:text-zinc-400 text-white text-xs font-black uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-md shadow-purple-600/10 transition disabled:shadow-none"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Invitation Design</span>
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

      {/* Category Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs font-bold">
        <span className="text-zinc-400 flex items-center gap-1 shrink-0 mr-1 text-[11px] uppercase tracking-wider">
          <Filter className="w-3 h-3" /> Category:
        </span>
        <button
          type="button"
          onClick={() => setSelectedCategory("All")}
          className={`px-3 py-1.5 rounded-xl transition shrink-0 ${
            selectedCategory === "All"
              ? "bg-zinc-900 text-white shadow-sm"
              : "bg-zinc-100 hover:bg-zinc-200 text-zinc-600"
          }`}
        >
          All ({templates.length})
        </button>
        {INVITATION_CATEGORIES.map((cat) => {
          const count = templates.filter((t) => t.category === cat).length;
          if (count === 0) return null;
          const isCatSelected = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl transition shrink-0 ${
                isCatSelected
                  ? "bg-purple-600 text-white shadow-sm"
                  : "bg-zinc-100 hover:bg-zinc-200 text-zinc-600"
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Mobile Compact Template Selector (2x2 / 3x2 grid, visible on screens < lg) */}
      <div className="block lg:hidden space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-zinc-600">
            Select Template
          </h2>
          <span className="text-[11px] font-semibold text-zinc-500">
            Selected: <span className="font-bold text-zinc-900">{selectedTemplate.name}</span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {filteredTemplates.map((tpl) => {
            const isSelected = selectedTemplate.id === tpl.id;
            const isCurrentSaved = savedId === tpl.id;
            const primaryColor = tpl.layout_config.colorPalette.primary || "#d4af37";

            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => setSelectedId(tpl.id)}
                className={`flex items-center gap-2 p-2.5 rounded-xl border-2 transition-all text-left relative ${
                  isSelected
                    ? "border-purple-500 bg-purple-50/50 shadow-sm ring-2 ring-purple-500/20"
                    : "border-zinc-200 bg-white hover:bg-zinc-50"
                }`}
              >
                {/* Swatch */}
                <div
                  className="w-6 h-6 rounded-lg shrink-0 border border-white/20 flex items-center justify-center shadow-inner"
                  style={{
                    backgroundColor: tpl.layout_config.colorPalette.background || "#09090b",
                  }}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full ring-1 ring-white/30 shadow-xs"
                    style={{ backgroundColor: primaryColor }}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <span
                    className={`text-xs font-black truncate block ${
                      isSelected ? "text-purple-950" : "text-zinc-800"
                    }`}
                  >
                    {tpl.name}
                  </span>
                  <div className="flex items-center gap-1 mt-0.5">
                    {isCurrentSaved ? (
                      <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.2 rounded-md inline-flex items-center gap-0.5">
                        <Check className="w-2.5 h-2.5" /> Active
                      </span>
                    ) : (
                      <span className="text-[9px] font-semibold text-zinc-400 truncate">
                        {tpl.category}
                      </span>
                    )}
                  </div>
                </div>

                {isSelected && (
                  <div className="w-4 h-4 rounded-full bg-purple-600 text-white flex items-center justify-center shrink-0">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Short Tagline Blurb for selected template on mobile */}
        <div className="text-[11px] text-zinc-500 bg-zinc-50 border border-zinc-200/80 rounded-xl px-3 py-1.5 flex items-center justify-between">
          <span className="truncate">
            Font: <strong className="text-zinc-700">{selectedTemplate.layout_config.typography.titleFont}</strong> · Theme: <strong className="text-zinc-700">{selectedTemplate.category}</strong>
          </span>
          <span className="text-[10px] font-bold text-purple-600 shrink-0 ml-2">Live Preview Below ↓</span>
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
            <span className="text-xs text-zinc-400 font-semibold">{filteredTemplates.length} Available</span>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            {filteredTemplates.map((tpl) => {
              const isSelected = selectedTemplate.id === tpl.id;
              const isCurrentSaved = savedId === tpl.id;
              const primaryColor = tpl.layout_config.colorPalette.primary || "#d4af37";

              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => setSelectedId(tpl.id)}
                  className={`relative text-left p-4 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                    isSelected
                      ? "border-purple-500 bg-purple-50/20 shadow-md ring-2 ring-purple-500/20"
                      : "border-zinc-200 hover:border-zinc-300 bg-white hover:bg-zinc-50/50"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-md border border-white/20 flex items-center justify-center shadow-xs"
                          style={{
                            backgroundColor: tpl.layout_config.colorPalette.background || "#09090b",
                          }}
                        >
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: primaryColor }} />
                        </div>
                        <span
                          className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            isSelected
                              ? "bg-purple-600 text-white"
                              : "bg-zinc-100 text-zinc-600 border border-zinc-200"
                          }`}
                        >
                          {tpl.category}
                        </span>
                      </div>

                      {isCurrentSaved && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <Check className="w-3 h-3" /> Active
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-black text-zinc-900 tracking-tight">{tpl.name}</h3>
                    <p className="text-xs font-semibold text-zinc-500 mt-1 leading-snug">
                      Typography: {tpl.layout_config.typography.titleFont} + {tpl.layout_config.typography.bodyFont}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-zinc-100 text-[11px] text-zinc-400 flex items-center justify-between">
                    <span>1200 × 630 PNG Card</span>
                    <span className="font-bold text-purple-600">Select →</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Helper Callout */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 text-xs text-zinc-600 space-y-1.5">
            <p className="font-bold text-zinc-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-purple-600" />
              How invitation card rendering works
            </p>
            <p>
              When you invite a VIP or guest, the platform generates a custom high-resolution PNG invitation card using this template, embeds it in the invite email, and presents it on the recipient&apos;s digital RSVP portal.
            </p>
          </div>
        </div>

        {/* Right Column: Live Card Preview (full width on mobile, 6 cols on lg) */}
        <div className="lg:col-span-6 bg-zinc-950/5 rounded-2xl sm:rounded-3xl p-3 sm:p-6 border border-zinc-200 flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-3 pb-2.5 border-b border-zinc-200/80">
            <div className="flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-black uppercase tracking-wider text-zinc-800">
                Live Card Preview
              </span>
            </div>

            {/* Toggle sample guest type */}
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
                VIP Guest
              </button>
              <button
                type="button"
                onClick={() => setPreviewTier("standard")}
                className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg transition ${
                  previewTier === "standard"
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                Guest
              </button>
              <button
                type="button"
                onClick={() => setShowCustomNote((prev) => !prev)}
                className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg transition ${
                  showCustomNote
                    ? "bg-purple-100 text-purple-800"
                    : "text-zinc-400 hover:text-zinc-600"
                }`}
              >
                {showCustomNote ? "Note: On" : "Note: Off"}
              </button>
            </div>
          </div>

          {/* Render Actual InvitationCardRenderer Preview */}
          <div className="w-full my-1">
            <InvitationCardRenderer
              template={selectedTemplate}
              data={{
                eventTitle: event.title || "Exclusive Event Title",
                guestName: previewTier === "vip" ? "Hon. Eleanor Vance" : "Alex Morgan",
                guestTitle: previewTier === "vip" ? "Keynote Speaker" : null,
                organization: previewTier === "vip" ? "Global Tech Foundation" : null,
                eventDate: event.eventDate || new Date().toISOString(),
                venue: event.venue || "Grand Ballroom",
                city: event.city || "San Francisco, CA",
                customMessage: showCustomNote
                  ? "We would be deeply honored by your presence at our celebration."
                  : null,
                headerBadgeText: previewTier === "vip" ? "VIP GUEST INVITATION" : "OFFICIAL INVITATION",
              }}
              scale={1}
            />
          </div>

          <div className="w-full mt-3 pt-2.5 border-t border-zinc-200/80 flex items-center justify-between text-[11px] text-zinc-500">
            <span>Render Mode: Satori / Next-OG Vector Layout</span>
            <span className="font-semibold text-zinc-700">1200 × 630 Ratio (1.91:1)</span>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Bar for Mobile & Desktop */}
      <div className="fixed bottom-0 left-0 right-0 z-30 p-3 sm:p-4 bg-white/95 backdrop-blur-md border-t border-zinc-200 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-3 h-3 rounded-full shrink-0 shadow-xs"
              style={{ backgroundColor: selectedTemplate.layout_config.colorPalette.primary || "#9333ea" }}
            />
            <div className="min-w-0">
              <p className="text-xs font-black text-zinc-900 truncate">
                {selectedTemplate.name} ({selectedTemplate.category})
              </p>
              <p className="text-[10px] font-semibold text-zinc-500 truncate">
                {hasUnsavedChanges ? "Changes not yet saved" : "Current active invitation template"}
              </p>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !hasUnsavedChanges}
            className="flex items-center gap-1.5 sm:gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-200 disabled:text-zinc-400 text-white text-xs font-black uppercase tracking-wider px-4 sm:px-6 py-2.5 rounded-xl shadow-md shadow-purple-600/15 transition disabled:shadow-none shrink-0"
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
