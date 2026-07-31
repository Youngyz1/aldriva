"use client";

/**
 * components/HomepageAccordion.tsx
 * Accordion for the About section — replaces the always-visible
 * service grid with collapsible cards. Only one open at a time.
 *
 * Props match AboutService but without `position` (handled by parent).
 */

import { useState } from "react";
import { Plus, Minus } from "lucide-react";

export interface AccordionService {
  icon:        React.ReactNode;
  title:       string;
  description: string;
}

interface HomepageAccordionProps {
  services: AccordionService[];
}

export default function HomepageAccordion({ services }: HomepageAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="space-y-2">
      {services.map((svc, i) => {
        const isOpen = openIndex === i;
        return (
          <div
            key={svc.title}
            className={`rounded-xl border transition-all duration-200 ${
              isOpen
                ? "border-orange-500 border-l-4 bg-orange-50/60"
                : "border-zinc-200 bg-white hover:border-zinc-300"
            }`}
          >
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
            >
              {/* Icon */}
              <span
                className={`flex-shrink-0 p-2 rounded-lg transition-colors ${
                  isOpen
                    ? "bg-orange-100 text-orange-600"
                    : "bg-zinc-100 text-zinc-500"
                }`}
              >
                {svc.icon}
              </span>

              {/* Title */}
              <span
                className={`flex-1 text-sm transition-colors ${
                  isOpen ? "font-black text-orange-600" : "font-bold text-zinc-800"
                }`}
              >
                {svc.title}
              </span>

              {/* Toggle indicator */}
              <span
                className={`flex-shrink-0 transition-colors ${
                  isOpen ? "text-orange-600" : "text-zinc-400"
                }`}
              >
                {isOpen ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              </span>
            </button>

            {/* Expandable body — CSS max-height transition */}
            <div
              className="overflow-hidden transition-all duration-300 ease-in-out"
              style={{ maxHeight: isOpen ? "200px" : "0px", opacity: isOpen ? 1 : 0 }}
            >
              <p className="px-4 pb-4 pt-0 text-sm text-zinc-600 leading-relaxed pl-[3.75rem]">
                {svc.description}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
