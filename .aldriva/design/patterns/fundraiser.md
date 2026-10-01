# Pattern: Fundraiser Detail & Donor Wall

> Scope: `app/fundraisers/[slug]/*`, `app/fundraisers/[slug]/donate/*`

---

## 1. Primary Purpose
Build emotional resonance, trust, and transparent progress for community and nonprofit fundraising campaigns.

---

## 2. Key Subsystems & Design Specifications

- **Goal Progress Header**:
  - Dominant raised amount (`$45,200 raised of $50,000 goal` with `tabular-nums`).
  - Animated progress bar (`ProgressBar.tsx`) or progress ring (`FundraisingProgressRing.tsx`).
  - Donor count and days remaining metadata.
- **Beneficiary Trust Badge**:
  - Clear indicator of whether funds go directly to the organizer or a verified third-party beneficiary (`lib/beneficiary.ts`).
  - Trust verification status (`VerifiedBadge.tsx`).
- **Story & Media Slider**: Rich photo/video gallery with full-width responsive viewer.
- **Donor Wall & Comments Feed (`DonorList.tsx`, `CommentsSection.tsx`)**:
  - Recent donation entries with optional avatar, donor name, amount, and message of encouragement.
  - Anonymous donation toggle privacy protection (`lib/security/__tests__/donors-feed-privacy.test.cjs`).
- **One-Tap Donation Sidebar**: Preset amount buttons ($25, $50, $100, Custom) leading directly to instant checkout.
