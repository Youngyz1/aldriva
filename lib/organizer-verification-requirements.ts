/**
 * lib/organizer-verification-requirements.ts
 * Configures the required & optional verification document types by organization type.
 */

export type DocRequirement = {
  type: string;
  label: string;
  description: string;
  required: boolean;
};

export const VERIFICATION_REQUIREMENTS: Record<string, DocRequirement[]> = {
  nonprofit: [
    {
      type: "registration_cert",
      label: "Registration Certificate or 501(c)(3) Letter",
      description: "Official government registration document, charity commission certificate, or tax-exemption determination letter.",
      required: true,
    },
    {
      type: "photo_id",
      label: "Photo ID of Authorized Representative",
      description: "Valid passport, driver's license, or national ID of a legal officer, director, or representative.",
      required: true,
    },
    {
      type: "ein_tax_letter",
      label: "EIN / Tax Confirmation Document",
      description: "Official IRS or national tax authority letter confirming tax ID number.",
      required: false,
    },
  ],
  church: [
    {
      type: "church_registration",
      label: "Church Registration / Letter of Standing",
      description: "Official denomination certificate of standing, religious org registration, or charter.",
      required: true,
    },
    {
      type: "photo_id",
      label: "Photo ID of Authorized Representative",
      description: "Valid passport or driver's license of senior pastor, trustee, or administrator.",
      required: true,
    },
  ],
  business: [
    {
      type: "business_license",
      label: "Business License / Certificate of Incorporation",
      description: "Official company registration, trade license, or articles of incorporation.",
      required: true,
    },
    {
      type: "photo_id",
      label: "Photo ID of Director / Owner",
      description: "Government-issued ID of legal company director or owner.",
      required: true,
    },
    {
      type: "tax_registration",
      label: "Tax Registration Document",
      description: "Official tax registration or sales tax / VAT certificate.",
      required: false,
    },
  ],
  school: [
    {
      type: "school_accreditation",
      label: "School Accreditation / Department License",
      description: "Official educational license or department of education registration document.",
      required: true,
    },
    {
      type: "photo_id",
      label: "Photo ID of School Official",
      description: "Government-issued ID of principal, dean, or authorized officer.",
      required: true,
    },
  ],
  government: [
    {
      type: "government_letterhead",
      label: "Official Government Notice or Authorization",
      description: "Official letterhead authorization or gazette publication confirming department status.",
      required: true,
    },
    {
      type: "photo_id",
      label: "Photo ID of Official Representative",
      description: "Official government credentials or passport of authorized officer.",
      required: true,
    },
  ],
  creator: [
    {
      type: "photo_id",
      label: "Government-Issued Photo ID",
      description: "Valid passport, driver's license, or national identity card.",
      required: true,
    },
  ],
  community: [
    {
      type: "photo_id",
      label: "Photo ID of Community Lead",
      description: "Valid government-issued photo ID of primary organizer.",
      required: true,
    },
    {
      type: "community_proof",
      label: "Community Proof or Overview Document",
      description: "Document describing community charter, group activities, or meeting records.",
      required: false,
    },
  ],
  restaurant: [
    {
      type: "business_license",
      label: "Food Service Permit / Business License",
      description: "Valid restaurant operating permit, health department license, or business registration.",
      required: true,
    },
    {
      type: "photo_id",
      label: "Photo ID of Owner / License Holder",
      description: "Government-issued ID of business owner or permit holder.",
      required: true,
    },
  ],
  sports_club: [
    {
      type: "club_registration",
      label: "Club Registration / League Affiliation",
      description: "Official registration certificate with sports association or local governing body.",
      required: true,
    },
    {
      type: "photo_id",
      label: "Photo ID of Representative",
      description: "Government-issued ID of club secretary, president, or administrator.",
      required: true,
    },
  ],
  other: [
    {
      type: "photo_id",
      label: "Government-Issued Photo ID",
      description: "Valid passport, driver's license, or national identity card.",
      required: true,
    },
    {
      type: "org_description_doc",
      label: "Organization Proof or Overview Document",
      description: "Any official document, utility bill, or letter describing organization operations.",
      required: false,
    },
  ],
};

export function getRequirementsForOrgType(orgType?: string | null): DocRequirement[] {
  const normalized = (orgType ?? "other").toLowerCase();
  return VERIFICATION_REQUIREMENTS[normalized] ?? VERIFICATION_REQUIREMENTS.other;
}
