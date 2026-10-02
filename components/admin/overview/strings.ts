/**
 * components/admin/overview/strings.ts
 * Single copy file for the admin Overview page (English; extracted for
 * later i18n). No user-facing string for this page lives anywhere else.
 */

export const overviewStrings = {
  eyebrow: "Admin",
  title: "Overview",
  subtitle: "Live platform activity across the selected range.",

  rangeLabel: "Date range",
  ranges: [
    { value: "today", label: "Today" },
    { value: "7d", label: "7d" },
    { value: "30d", label: "30d" },
    { value: "90d", label: "90d" },
  ] as const,
  compareLabel: "Compare to previous period",

  figuresTitle: "Key figures",
  newUsers: "New users",
  volume: "Fundraising volume",
  newFundraisers: "New fundraisers",
  newEvents: "New events",
  vsPrevious: (delta: string) => `vs previous period: ${delta}`,
  newNeverBefore: "no prior period activity",

  chartTitle: "Donation volume",
  chartEmpty: "No donations in this range yet.",
  chartSummary: (current: string, previous: string) =>
    `Donation volume ${current} in the selected period, ${previous} in the previous period.`,

  attentionTitle: "Needs attention",
  attentionEmpty: "Nothing needs your attention.",
  pendingOrganizers: "Pending organizations",
  pendingArticles: "Pending articles",
  pendingIdentity: "Pending identity verifications",
  flaggedBusinesses: "Flagged businesses",
  pendingPayouts: "Pending payouts",
  pendingPayoutsHint: "opens the payout queue",

  recentTitle: "Recent submissions",
  recentEmpty: "No submissions yet.",
  recentKinds: {
    user: "User",
    organizer: "Organization",
    event: "Event",
    fundraiser: "Fundraiser",
    article: "Article",
  } as const,

  topFundraisersTitle: "Top fundraisers",
  newestOrganizersTitle: "Newest organizations",
  raisedOf: (raised: string, goal: string) => `${raised} of ${goal}`,
  emptyList: "Nothing here yet.",
} as const;

export type OverviewRange = "today" | "7d" | "30d" | "90d";

export const OVERVIEW_RANGES: readonly OverviewRange[] = [
  "today",
  "7d",
  "30d",
  "90d",
];

export function parseRange(raw: string | string[] | undefined): OverviewRange {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (OVERVIEW_RANGES as readonly string[]).includes(v ?? "")
    ? (v as OverviewRange)
    : "30d";
}

export function parseCompare(raw: string | string[] | undefined): boolean {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v !== "0";
}
