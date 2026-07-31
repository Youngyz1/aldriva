"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";

/**
 * Reusable location autocomplete input. Filters a pre-fetched suggestion list
 * as the person types, supports keyboard nav (↑/↓/Enter/Esc), and commits
 * either a picked suggestion or freely-typed text on Enter/blur-select.
 *
 * Deliberately has NO pill/trigger chrome of its own — just the input +
 * dropdown — so it can be dropped into any search surface on the platform
 * (nav search, hero search, events filter bar, etc.) and styled by whatever
 * wraps it.
 */
export default function LocationAutocomplete({
  value,
  suggestions,
  placeholder = "Location",
  onCommit,
  autoFocus,
  className = "",
}: {
  value: string;
  suggestions: string[];
  placeholder?: string;
  onCommit: (value: string) => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => setText(value), [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = (
    text.trim()
      ? suggestions.filter((s) => s.toLowerCase().includes(text.trim().toLowerCase()))
      : suggestions
  ).slice(0, 8);

  const commit = (val: string) => {
    setText(val);
    setOpen(false);
    setHighlight(-1);
    onCommit(val.trim());
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
      <input
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            commit(highlight >= 0 && filtered[highlight] ? filtered[highlight] : text);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className="w-full rounded-full border border-zinc-200 bg-white py-2.5 pl-9 pr-4 text-sm font-semibold text-zinc-950 placeholder:text-zinc-400 focus:border-orange-400 focus:outline-none"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-zinc-200 bg-white py-1.5 shadow-lg">
          {filtered.map((city, i) => (
            <li key={city}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(city)}
                className={`block w-full px-4 py-2 text-left text-sm font-semibold ${
                  i === highlight ? "bg-orange-50 text-orange-600" : "text-zinc-800 hover:bg-zinc-50"
                }`}
              >
                {city}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
