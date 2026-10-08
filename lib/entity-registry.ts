import { Calendar, Heart, Store, Newspaper, ShoppingBag, Building2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type EntityKind = "event" | "fundraiser" | "business" | "article" | "product" | "organizer";

export type EntityTypeConfig = {
  kind: EntityKind;
  label: string;
  pluralLabel: string;
  description: string;
  icon: LucideIcon;
  createHref: string;
  listHref: string;
  viewHref: (id: string) => string;
  requiresOrganizer: boolean;
  enabled: boolean;
};

export const ENTITY_TYPES: Record<EntityKind, EntityTypeConfig> = {
  event: {
    kind: "event",
    label: "Event",
    pluralLabel: "Events",
    description: "Create and manage an event",
    icon: Calendar,
    createHref: "/dashboard/events/new",
    listHref: "/dashboard/events",
    viewHref: (id) => `/dashboard/events/${id}/overview`,
    requiresOrganizer: true,
    enabled: true,
  },
  fundraiser: {
    kind: "fundraiser",
    label: "Fundraiser",
    pluralLabel: "Fundraisers",
    description: "Start a fundraising campaign",
    icon: Heart,
    createHref: "/create-fundraiser",
    listHref: "/dashboard/fundraisers",
    viewHref: (id) => `/dashboard/fundraisers/${id}/overview`,
    requiresOrganizer: true,
    enabled: true,
  },
  business: {
    kind: "business",
    label: "Business",
    pluralLabel: "Businesses",
    description: "Create and manage a business",
    icon: Store,
    createHref: "/dashboard/businesses/new",
    listHref: "/dashboard/businesses",
    viewHref: (id) => `/dashboard/businesses/${id}/overview`,
    requiresOrganizer: true,
    enabled: true,
  },
  article: {
    kind: "article",
    label: "Article",
    pluralLabel: "Articles",
    description: "Publish an article",
    icon: Newspaper,
    createHref: "/dashboard/articles/new",
    listHref: "/dashboard/articles",
    viewHref: (id) => `/dashboard/articles/${id}`,
    requiresOrganizer: false,
    enabled: true,
  },
  product: {
    kind: "product",
    label: "Product",
    pluralLabel: "Products",
    description: "Create a product",
    icon: ShoppingBag,
    createHref: "/dashboard/products/new",
    listHref: "/dashboard/products",
    viewHref: (id) => `/dashboard/products/${id}/edit`,
    requiresOrganizer: true,
    enabled: true,
  },
  organizer: {
    kind: "organizer",
    label: "Organization",
    pluralLabel: "Organizations",
    description: "Manage organization",
    icon: Building2,
    createHref: "/create-organizer",
    listHref: "/dashboard/organizations",
    viewHref: (id) => `/dashboard/org/${id}/overview`,
    requiresOrganizer: false,
    enabled: false, // not shown in Create New
  },
};

export const CREATABLE_ENTITY_TYPES = Object.values(ENTITY_TYPES).filter((e) => e.enabled);
