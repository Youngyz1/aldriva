# Pattern: Homepage & Landing Pages

> Scope: `app/page.tsx`, `app/events/city/[citySlug]/page.tsx`

---

## 1. Primary Purpose
Engage first-time and returning visitors, communicate the Aldriva value proposition clearly, and provide immediate discovery pathways across events, fundraisers, products, and businesses.

---

## 2. Structural Composition

1. **Hero Section**:
   - Clear value proposition headline (`text-3xl sm:text-5xl font-extrabold tracking-tight`).
   - Concise 2-sentence description of the platform or city hub.
   - Unified Search / Location Picker (`MobileHomepageSearch.tsx` / `LocationSearch.tsx`).
   - Dynamic Hero visual fan / featured content showcase (`FeaturedSlider.tsx`).
2. **Curated Categories**: Clean icon pill / grid selector (`CategoryGrid.tsx`).
3. **Trending & Featured Showcases**:
   - Trending events carousel (`TrendingCarousel.tsx`).
   - Urgent / featured fundraisers with progress rings.
   - Featured local businesses / digital creators.
4. **Trust & Social Proof**:
   - Verified testimonials (`HomepageTestimonials.tsx`).
   - Community impact metrics (total raised, tickets booked).
5. **Footer**: Clean modular footer (`components/Footer.tsx`) with category links, branding, and legal disclosures.
