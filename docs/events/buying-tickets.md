# Purchasing Tickets & Selecting Seats

This guide describes the attendee purchasing experience on Aldriva, including ticket tier selection, interactive floorplan seat picking, and secure checkout.

---

## 🛒 The Checkout Flow

```
1. Browse Event Page (/events/[slug])
       │
       ▼
2. Select Ticket Tier(s) & Quantities
       │
       ▼
3. Pick Seats on Interactive SVG Floorplan (if assigned seating)
       │
       ▼
4. Enter Attendee Information (Name, Email per ticket)
       │
       ▼
5. Secure Checkout via Stripe (Credit/Debit Card, Digital Wallets)
       │
       ▼
6. Order Confirmation & Instant QR Ticket Delivery
```

---

## 🪑 Interactive Seat Selection

For events utilizing Aldriva's **Assigned Seating** mode:

1. **Live Floorplan View**: The attendee sees the venue layout (auditorium rows, banquet tables, stage location).
2. **Real-Time Seat Availability**:
   - 🟢 **Available**: Selectable seats with tooltips showing Seat Number, Row, Section, and Price.
   - 🟡 **In Cart**: Temporarily locked seats currently being checked out by other buyers.
   - 🔵 **Sold / Unavailable**: Grayed-out non-selectable seats.
3. **Cart Reservation Lock**: When a buyer selects a seat, a **10-minute reservation lock** is placed on that seat in the database. This prevents double-booking while the buyer enters payment details.
4. If checkout is not completed within 10 minutes, the lock automatically expires and the seat returns to the public pool.

---

## 🎟️ Multi-Ticket & Group Purchases

Buyers can purchase multiple tickets in a single transaction:
- **Individual Attendee Names**: The buyer can enter distinct names and email addresses for each ticket instance in their order.
- **Separate QR Passes**: Aldriva provisions an independent, unique QR ticket for every single seat/ticket in the order.
- **Email Delivery**: Each named attendee receives their own direct pass link, while the primary buyer receives a master receipt containing all tickets.

---

## 💳 Payment Processing & Confirmation

- **Stripe Connect Integration**: Payments are processed securely via Stripe PaymentIntents:
  - Major Credit & Debit Cards (Visa, Mastercard, American Express, Discover)
  - Digital Wallets (Apple Pay, Google Pay) when configured and supported by the user's browser
- **Order Confirmation Page**: Immediately after payment, the buyer is redirected to the order confirmation page (`/ticket-confirmation` or `/orders/[id]/confirmation`) with:
  - Printable receipt and order reference code
  - Interactive QR codes for each ticket
  - Downloadable PDF tickets
