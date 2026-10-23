"use client";

import { Component, lazy, Suspense, type ComponentType, type LazyExoticComponent, type ReactNode } from "react";
import type { CustomInvitationPageComponentId } from "@/lib/invitation-template-registry";
import type { InvitationBlocksLayout } from "@/lib/invitation-template-schema";
import type { InvitationPageData } from "@/types/invitation-template";

export interface InvitationCustomPageProps {
  layout: InvitationBlocksLayout;
  data: InvitationPageData;
  children: ReactNode;
  mode: "preview" | "live" | "shared";
  isEditMode: boolean;
  wrapperClassName?: string;
}

/**
 * Explicit, code-owned imports keep template IDs from becoming module paths.
 * React.lazy keeps the bespoke composition chunk out of standard page loads;
 * Next's App Router prerenders this Client Component unless motion/UI requires
 * browser-only behavior (this template does not).
 */
const CUSTOM_INVITATION_PAGE_COMPONENTS = {
  "botanical-reverie": lazy(() =>
    import("@/components/invitation/templates/botanical-reverie/BotanicalReveriePageTemplate")
      .then((module) => ({ default: module.BotanicalReveriePageTemplate }))
  ),
  "romantic-envelope": lazy(() =>
    import("@/components/invitation/templates/romantic-envelope/RomanticEnvelopePageTemplate")
      .then((module) => ({ default: module.RomanticEnvelopePageTemplate }))
  ),
  "luxe-editorial": lazy(() =>
    import("@/components/invitation/templates/luxe-editorial/LuxeEditorialPageTemplate")
      .then((module) => ({ default: module.LuxeEditorialPageTemplate }))
  ),
  "evergreen-envelope": lazy(() =>
    import("@/components/invitation/templates/evergreen-envelope/EvergreenEnvelopePageTemplate")
      .then((module) => ({ default: module.EvergreenEnvelopePageTemplate }))
  ),
} satisfies Record<CustomInvitationPageComponentId, LazyExoticComponent<ComponentType<InvitationCustomPageProps>>>;

class InvitationTemplateErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Render only components named by the local allowlist, with a block fallback. */
export function renderCustomInvitationPage(
  componentId: CustomInvitationPageComponentId,
  props: InvitationCustomPageProps,
  fallback: ReactNode
) {
  const PageComponent = CUSTOM_INVITATION_PAGE_COMPONENTS[componentId];

  return (
    <InvitationTemplateErrorBoundary key={componentId} fallback={fallback}>
      <Suspense fallback={fallback}>
        <PageComponent {...props} />
      </Suspense>
    </InvitationTemplateErrorBoundary>
  );
}

/** Exposed for architecture tests; no runtime path is assembled from data. */
export const REGISTERED_CUSTOM_INVITATION_PAGE_IDS = Object.freeze(
  Object.keys(CUSTOM_INVITATION_PAGE_COMPONENTS) as CustomInvitationPageComponentId[]
);
