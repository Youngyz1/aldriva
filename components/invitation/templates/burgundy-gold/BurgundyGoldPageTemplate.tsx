"use client";

import type { ReactNode } from "react";
import type { InvitationBlocksLayout } from "@/lib/invitation-template-schema";
import type { InvitationPageData } from "@/types/invitation-template";
import { InvitationPageCanvas } from "@/components/invitation/blocks/InvitationPageCanvas";

interface BurgundyGoldPageProps {
  layout: InvitationBlocksLayout;
  data: InvitationPageData;
  children: ReactNode;
  mode: "preview" | "live" | "shared";
  isEditMode: boolean;
  wrapperClassName?: string;
  hasAction?: boolean;
}

export function BurgundyGoldPageTemplate({
  layout,
  data,
  children,
  mode,
  isEditMode,
  wrapperClassName,
}: BurgundyGoldPageProps) {
  const coupleNames = [data.partner1Name, data.partner2Name]
    .map((name) => name?.trim())
    .filter(Boolean)
    .join(" & ") || data.hostNames?.trim() || data.title || "";
  const eyebrow = data.eyebrow?.trim() || "";
  const venues = (data.venues ?? []).filter((venue) => venue?.name?.trim() || venue?.time?.trim() || venue?.label?.trim());
  const ceremonyVenue = venues.find((venue) => /ceremon|cérémon/i.test(venue.label ?? "")) ?? venues[0] ?? null;
  const receptionVenue = venues.find((venue) => /reception|réception/i.test(venue.label ?? "")) ?? venues[1] ?? null;
  const ceremonyText = ceremonyVenue
    ? [ceremonyVenue.label || "Ceremony", ceremonyVenue.name, ceremonyVenue.time].filter(Boolean).join(" — ")
    : data.venue?.trim() || "";
  const receptionText = receptionVenue
    ? [receptionVenue.label || "Reception", receptionVenue.name, receptionVenue.time].filter(Boolean).join(" — ")
    : "";

  return (
    <InvitationPageCanvas layout={layout} mode={mode} isEditMode={isEditMode} wrapperClassName={wrapperClassName}>
      <div lang={data.locale === "fr" ? "fr" : "en"} className="min-h-screen bg-[#4a1020] px-6 py-16 text-[#f3d38a]">
        <main className="mx-auto flex max-w-2xl flex-col gap-6 text-center">
          {eyebrow ? <p className="text-sm uppercase tracking-[0.2em]">{eyebrow}</p> : null}
          {coupleNames ? <h1 className="font-serif text-4xl sm:text-5xl">{coupleNames}</h1> : null}
          {ceremonyText ? <p className="text-base sm:text-lg">{ceremonyText}</p> : null}
          {receptionText ? <p className="text-base sm:text-lg">{receptionText}</p> : null}
          <div className="hidden">{children}</div>
        </main>
      </div>
    </InvitationPageCanvas>
  );
}
