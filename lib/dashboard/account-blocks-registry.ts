/**
 * lib/dashboard/account-blocks-registry.ts
 *
 * Account Home (/dashboard) Block Registry:
 * The page is composed from what the user actually has.
 *
 * Blocks in priority order:
 * 1. needs_attention: pending requests per organizer, events in next 7 days, unfinished drafts.
 *    Hidden entirely when there is nothing to act on.
 * 2. workspaces: cards with name, type chip, ONE number by type (pending requests / upcoming events / amount raised)
 *    and an Open button. Quiet workspaces still show, with a calm number like "0 pending". Max 4, then "All workspaces".
 * 3. events: max 3 rows + "View all". Group blank "Untitled" drafts into one "Drafts (N)" row.
 * 4. fundraisers: max 3 rows + "View all".
 * 5. articles: max 3 rows + "View all".
 * 6. products: max 3 rows + "View all".
 * 7. supporting: donations made and tickets bought, compact, max 3 + "View all".
 * 8. start_something: small row suggesting only the types the user has NOT used yet.
 *
 * Scaling rules:
 * - No block renders empty.
 * - Exactly 1 item shows directly with no "View all".
 * - More than 3 shows 3 + "View all" (for workspaces: max 4, then "All workspaces").
 * - A brand-new account shows ONE onboarding card instead of any blocks.
 */

export type AccountBlockKey =
  | "needs_attention"
  | "workspaces"
  | "events"
  | "fundraisers"
  | "articles"
  | "products"
  | "supporting"
  | "start_something";

export const ACCOUNT_BLOCK_ORDER: readonly AccountBlockKey[] = [
  "needs_attention",
  "workspaces",
  "events",
  "fundraisers",
  "articles",
  "products",
  "supporting",
  "start_something",
] as const;

export type AttentionItem = {
  id: string;
  category: "pending_request" | "upcoming_event" | "draft";
  title: string;
  detail: string;
  badge: string;
  href: string;
  urgent?: boolean;
};

export type WorkspaceItem = {
  id: string;
  name: string;
  typeChip: string;
  statLabel: string;
  href: string;
  isBusiness?: boolean;
};

export type EventItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  status: string;
  kind?: string | null;
  created_at: string;
  event_date?: string | null;
  href: string;
  isDraftGroup?: boolean;
  draftCount?: number;
};

export type FundraiserItem = {
  id: string;
  title: string;
  slug?: string | null;
  status: string;
  raisedAmount: number;
  targetAmount?: number | null;
  currency?: string;
  created_at: string;
  href: string;
};

export type ArticleItem = {
  id: string;
  title: string;
  slug?: string | null;
  status: string;
  created_at: string;
  href: string;
};

export type ProductItem = {
  id: string;
  name: string;
  slug?: string | null;
  status: string;
  created_at: string;
  href: string;
};

export type SupportingItem = {
  id: string;
  type: "ticket" | "donation";
  title: string;
  detail: string;
  status?: string | null;
  created_at: string;
  href: string;
};

export type CreatableTypeKey =
  | "event"
  | "fundraiser"
  | "workspace"
  | "business"
  | "article"
  | "product";

export type StartSuggestion = {
  key: CreatableTypeKey;
  label: string;
  description: string;
  href: string;
  iconName: string;
};

export interface AccountDashboardData {
  user: {
    id: string;
    displayName: string;
    email?: string | null;
  };
  attentionItems: AttentionItem[];
  workspaces: WorkspaceItem[];
  events: EventItem[];
  fundraisers: FundraiserItem[];
  articles: ArticleItem[];
  products: ProductItem[];
  supporting: SupportingItem[];
  startSuggestions: StartSuggestion[];
  hasAnyContent: boolean;
}

export const ALL_START_SUGGESTIONS: readonly StartSuggestion[] = [
  {
    key: "event",
    label: "Host an Event",
    description: "Sell tickets or send private digital invitations",
    href: "/dashboard/events/new",
    iconName: "Calendar",
  },
  {
    key: "fundraiser",
    label: "Start a Campaign",
    description: "Raise funds for a personal or charitable cause",
    href: "/create-fundraiser",
    iconName: "Heart",
  },
  {
    key: "workspace",
    label: "Create an Organization",
    description: "Set up a shared team workspace",
    href: "/create-organizer",
    iconName: "Building2",
  },
  {
    key: "business",
    label: "List a Business",
    description: "Set up dining, services, or appointments",
    href: "/dashboard/businesses/new",
    iconName: "Store",
  },
  {
    key: "article",
    label: "Publish an Article",
    description: "Share editorial stories and updates",
    href: "/dashboard/articles/new",
    iconName: "Newspaper",
  },
  {
    key: "product",
    label: "Add a Product",
    description: "Sell digital downloads or physical goods",
    href: "/dashboard/products/new",
    iconName: "ShoppingBag",
  },
] as const;

