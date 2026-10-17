import { cn } from "@/lib/utils";

/** Shared fitting rules for invitation imagery, selected by its visual role. */
export type InvitationImagePresentation = "full-bleed" | "framed" | "contained" | "thumbnail";

/** Mobile gutter at the invitation page boundary for an unframed gallery. */
export type InvitationGalleryBleedGutter = 4 | 5 | 6 | 11;

const PRESENTATION_CLASSES: Record<InvitationImagePresentation, string> = {
  "full-bleed": "invitation-image--full-bleed block h-full w-full max-w-none object-cover",
  framed: "invitation-image--framed block h-full w-full max-w-full object-cover",
  contained: "invitation-image--contained block h-auto w-full max-w-full object-contain",
  thumbnail: "invitation-image--thumbnail block h-full w-full max-w-full object-cover",
};

const MOBILE_GALLERY_BLEED_CLASSES: Record<InvitationGalleryBleedGutter, string> = {
  4: "-mx-4 w-[calc(100%_+_2rem)]",
  5: "-mx-5 w-[calc(100%_+_2.5rem)]",
  6: "-mx-6 w-[calc(100%_+_3rem)]",
  11: "-mx-11 w-[calc(100%_+_5.5rem)]",
};

/**
 * Makes a natural-ratio, unframed photo gallery reach the mobile viewport
 * edges. The gutter value must match the horizontal padding between the
 * gallery and the page edge. At `sm` and above the original content gutter is
 * restored, preserving the template's desktop composition.
 */
export function invitationMobileGalleryBleedClassName(
  gutter: InvitationGalleryBleedGutter,
): string {
  return cn(MOBILE_GALLERY_BLEED_CLASSES[gutter], "sm:mx-0 sm:w-full");
}

/** Keeps captions aligned with the gallery's original mobile content gutter. */
export function invitationMobileGalleryCaptionClassName(
  gutter: InvitationGalleryBleedGutter,
): string {
  return ({
    4: "px-4 sm:px-0",
    5: "px-5 sm:px-0",
    6: "px-6 sm:px-0",
    11: "px-11 sm:px-0",
  })[gutter];
}

/**
 * Keeps image fitting consistent without changing the image loader, source,
 * parent frame, aspect ratio, or template-specific decoration.
 */
export function invitationImageClassName(
  presentation: InvitationImagePresentation,
  className?: string,
): string {
  return cn(PRESENTATION_CLASSES[presentation], className);
}
