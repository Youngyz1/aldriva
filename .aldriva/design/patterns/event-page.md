# Pattern: Event Detail & Seating Experience

> Scope: `app/events/[slug]/*`, `app/dashboard/events/[id]/seating/*`, `app/dashboard/events/[id]/invitation-design/*`

---

## 1. Primary Purpose
Provide event attendees with venue details, ticket tiers, interactive visual seating selection, and digital invitation RSVP.

---

## 2. Key Subsystems & Design Specifications

- **Event Header**: Date badge (`📅 Sat, Oct 24`), Event title, organizer profile link, venue address with interactive Leaflet map (`VenueMap.tsx`).
- **Ticket Tier Selection**: Clean vertical card stack detailing ticket perks, remaining availability, and price.
- **Interactive SVG Seating Engine (`SeatMap.tsx`)**:
  - Pan/zoom canvas with clear section demarcations (VIP, Orchestra, Balcony).
  - Distinct seat states: Available (Zinc outline), Selected (Solid Orange), Reserved/Sold (Muted grey / disabled), Stale Hold (Yellow).
  - Selected seats floating bottom summary with checkout CTA.
- **Door Scanner PWA (`app/scanner/*`, `components/scanner/*`)**:
  - Full-screen high-contrast scanner camera viewfinder.
  - Large audio/haptic feedback on scan success (Green) vs. duplicate/invalid (Red).
  - Offline sync status indicator (`lib/offline-scanner.ts`).
