/**
 * components/dashboard/overview/CapabilityOverviewSections.tsx
 *
 * Capability-composed overview section registry.
 * Maps enabled business capabilities to priority-ordered overview sections.
 * docs/design/dashboard-overview/01-overview-anatomy.md and 03.
 */

import React from "react";
import Link from "next/link";
import type { Capability } from "@/lib/business-taxonomy";
import { ModuleSection } from "./ModuleSection";
import { BookingsSection } from "./modules/BookingsSection";
import { ServicesSection } from "./modules/ServicesSection";
import { OrdersMenuSection } from "./modules/OrdersMenuSection";
import { RestaurantModules } from "./modules/RestaurantModules";
import { ProductsSection } from "./modules/ProductsSection";
import { EventsSection } from "./modules/EventsSection";
import { FundraisingSection } from "./modules/FundraisingSection";
import { ReviewsSection } from "./modules/ReviewsSection";
import { RentalFleetSection } from "./modules/RentalFleetSection";

export interface CapabilityOverviewSectionsProps {
  organizerId: string;
  capabilities: readonly Capability[];
  fromIso: string;
  toIso: string;
  timezone: string;
  canManage?: boolean;
}

export function CapabilityOverviewSections({
  organizerId,
  capabilities,
  fromIso,
  toIso,
  timezone,
  canManage = true,
}: CapabilityOverviewSectionsProps) {
  const caps = new Set(capabilities || []);

  const hasOrdersOrMenu =
    caps.has("ORDERS") || caps.has("ONLINE_ORDERING") || caps.has("MENU");
  const hasRestaurant = caps.has("MENU") || caps.has("TABLES");
  const hasBookings = caps.has("BOOKINGS") || caps.has("APPOINTMENTS") || caps.has("RESERVATIONS");
  const hasServices = caps.has("SERVICES");
  const hasProducts = caps.has("PRODUCTS");
  const hasEvents = caps.has("EVENTS");
  const hasFundraising = caps.has("DONATIONS") || (caps as Set<string>).has("FUNDRAISING");
  const hasFleet = caps.has("VEHICLES") || caps.has("VEHICLE_RENTAL");

  const hasAnyOperationalModule =
    hasOrdersOrMenu ||
    hasRestaurant ||
    hasBookings ||
    hasServices ||
    hasProducts ||
    hasEvents ||
    hasFundraising ||
    hasFleet;

  // Generic businesses always have access to reviews/social proof
  const hasReviews = caps.has("REVIEWS") || caps.has("CUSTOMERS") || !hasAnyOperationalModule;

  return (
    <div className="space-y-8">
      {/* 1. Orders & Live Operations */}
      {hasOrdersOrMenu && (
        <ModuleSection
          key="orders_menu"
          errorTitle="Could not load Orders section"
        >
          <OrdersMenuSection
            organizerId={organizerId}
            fromIso={fromIso}
            toIso={toIso}
            canManage={canManage}
          />
        </ModuleSection>
      )}

      {/* 1b. Restaurant Operations (Kitchen Queue, Menu Catalog) */}
      {hasRestaurant && (
        <ModuleSection
          key="restaurant"
          errorTitle="Could not load Restaurant Operations section"
        >
          <RestaurantModules
            organizerId={organizerId}
            fromIso={fromIso}
            toIso={toIso}
            canManage={canManage}
          />
        </ModuleSection>
      )}

      {/* 2. Bookings & Appointments (hidden for Vehicle Rental to avoid duplicating rental bookings) */}
      {hasBookings && !hasFleet && (
        <ModuleSection
          key="bookings"
          errorTitle="Could not load Bookings section"
        >
          <BookingsSection
            organizerId={organizerId}
            fromIso={fromIso}
            toIso={toIso}
            timezone={timezone}
            canManage={canManage}
          />
        </ModuleSection>
      )}

      {/* 3. Services & Offerings Catalog */}
      {hasServices && (
        <ModuleSection
          key="services"
          errorTitle="Could not load Services section"
        >
          <ServicesSection
            organizerId={organizerId}
            canManage={canManage}
          />
        </ModuleSection>
      )}

      {/* 4. Products & Inventory */}
      {hasProducts && (
        <ModuleSection
          key="products"
          errorTitle="Could not load Products section"
        >
          <ProductsSection
            organizerId={organizerId}
            canManage={canManage}
          />
        </ModuleSection>
      )}

      {/* 5. Events & Ticketing */}
      {hasEvents && (
        <ModuleSection
          key="events"
          errorTitle="Could not load Events section"
        >
          <EventsSection
            organizerId={organizerId}
            canManage={canManage}
          />
        </ModuleSection>
      )}

      {/* 6. Fundraising & Campaigns */}
      {hasFundraising && (
        <ModuleSection
          key="fundraising"
          errorTitle="Could not load Fundraising section"
        >
          <FundraisingSection
            organizerId={organizerId}
            canManage={canManage}
          />
        </ModuleSection>
      )}

      {/* 6b. Fleet & Vehicle Rental Operations */}
      {hasFleet && (
        <ModuleSection
          key="rental_fleet"
          errorTitle="Could not load Rental Fleet section"
        >
          <RentalFleetSection
            organizerId={organizerId}
            fromIso={fromIso}
            toIso={toIso}
            timezone={timezone}
            canManage={canManage}
          />
        </ModuleSection>
      )}

      {/* 7. Generic Fallback (Unmapped & Rental Business Types) */}
      {!hasAnyOperationalModule && (
        <ModuleSection
          key="generic_fallback"
          errorTitle="Could not load Business Overview"
        >
          <div className="rounded-xl border border-zinc-200 bg-white p-6 space-y-4">
            <h2 className="text-sm font-semibold text-zinc-900">
              Workspace Overview
            </h2>
            <p className="text-sm text-zinc-600">
              Your business workspace is active. Manage your website, customize your details, and collect customer reviews directly from this dashboard.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Link
                href={`/dashboard/org/${organizerId}/website`}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-brand-800"
              >
                <span>Manage Website</span>
              </Link>
              <Link
                href={`/dashboard/org/${organizerId}/settings`}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
              >
                <span>Business Settings</span>
              </Link>
            </div>
          </div>
        </ModuleSection>
      )}

      {/* 8. Reviews & Social Proof */}
      {hasReviews && (
        <ModuleSection
          key="reviews"
          errorTitle="Could not load Reviews section"
        >
          <ReviewsSection
            organizerId={organizerId}
            canManage={canManage}
          />
        </ModuleSection>
      )}
    </div>
  );
}
