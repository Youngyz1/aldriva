"use client";

import type { ReactNode } from "react";
import type { InvitationBlocksLayout } from "@/lib/invitation-template-schema";
import { FallingPetalsEffect } from "@/components/invitation/animation/FallingPetalsEffect";

export function InvitationPageCanvas({
  layout,
  children,
  mode,
  isEditMode,
  wrapperClassName,
}: {
  layout: InvitationBlocksLayout;
  children: ReactNode;
  mode: "preview" | "live" | "shared";
  isEditMode: boolean;
  wrapperClassName?: string;
}) {
  const petals = layout.effects?.find((effect) => effect.type === "falling-petals");

  return (
    <div
      className={wrapperClassName ?? layout.global_theme.classes.page ?? ""}
      style={{ fontSize: `calc(100% * ${layout.global_theme.text_scale ?? 1.0})` }}
      data-page-mode={mode}
      data-edit-mode={isEditMode ? "true" : "false"}
    >
      {petals?.enabled ? <FallingPetalsEffect density={petals.density} /> : null}
      {children}
    </div>
  );
}
