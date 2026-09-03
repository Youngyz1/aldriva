# Aldriva Digital Products & E-Commerce

## What is Aldriva Digital Products?
Aldriva Digital Products is the e-commerce feature allowing creators, organizers, and partners to list digital goods, merchandise vouchers, guides, educational downloads, and event add-ons within the Aldriva marketplace.

It is built for two main groups:
- **Buyers** purchasing digital downloads, event add-ons, or community merchandise
- **Sellers & Partners** listing digital items to support their causes or businesses

## What can you do with Aldriva Digital Products?
- Browse available digital items by category and product type
- Purchase digital items securely with instant access to downloads or access codes
- Feature digital products in marketing campaigns and social media promotions

## AI Tool & Promotion Integration
Digital products are queryable by the AI system for promotional campaigns:
- AI tools select allowlisted fields: `id, title, slug, description, cover_image, price, category, product_type`
- `get_available_products` surfaces active items with valid pricing
- `productProvider` maps products into standardized `PromotionObject` candidates for promotion rotation

## Security & Data Isolation
- Download URLs, digital license keys, supplier cost details, and buyer records are structurally excluded from AI queries
- Output guard screens generated promotional text for PII or system prompt leaks before display

## Related Technical Resources
- [Marketplace Ownership ADR](../adr/0001-marketplace-ownership-entitlements-payments.md)
- [Aldriva AI System Architecture](../technical/aldriva-ai.md)