/**
 * Checks if the account is completely brand new (zero items across all categories).
 */
export function isBrandNewAccount(data: {
  workspaces: readonly unknown[];
  events: readonly unknown[];
  fundraisers: readonly unknown[];
  articles: readonly unknown[];
  products: readonly unknown[];
  supporting: readonly unknown[];
}): boolean {
  return (
    data.workspaces.length === 0 &&
    data.events.length === 0 &&
    data.fundraisers.length === 0 &&
    data.articles.length === 0 &&
    data.products.length === 0 &&
    data.supporting.length === 0
  );
}

/**
 * Computes suggestions for the "Start something" block.
 * Only suggests types where the user currently has 0 items.
 */
export function getStartSomethingSuggestions(counts: {
  events: number;
  fundraisers: number;
  workspaces: number;
  businesses: number;
  articles: number;
  products: number;
}): StartSuggestion[] {
  const suggestions: StartSuggestion[] = [];

  for (const s of ALL_START_SUGGESTIONS) {
    if (s.key === "event" && counts.events === 0) suggestions.push(s);
    if (s.key === "fundraiser" && counts.fundraisers === 0) suggestions.push(s);
    if (s.key === "workspace" && counts.workspaces === 0) suggestions.push(s);
    if (s.key === "business" && counts.businesses === 0) suggestions.push(s);
    if (s.key === "article" && counts.articles === 0) suggestions.push(s);
    if (s.key === "product" && counts.products === 0) suggestions.push(s);
  }

  return suggestions;
}

/**
 * Determines whether a block in the registry should render.
 * Rules:
 * - No block renders empty.
 * - Brand-new accounts show ONLY the onboarding card, so no blocks render.
 * - Needs attention: only if attentionItems.length > 0.
 * - Workspaces: only if workspaces.length > 0.
 * - Events: only if events.length > 0.
 * - Fundraisers: only if fundraisers.length > 0.
 * - Articles: only if articles.length > 0.
 * - Products: only if products.length > 0.
 * - Supporting: only if supporting.length > 0.
 * - Start something: only if hasAnyContent is true and startSuggestions.length > 0.
 */
export function shouldRenderBlock(
  key: AccountBlockKey,
  data: AccountDashboardData
): boolean {
  if (isBrandNewAccount(data)) {
    return false;
  }

  switch (key) {
    case "needs_attention":
      return data.attentionItems.length > 0;
    case "workspaces":
      return data.workspaces.length > 0;
    case "events":
      return data.events.length > 0;
    case "fundraisers":
      return data.fundraisers.length > 0;
    case "articles":
      return data.articles.length > 0;
    case "products":
      return data.products.length > 0;
    case "supporting":
      return data.supporting.length > 0;
    case "start_something":
      return data.startSuggestions.length > 0;
    default:
      return false;
  }
}

/**
 * Returns the list of blocks to render for the given data, in strictly enforced order.
 */
export function getActiveBlocks(data: AccountDashboardData): AccountBlockKey[] {
  if (isBrandNewAccount(data)) {
    return [];
  }
  return ACCOUNT_BLOCK_ORDER.filter((key) => shouldRenderBlock(key, data));
}

/**
 * Helper to determine workspace ONE number stat string based on its attributes and type.
 */
export function computeWorkspaceStatLabel(params: {
  pendingCount?: number;
  upcomingCount?: number;
  amountRaised?: number;
  orgType?: string | null;
}): string {
  const { pendingCount = 0, upcomingCount = 0, amountRaised = 0, orgType } = params;

  if (pendingCount > 0) {
    return `${pendingCount} pending request${pendingCount === 1 ? "" : "s"}`;
  }
  if (upcomingCount > 0) {
    return `${upcomingCount} upcoming event${upcomingCount === 1 ? "" : "s"}`;
  }
  if (amountRaised > 0) {
    return `$${amountRaised.toLocaleString()} raised`;
  }

  const type = (orgType ?? "").toLowerCase();
  if (type === "restaurant" || type === "business") {
    return "0 pending";
  }
  if (type === "nonprofit" || type === "church") {
    return "$0 raised";
  }
  if (type === "creator" || type === "community" || type === "school") {
    return "0 upcoming";
  }

  // Calm fallback per spec
  return "0 pending";
}

/**
 * Checks whether an ISO or date string is within the next 7 days from now.
 */
export function isEventWithinNext7Days(
  eventDateStr: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!eventDateStr) return false;
  const eventDate = new Date(eventDateStr);
  if (isNaN(eventDate.getTime())) return false;

  const diffMs = eventDate.getTime() - now.getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;
  // Between -1 day (today) and +7 days
  return diffMs >= -oneDayMs && diffMs <= 7 * oneDayMs;
}
