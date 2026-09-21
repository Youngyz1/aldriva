"use client";

import { useState } from "react";
import { Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { WEBSITE_TEMPLATES, type WebsiteTemplateCategory } from "@/lib/website-templates";

type Props = {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUse: (id: string) => void;
  using?: boolean;
};

const CATEGORIES: Array<{ id: WebsiteTemplateCategory | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "business", label: "Business" },
  { id: "restaurant", label: "Restaurant" },
  { id: "retail", label: "Retail" },
  { id: "service", label: "Service" },
  { id: "creative", label: "Creative" },
  { id: "organization", label: "Organization" },
];

export function TemplateGallery({ selectedId, onSelect, onUse, using }: Props) {
  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");

  const filtered = WEBSITE_TEMPLATES.filter((t) => {
    const catOk = category === "all" || t.category === category;
    const qOk = !query || t.name.toLowerCase().includes(query.toLowerCase()) || t.description.toLowerCase().includes(query.toLowerCase());
    return catOk && qOk;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition border",
                category === c.id ? "bg-primary text-primary-foreground border-primary" : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input placeholder="Search templates..." value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((tpl) => {
          const selected = selectedId === tpl.id;
          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onSelect(tpl.id)}
              className={cn(
                "group text-left rounded-xl border bg-white overflow-hidden transition shadow-xs hover:shadow-sm flex flex-col",
                selected ? "border-primary ring-1 ring-primary" : "border-zinc-200 hover:border-zinc-300"
              )}
            >
              <div className="h-32 w-full relative overflow-hidden flex flex-col" style={{ backgroundColor: tpl.previewColor }}>
                {/* miniature block wireframe using existing block types */}
                <div className="flex-1 flex flex-col gap-1 p-3">
                  {tpl.defaultBlocks.slice(0, 4).map((b, i) => (
                    <div
                      key={i}
                      className={`rounded-sm bg-white/90 ${b.type === "hero" ? "h-8" : b.type === "gallery" ? "h-6 flex gap-1 p-1" : "h-4"}`}
                      style={{ opacity: 0.9 - i * 0.15 }}
                    >
                      {b.type === "gallery" && (
                        <>
                          <span className="flex-1 rounded-[2px] bg-white" />
                          <span className="flex-1 rounded-[2px] bg-white" />
                          <span className="flex-1 rounded-[2px] bg-white" />
                        </>
                      )}
                      {b.type === "features" && <span className="block h-full w-full rounded-[2px] bg-white" />}
                    </div>
                  ))}
                </div>
                <div className="bg-white/95 backdrop-blur px-3 py-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-900 truncate">{tpl.name}</span>
                  <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{tpl.category}</span>
                </div>
                {selected && (
                  <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-primary shadow">
                    <Check className="h-4 w-4" />
                  </span>
                )}
              </div>
              <div className="flex-1 p-4 flex flex-col">
                <h3 className="text-sm font-semibold text-zinc-900">{tpl.name}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">{tpl.description}</p>
                <div className="mt-3 flex items-center gap-2">
                  <Badge variant="neutral" size="sm" className="capitalize">
                    {tpl.style}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{tpl.defaultBlocks.length} sections</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedId && (
        <div className="sticky bottom-4 flex justify-end">
          <Button size="lg" disabled={!!using} onClick={() => onUse(selectedId)}>
            {using ? "Applying..." : "Use this template"}
          </Button>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-200 p-8 text-center text-sm text-muted-foreground">No templates match your filters.</div>
      )}
    </div>
  );
}
