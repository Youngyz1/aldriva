/**
 * components/admin/page-strings.ts
 * Single copy file for admin list pages (English): header copy, stat
 * definitions, tab/sort options, search placeholders, empty messages.
 * JSX-free so the pure helpers stay unit-testable under node --test.
 */

import type { ReactNode } from "react";

export type StatDef = { key: string; label: string; accent?: string };

export type StatItem = { label: string; value: ReactNode; accent?: string };

export type TabDef = { value: string; label: string };

export type SortDef = { value: string; label: string };

export type AdminPageCopy = {
  eyebrow: string;
  title: string;
  description: string;
  empty: string;
  searchPlaceholder?: string;
  stats: StatDef[];
  tabs?: TabDef[];
  sortOptions?: SortDef[];
};

/**
 * Map an API stats object onto display items in definition order.
 * Null/undefined stats (still loading) yield no items so the strip
 * renders nothing; missing or null keys read as 0, never blank.
 */
export function buildStats(
  defs: StatDef[],
  values: Record<string, number | null | undefined> | null | undefined
): StatItem[] {
  if (!values) return [];
  return defs.map((d) => ({
    label: d.label,
    value: values[d.key] ?? 0,
    accent: d.accent,
  }));
}

export const pagePartStrings = {
  statsLabel: "Summary statistics",
} as const;

export const adminPageCopy: Record<
  | "users"
  | "organizers"
  | "events"
  | "fundraisers"
  | "businesses"
  | "articles"
  | "products",
  AdminPageCopy
> = {
  users: {
    eyebrow: "Admin",
    title: "Users",
    description:
      "Full user management with roles, activity filters, and bulk moderation.",
    empty: "No users match your filters.",
    searchPlaceholder: "Search by name, username, or email...",
    stats: [
      { key: "total", label: "Total Users" },
      { key: "active", label: "Active Users" },
      { key: "suspended", label: "Suspended" },
      { key: "admins", label: "Admins" },
      { key: "organizers", label: "Organizations" },
    ],
  },
  organizers: {
    eyebrow: "Admin",
    title: "Organizations",
    description:
      "Moderate organization profiles with search, filters, and bulk actions.",
    empty: "No organizations match your filters.",
    searchPlaceholder: "Search organizations...",
    stats: [
      { key: "pending", label: "Pending" },
      { key: "verified", label: "Verified" },
      { key: "suspended", label: "Suspended" },
      { key: "rejected", label: "Rejected" },
      { key: "total", label: "Total" },
    ],
  },
  events: {
    eyebrow: "Admin",
    title: "Events",
    description:
      "Moderate and feature events. Category filter uses canonical event taxonomy.",
    empty: "No events found.",
    stats: [
      { key: "total", label: "Total" },
      { key: "approved", label: "Approved" },
      { key: "pending", label: "Pending" },
      { key: "featured", label: "Featured" },
    ],
  },
  fundraisers: {
    eyebrow: "Admin",
    title: "Fundraisers",
    description:
      "Feature campaigns and manage fundraiser settings including backdating.",
    empty: "No fundraisers match your filters.",
    searchPlaceholder: "Search fundraisers...",
    stats: [
      { key: "total", label: "Total" },
      { key: "pending_review", label: "Pending" },
      { key: "featured", label: "Featured" },
      { key: "results", label: "Results" },
    ],
    tabs: [
      { value: "all", label: "All" },
      { value: "pending_review", label: "Pending" },
      { value: "published", label: "Published" },
      { value: "rejected", label: "Rejected" },
    ],
    sortOptions: [
      { value: "newest", label: "Newest First" },
      { value: "oldest", label: "Oldest First" },
      { value: "alphabetical", label: "Alphabetical" },
      { value: "most_raised", label: "Most Raised" },
      { value: "featured", label: "Featured First" },
    ],
  },
  businesses: {
    eyebrow: "Admin",
    title: "Businesses",
    description:
      "Moderate business listings across all users, manage visibility, and flag spam or policy violations.",
    empty: "No businesses found.",
    searchPlaceholder: "Search businesses by name or owner...",
    stats: [
      { key: "total", label: "Total Listings" },
      { key: "pending_review", label: "Pending Review", accent: "text-amber-600" },
      { key: "active", label: "Active", accent: "text-emerald-600" },
      { key: "featured", label: "Featured", accent: "text-orange-500" },
      { key: "rejected", label: "Rejected", accent: "text-red-600" },
      { key: "flagged", label: "Flagged", accent: "text-red-700" },
    ],
    tabs: [
      { value: "all", label: "All" },
      { value: "pending_review", label: "Pending Review" },
      { value: "active", label: "Active" },
      { value: "rejected", label: "Rejected" },
      { value: "archived", label: "Archived" },
      { value: "flagged", label: "Flagged" },
    ],
  },
  articles: {
    eyebrow: "Admin",
    title: "Articles",
    description:
      "Moderate editorial articles across all users with search, filters, and moderation actions.",
    empty: "No articles found.",
    searchPlaceholder: "Search articles by title or author...",
    stats: [
      { key: "total", label: "Total Articles" },
      { key: "pending_review", label: "Pending Review", accent: "text-amber-600" },
      { key: "published", label: "Published", accent: "text-emerald-600" },
      { key: "draft", label: "Drafts", accent: "text-zinc-500" },
      { key: "scheduled", label: "Scheduled", accent: "text-blue-600" },
      { key: "rejected", label: "Rejected", accent: "text-red-600" },
    ],
    tabs: [
      { value: "all", label: "All" },
      { value: "pending_review", label: "Pending Review" },
      { value: "published", label: "Published" },
      { value: "draft", label: "Draft" },
      { value: "scheduled", label: "Scheduled" },
      { value: "rejected", label: "Rejected" },
    ],
  },
  products: {
    eyebrow: "Admin",
    title: "Products",
    description:
      "Moderate product listings across all users with search, filters, and moderation actions.",
    empty: "No products found.",
    searchPlaceholder: "Search products by name or owner...",
    stats: [
      { key: "total", label: "Total Products" },
      { key: "pending_review", label: "Pending Review", accent: "text-amber-600" },
      { key: "active", label: "Active", accent: "text-emerald-600" },
      { key: "out_of_stock", label: "Out of Stock", accent: "text-amber-600" },
      { key: "rejected", label: "Rejected", accent: "text-red-600" },
    ],
    tabs: [
      { value: "all", label: "All" },
      { value: "pending_review", label: "Pending Review" },
      { value: "active", label: "Active" },
      { value: "out_of_stock", label: "Out of Stock" },
      { value: "rejected", label: "Rejected" },
      { value: "archived", label: "Archived" },
    ],
  },
};
