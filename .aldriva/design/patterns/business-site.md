# Pattern: Tenant Websites & Business Mini-Sites

> Scope: `app/dashboard/org/[id]/website/*`, `app/(gated)/businesses/[slug]/*`, `docs/phases/phase-01-website-foundation.md`

---

## 1. Primary Purpose
Enable businesses, nonprofits, and creators to build and publish custom-branded multi-page mini-websites anchored to their entity.

---

## 2. Key Subsystems & Design Specifications

- **Dashboard Website Builder (`app/dashboard/org/[id]/website/`)**:
  - Theme customizer: Theme palettes (Zinc/Orange, Dark, Slate, Warm Amber, Forest).
  - Navigation menu hierarchy manager with drag/drop reordering (`lib/website-nav.ts`).
  - Page manager: CRUD for custom pages (Home, About, Services, Menu, Contact).
  - Header & Footer brand configuration (Logo, Social links, Announcement banner).
  - SEO & OpenGraph card preview.
- **Public Rendering Engine**:
  - Semantic HTML layout with header navigation and responsive mobile hamburger.
  - Modular block components (`HeroBlock`, `FeaturesBlock`, `GalleryBlock`, `ContactBlock`, `EventsEmbedBlock`, `ProductsEmbedBlock`).
  - Strict RLS and privilege segregation (`migration_125`, `migration_126`, DEC-0011).
