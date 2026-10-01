# Pattern: Marketplace Listing & Search Pages

> Scope: `app/events/page.tsx`, `app/fundraisers/page.tsx`, `app/businesses/page.tsx`, `app/products/page.tsx`, `app/articles/page.tsx`

---

## 1. Primary Purpose
Allow visitors to quickly filter, search, explore, and find specific events, campaigns, businesses, or products.

---

## 2. Layout Structure

- **Static Header Shell**: Rendered instantly without blocking SSR, containing title, category pills, search input, and filter controls.
- **`<Suspense>` Data Component**: Streams listing results to prevent slow database queries from blocking initial page paint.
- **Card Grid Layout**:
  - Desktop: 3-column (`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6`).
  - Mobile: Single column with rich card visuals (`EventCard.tsx`, `FundraiserCard.tsx`, `ArticleCard.tsx`).
- **Pagination & Load More**: Clean page numbers or infinite cursor pagination.
- **Empty State**: When 0 results match active filters, offer clear "Reset Filters" CTA and suggest alternative categories.
