"use client";

import React from "react";
import { ARTICLE_TEMPLATES, type ArticleTemplate } from "@/lib/article-templates";
import {
  Building2,
  HandHeart,
  Calendar,
  Sparkles,
  Megaphone,
  PenTool,
  Bot,
} from "lucide-react";

interface ArticleTemplateSelectorProps {
  onSelectBlank: () => void;
  onSelectAiAssist: () => void;
  onSelectTemplate: (template: ArticleTemplate) => void;
  selectedTemplateId?: string | null;
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Building2,
  HandHeart,
  Calendar,
  Sparkles,
  Megaphone,
};

export default function ArticleTemplateSelector({
  onSelectBlank,
  onSelectAiAssist,
  onSelectTemplate,
  selectedTemplateId,
}: ArticleTemplateSelectorProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-150 pb-3">
        <div>
          <h2 className="text-base font-black text-zinc-900">Choose Creation Mode</h2>
          <p className="text-xs font-semibold text-zinc-500">
            Start from scratch, use an editorial template, or generate an AI-assisted draft.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {/* 1. Blank Canvas */}
        <button
          type="button"
          onClick={onSelectBlank}
          className={`flex flex-col text-left p-4 rounded-2xl border transition hover:-translate-y-0.5 hover:shadow-md ${
            !selectedTemplateId
              ? "border-orange-500 bg-orange-50/50 ring-2 ring-orange-500/20"
              : "border-zinc-200 bg-white hover:border-zinc-300"
          }`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 mb-3">
            <PenTool className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-black text-zinc-900">Blank Article</h3>
          <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
            Start with an empty canvas and freeform rich-text editor.
          </p>
        </button>

        {/* 2. AI-Assisted Draft */}
        <button
          type="button"
          onClick={onSelectAiAssist}
          className="flex flex-col text-left p-4 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/60 to-purple-50/30 transition hover:-translate-y-0.5 hover:shadow-md hover:border-violet-300"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white mb-3 shadow-sm">
            <Bot className="h-5 w-5" />
          </div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-black text-violet-950">AI-Assisted Story</h3>
            <span className="rounded bg-violet-200/80 px-1.5 py-0.5 text-[9px] font-black uppercase text-violet-800">
              AI
            </span>
          </div>
          <p className="mt-1 text-xs text-violet-750 leading-relaxed">
            Provide a topic and goal; AI generates a structured starter draft.
          </p>
        </button>

        {/* 3. Pre-built Templates */}
        {ARTICLE_TEMPLATES.map((tmpl) => {
          const IconComponent = ICONS[tmpl.icon] || Sparkles;
          const isSelected = selectedTemplateId === tmpl.id;

          return (
            <button
              key={tmpl.id}
              type="button"
              onClick={() => onSelectTemplate(tmpl)}
              className={`flex flex-col text-left p-4 rounded-2xl border transition hover:-translate-y-0.5 hover:shadow-md ${
                isSelected
                  ? "border-orange-500 bg-orange-50/50 ring-2 ring-orange-500/20"
                  : "border-zinc-200 bg-white hover:border-zinc-300"
              }`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700 mb-3">
                <IconComponent className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-black text-zinc-900">{tmpl.name}</h3>
              <p className="mt-1 text-xs text-zinc-500 leading-relaxed line-clamp-2">
                {tmpl.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
