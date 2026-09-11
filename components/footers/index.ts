/**
 * Aldriva footer strategy — single source of truth.
 *
 * The root `app/layout.tsx` intentionally renders NO footer. Each segment
 * opts into exactly one tier via its own nested `layout.tsx` (preferred —
 * future pages under the segment inherit automatically) or, for pages that
 * live inside a mixed-tier segment, by wrapping the page in the matching
 * section shell.
 *
 * Tiers:
 *  - MARKETING (`MarketingFooter` / `MarketingSection`): public
 *    marketing/discovery surfaces — home, about, events/fundraisers/
 *    organizations/articles/businesses/products listings, search,
 *    find-tickets, reviews, sponsors, platform, city discovery, legal pages.
 *  - COMPACT (`CompactFooter` / `CompactSection`): individual
 *    content/product pages — event, fundraiser (+ donate), organization,
 *    organizer profile, beneficiary, article, business, product details,
 *    order/donation/ticket confirmations, verification results.
 *  - NONE: authenticated workspaces (dashboard and admin sections,
 *    create-event/fundraiser/organizer flows, edit and my-tickets pages,
 *    team accept, imports/sync tools), auth flows
 *    (login, signup, password recovery), and error boundaries. These render
 *    nothing and fill the viewport via their own app layouts.
 *
 * Rules for contributors:
 *  - Never import a footer in `app/layout.tsx`.
 *  - Never hide a footer with CSS to "fix" a page — put the page in the
 *    segment/shell with the correct tier instead.
 *  - A segment `layout.tsx` must only render a footer when EVERY page under
 *    it shares that tier (e.g. `app/organizers/[id]/edit` is footer-free, so
 *    `app/organizers/[id]` opts in at the page level, not via layout).
 *  - Only link to routes that exist (legal pages are /terms, /privacy
 *    and /cookies).
 */
export { MarketingFooter, MarketingSection } from "./MarketingFooter";
export { CompactFooter, CompactSection } from "./CompactFooter";
