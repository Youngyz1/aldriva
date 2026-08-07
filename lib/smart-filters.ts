import type { FundraiserSmartFilter } from "@/lib/fundraiser-data";

/**
 * Browse options for campaign discovery. These filter by campaign *status /
 * activity* (how close to goal, how new, how much momentum), which is a
 * different axis from campaign category (Medical, Charity, …) — categories
 * classify what a campaign is for, these describe where it currently stands.
 *
 * Each value maps to real ranking logic in getFundraiserList's `smartFilter`.
 * Single source of truth for both the dropdown (ShowcaseControls) and the
 * /fundraisers browse heading, so the two can't drift apart.
 */
export type SmartFilterOption = {
  value: FundraiserSmartFilter;
  /** Short label for the dropdown. */
  label: string;
  /** Page heading when this option is active. */
  heading: string;
  /** Page subheading explaining what the option actually selects for. */
  description: string;
};

export const SMART_FILTER_OPTIONS: readonly SmartFilterOption[] = [
  {
    value: "all",
    label: "Browse all",
    heading: "All campaigns",
    description: "Every live campaign on Aldriva.",
  },
  {
    value: "close-to-target",
    label: "Close to target",
    heading: "Close to target",
    description: "Campaigns within reach of their goal — a final push gets them there.",
  },
  {
    value: "just-launched",
    label: "Just launched",
    heading: "Just launched",
    description: "Recently started campaigns looking for their first supporters.",
  },
  {
    value: "needs-momentum",
    label: "Needs momentum",
    heading: "Needs momentum",
    description: "Campaigns that have stalled and need visibility to get moving again.",
  },
  {
    value: "trending",
    label: "Trending",
    heading: "Trending now",
    description: "Campaigns drawing the most donation activity right now.",
  },
] as const;

/** Narrows an untrusted query-param string to a valid browse option. */
export function resolveSmartFilter(value: string | undefined): SmartFilterOption {
  return (
    SMART_FILTER_OPTIONS.find((option) => option.value === value) ??
    SMART_FILTER_OPTIONS[0]
  );
}
