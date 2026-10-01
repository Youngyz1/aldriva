# Pattern: Public Detail Pages

> Scope: Generic detail layouts (`app/events/[slug]`, `app/fundraisers/[slug]`, `app/(gated)/products/[slug]`)

---

## 1. Primary Purpose
Deliver in-depth storytelling, media, organizer credentials, and high-conversion transaction pathways for a specific entity.

---

## 2. Layout Structure

- **Desktop (>= 1024px)**:
  - Left Content Column (65% width): High-resolution media slider (`FundraiserMediaSlider.tsx`), formatted story text, organizer trust card, donor wall or ticket tiers, comments, social share widget (`FundraiserShare.tsx`).
  - Right Sidebar (35% width, `sticky top-24`): Sticky checkout or donation action box (`FundraiserSidebar.tsx` / `BuyProductButton.tsx`).
- **Mobile (< 1024px)**:
  - Single continuous scroll of media, story, and details.
  - Sticky bottom transaction bar (`fixed bottom-0 inset-x-0 bg-white border-t p-3 z-30`) with one-tap CTA.
