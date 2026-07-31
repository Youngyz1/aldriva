"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchableSelectProps {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  accent?: "green" | "orange";
  error?: string;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select an option...",
  accent = "green",
  error,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const filteredOptions = options.filter((option) =>
    option.toLowerCase().includes(search.toLowerCase())
  );

  const activeFocusClass =
    accent === "green"
      ? "focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
      : "focus:border-orange-500 focus:ring-4 focus:ring-orange-100";

  const hoverOptionClass =
    accent === "green"
      ? "hover:bg-emerald-50 hover:text-emerald-900"
      : "hover:bg-orange-50 hover:text-orange-900";

  const selectedClass =
    accent === "green"
      ? "bg-emerald-500 text-white hover:bg-emerald-600"
      : "bg-orange-500 text-white hover:bg-orange-600";

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left text-sm font-semibold outline-none transition",
          isOpen && (accent === "green" ? "border-emerald-500 ring-4 ring-emerald-100" : "border-orange-500 ring-4 ring-orange-100"),
          error && "border-red-500 focus:ring-red-100",
          !isOpen && activeFocusClass
        )}
      >
        <span className={cn(value ? "text-zinc-900" : "text-zinc-400")}>
          {value || placeholder}
        </span>
        <div className="flex items-center gap-1 text-zinc-400">
          {value && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="rounded-full p-0.5 hover:bg-zinc-100 hover:text-zinc-600"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isOpen && "rotate-180")} />
        </div>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-zinc-200 bg-white p-2 shadow-lg animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Search Box */}
          <div className="relative mb-2 flex items-center">
            <Search className="absolute left-3 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className={cn(
                "w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-9 pr-3 py-2 text-xs font-semibold outline-none transition focus:bg-white",
                accent === "green" ? "focus:border-emerald-500" : "focus:border-orange-500"
              )}
            />
          </div>

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto space-y-0.5 scrollbar-thin">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    onChange(opt);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "flex w-full items-center rounded-lg px-3 py-2 text-xs font-semibold text-zinc-700 transition text-left",
                    value === opt ? selectedClass : hoverOptionClass
                  )}
                >
                  {opt}
                </button>
              ))
            ) : (
              <p className="py-3 text-center text-xs font-semibold text-zinc-400">
                No matches found
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
