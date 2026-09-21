"use client";

import React from "react";
import { ContactBlock, BLOCK_LIMITS } from "@/lib/website-blocks";
import { InspectorField } from "./common/InspectorField";
import { InspectorSection } from "./common/InspectorSection";

interface ContactInspectorProps {
  block: ContactBlock;
  onChange: (updated: ContactBlock) => void;
  tenantId: string;
}

export function ContactInspector({
  block,
  onChange,
}: ContactInspectorProps) {
  function update(partial: Partial<ContactBlock>) {
    onChange({ ...block, ...partial });
  }

  return (
    <div className="space-y-4">
      <InspectorSection title="Header & Introductory Text" defaultOpen>
        <InspectorField
          label="Heading"
          currentLength={block.heading?.length}
          maxLength={BLOCK_LIMITS.HEADING_MAX_LENGTH}
        >
          <input
            type="text"
            value={block.heading || ""}
            onChange={(e) => update({ heading: e.target.value })}
            placeholder="e.g. Get In Touch"
            className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
          />
        </InspectorField>

        <InspectorField
          label="Subheading"
          currentLength={block.subheading?.length}
          maxLength={BLOCK_LIMITS.SUBHEADING_MAX_LENGTH}
        >
          <input
            type="text"
            value={block.subheading || ""}
            onChange={(e) => update({ subheading: e.target.value })}
            placeholder="We would love to hear from you..."
            className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
          />
        </InspectorField>
      </InspectorSection>

      <InspectorSection title="Contact Information" defaultOpen>
        <InspectorField
          label="Email Address"
          currentLength={block.email?.length}
          maxLength={BLOCK_LIMITS.EMAIL_MAX_LENGTH}
        >
          <input
            type="email"
            value={block.email || ""}
            onChange={(e) => update({ email: e.target.value })}
            placeholder="contact@organization.org"
            className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
          />
        </InspectorField>

        <InspectorField
          label="Phone Number"
          currentLength={block.phone?.length}
          maxLength={BLOCK_LIMITS.PHONE_MAX_LENGTH}
        >
          <input
            type="tel"
            value={block.phone || ""}
            onChange={(e) => update({ phone: e.target.value })}
            placeholder="+1 (555) 123-4567"
            className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
          />
        </InspectorField>

        <InspectorField
          label="Physical Address"
          currentLength={block.address?.length}
          maxLength={BLOCK_LIMITS.ADDRESS_MAX_LENGTH}
        >
          <textarea
            rows={2}
            value={block.address || ""}
            onChange={(e) => update({ address: e.target.value })}
            placeholder="123 Community Way, Suite 400..."
            className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500 resize-y"
          />
        </InspectorField>

        <InspectorField
          label="Operating Hours"
          currentLength={block.hours?.length}
          maxLength={BLOCK_LIMITS.HOURS_MAX_LENGTH}
        >
          <input
            type="text"
            value={block.hours || ""}
            onChange={(e) => update({ hours: e.target.value })}
            placeholder="e.g. Mon-Fri: 9:00 AM - 5:00 PM"
            className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
          />
        </InspectorField>
      </InspectorSection>

      <InspectorSection title="Map Display & Location">
        <div className="flex items-center justify-between p-3 bg-zinc-50/50 dark:bg-zinc-800/30 rounded-xl border border-zinc-150 dark:border-zinc-800">
          <div>
            <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
              Display Map Widget
            </span>
            <p className="text-[11px] text-zinc-500">
              Embeds a Google Maps preview for your location.
            </p>
          </div>
          <input
            type="checkbox"
            checked={Boolean(block.showMap)}
            onChange={(e) => update({ showMap: e.target.checked })}
            className="w-4 h-4 accent-orange-600 rounded"
          />
        </div>

        {block.showMap && (
          <InspectorField
            label="Map Query / Address Search"
            currentLength={block.mapQuery?.length}
            maxLength={BLOCK_LIMITS.ADDRESS_MAX_LENGTH}
          >
            <input
              type="text"
              value={block.mapQuery || ""}
              onChange={(e) => update({ mapQuery: e.target.value })}
              placeholder="e.g. 123 Main St, Austin, TX"
              className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
            />
          </InspectorField>
        )}
      </InspectorSection>
    </div>
  );
}
