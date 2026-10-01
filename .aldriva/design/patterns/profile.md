# Pattern: User & Organization Profiles

> Scope: `app/profile/*`, `app/organizers/[id]/*`

---

## 1. Primary Purpose
Showcase a creator's or organization's identity, trust status, public campaigns, organized events, published articles, and community reviews.

---

## 2. Layout & Composition Rules

- **Profile Hero Banner**:
  - Cover image or brand pattern banner.
  - Avatar / Organization Logo with `VerifiedBadge.tsx` if verified.
  - Organization name, location, social links, and Follow / Contact button.
  - Key trust stats: Total Raised, Events Hosted, Articles Published, Community Rating (`StarRating.tsx`).
- **Segmented Navigation**: Clean tabbed view (`components/ui/tabs.tsx`) to switch between:
  1. *Events* (Grid of active & past `EventCard.tsx`).
  2. *Fundraisers* (Grid of active `FundraiserCard.tsx`).
  3. *Products / Store* (Grid of `ProductCard.tsx`).
  4. *Articles* (Grid of `ArticleCard.tsx`).
  5. *Reviews* (`ReviewSection.tsx` and `ReviewForm.tsx`).
- **Empty States**: If a tab has no content, display a tailored empty state encouraging visitors to follow or check back.
