/**
 * components/site/blocks/rental/types.ts
 *
 * Types for Vehicle Rental website V2 storefront blocks.
 */

import type { PublicRentalCategory, PublicRentalBranch } from "@/lib/actions/rental-public";
import type { RentalSettings } from "@/lib/actions/rental-settings";

export interface StorefrontRentalConfig {
  enabled: boolean;
  organizerId: string;
  businessId: string;
  businessName: string;
  siteSlug: string;
  currency: string;
  settings: RentalSettings;
  categories: PublicRentalCategory[];
  branches: PublicRentalBranch[];
}
