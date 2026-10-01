# Pattern: Products, Shop & Digital Library

> Scope: `app/products/*`, `app/(gated)/products/[slug]/*`, `app/products/library/*`, `app/dashboard/products/*`

---

## 1. Primary Purpose
Provide a high-converting digital and physical product marketplace with secure tokenized file deliverables and private asset management.

---

## 2. Key Subsystems & Design Specifications

- **Product Detail Layout (`app/(gated)/products/[slug]/page.tsx`)**:
  - Image/asset preview carousel.
  - Digital flight strip badge (e.g., `⚡ Instant Digital Download`, `📄 PDF Guide 4.2 MB`, `🔑 License Key`).
  - Purchase CTA (`BuyProductButton.tsx`) with instant Stripe / Crypto checkout modal.
- **Buyer Digital Library (`app/products/library/page.tsx`)**:
  - Grid of purchased digital assets with thumbnail and purchase date.
  - Short-lived signed download button (~120s TTL) backed by `lib/digital-products.ts` and `lib/product-access.ts`.
- **Product Management Dashboard (`app/dashboard/products/*`)**:
  - Digital asset file uploader to private `product-assets` bucket (`components/products/AssetManager.tsx`).
  - Inventory and variant toggles.
  - Product sales analytics and customer order lookup.
