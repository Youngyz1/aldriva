import { normalizeContent, type ContentDoc } from "@/lib/website-content";

type OrganizerContentSource = {
  name: string;
  bio?: string | null;
  photo?: string | null;
  contact_email?: string | null;
};

/**
 * Builds the initial content doc from the organizer row, restricted to the
 * existing hydration allowlist (lib/website-hydration.ts
 * ALLOWED_HYDRATION_FIELDS): name -> business_name, bio -> about_text,
 * photo -> logo_url, contact_email -> email. organizers has no phone/address
 * columns (those live on businesses), so those slots start empty and the
 * readiness gate blocks publish until the owner fills them. normalizeContent
 * drops everything else, so no sample keys can ever enter here.
 */
export function buildInitialContentFromOrganizer(
  organizer: OrganizerContentSource
): ContentDoc {
  return normalizeContent({
    business_name: organizer.name,
    ...(organizer.bio ? { about_text: organizer.bio } : {}),
    ...(organizer.photo ? { logo_url: organizer.photo } : {}),
    ...(organizer.contact_email ? { email: organizer.contact_email } : {}),
  });
}
