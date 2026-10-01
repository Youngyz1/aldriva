# Pattern: Checkout & Payment Rails

> Scope: `app/checkout/*`, `app/events/[slug]/seats/*`, `components/payments/*`

---

## 1. Primary Purpose
Provide a frictionless, trustworthy, and secure multi-rail payment experience (Stripe Credit/Debit Card & NOWPayments Cryptocurrency).

---

## 2. Layout & Security Rules

- **Distraction-Free Layout**: Minimal header with back link and security badge (`DonationProtectedBadge.tsx` or SSL shield). No main navigation links.
- **Order Summary Strip**: Clear breakdown of items, seat numbers, quantities, subtotal, processing fees, and grand total in `tabular-nums`.
- **Payment Selector**: Tabbed selection between "Card Payment (Stripe)" and "Crypto (NOWPayments)".
- **Stale Hold Timer**: In seat-selection checkouts, prominent countdown timer displaying remaining hold duration before seats are released back to inventory.
- **Confirmation & Receipts**: Post-purchase confirmation page with immediate PDF download button (`jspdf`), QR ticket access, and calendar export links.
