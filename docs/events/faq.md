# Frequently Asked Questions (FAQ)

Find answers to common questions about managing, ticketing, seating, and attending events on Aldriva.

---

## 🎪 For Event Organizers

### Q: Can I host both free and paid ticket tiers for the same event?
**A**: Yes. You can create multiple tiers within a single event (e.g., Free General Admission, $50 Early Bird, $150 VIP Reception).

### Q: How do payouts work for ticket sales?
**A**: Aldriva uses Stripe Connect. Ticket revenue is transferred directly to your connected bank account according to your Stripe payout schedule (typically daily or weekly rolling).

### Q: Can I change my seating chart after ticket sales have started?
**A**: Yes. You can safely rename tables, move unassigned tables, or add new rows. Seats that have already been purchased or assigned to guests remain locked to prevent double-booking.

### Q: What is the maximum number of guests I can import via CSV?
**A**: The CSV import engine comfortably handles large guest lists in a single batch with real-time validation and preview.

### Q: Can I hide ticket tiers until a certain date?
**A**: Yes. When configuring a ticket tier, set the **Sales Start Date & Time**. The tier will automatically become available for purchase once that timestamp is reached.

---

## 📱 For Door Staff & Ushers

### Q: Do I need to download an app from the App Store / Google Play?
**A**: No. The Aldriva Door Scanner is a web app that runs directly in your mobile browser (Safari, Chrome, etc.) at `/dashboard/events/[id]/scan`.

### Q: Can multiple staff members scan tickets simultaneously?
**A**: Yes. You can have multiple scanners running across different entry gates. All devices synchronize via database queries, so a ticket scanned at Gate 1 will immediately show as `Already Used` if presented at Gate 2.

### Q: What should I do if a ticket code won't scan?
**A**: Use the **Manual Lookup** tab at the top of the scanner to search for the attendee by name or email and check them in manually.

---

## 🎟️ For Attendees & Ticket Buyers

### Q: Where do I find my tickets after purchasing?
**A**: You can access your tickets at any time:
1. In the confirmation email sent to you immediately after purchase.
2. In your Aldriva account under **My Tickets** (`/my-tickets` or `/dashboard/tickets`).
3. Using the **Find Tickets** lookup tool (`/find-tickets`).

### Q: Can I transfer my ticket to a friend?
**A**: Yes. Open your ticket in the **My Tickets** portal and click **Edit Attendee Name** to reassign the pass to another person prior to check-in.

### Q: Can I print my ticket pass?
**A**: Yes. Open your digital pass and select the print/download option to generate a high-contrast physical copy for the door.
