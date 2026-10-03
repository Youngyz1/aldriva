"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronDown, Check } from "lucide-react";

export type EventSwitcherItem = { id: string; title: string; status?: string | null };

export default function EventSwitcher({ currentId, items, variant = "dark" }: { currentId: string; items: EventSwitcherItem[]; variant?: "dark" | "light" }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = items.find((i) => i.id === currentId) ?? { id: currentId, title: "Select event" };

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function navigateTo(id: string) {
    setOpen(false);
    if (id === currentId) return;
    if (pathname) {
      const match = pathname.match(/^\/dashboard\/events\/[^/]+(\/.*)?$/);
      const suffix = match?.[1] ?? "/overview";
      router.push(`/dashboard/events/${id}${suffix}`);
    } else {
      router.push(`/dashboard/events/${id}/overview`);
    }
  }

  const isLight = variant === "light";
  if (items.length === 0) {
    return (
      <div className={isLight ? "rounded-xl border border-zinc-200 bg-white p-3" : "rounded-xl bg-white/10 p-3"}>
        <p className={isLight ? "text-[11px] font-bold uppercase tracking-wider text-zinc-400" : "text-[11px] font-bold uppercase tracking-wider text-white/60"}>Event</p>
        <p className={isLight ? "mt-1 truncate text-sm font-black text-zinc-900" : "mt-1 truncate text-sm font-black text-white"}>{current.title}</p>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={
          isLight
            ? "flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white p-3 text-left shadow-xs hover:bg-zinc-50"
            : "flex w-full items-center justify-between gap-2 rounded-xl bg-white/10 p-3 text-left hover:bg-white/15"
        }
      >
        <div className="min-w-0 flex-1">
          <p className={isLight ? "text-[11px] font-bold uppercase tracking-wider text-zinc-400" : "text-[11px] font-bold uppercase tracking-wider text-white/60"}>Event</p>
          <p className={isLight ? "mt-1 truncate text-sm font-black text-zinc-900" : "mt-1 truncate text-sm font-black text-white"}>{current.title}</p>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""} ${isLight ? "text-zinc-400" : "text-white/70"}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-50 mt-2 max-h-72 overflow-auto rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
          <div className="px-3 py-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Switch Event</p>
          </div>
          {items.map((item) => {
            const isActive = item.id === currentId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTo(item.id)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50 ${isActive ? "bg-zinc-50 font-semibold text-zinc-900" : "text-zinc-700"}`}
              >
                <span className="min-w-0 truncate">{item.title}</span>
                {isActive && <Check className="h-4 w-4 shrink-0 text-brand-700" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
