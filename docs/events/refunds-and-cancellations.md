# Refunds, Cancellations & Revocations

This guide outlines how refunds, ticket voiding, invitation revocations, and seat reclamation operate within Aldriva.

---

## 💸 Processing Ticket Refunds

Organizers can process refunds directly from the event dashboard:

1. Navigate to **Check-Ins & Roster** or the **Orders** section.
2. Locate the attendee's order and click **Manage Order**.
3. Choose **Issue Full Refund** or **Partial Refund**.
4. Confirm the refund transaction.

### Automated System Cascade upon Refund:
```
Refund Approved (Stripe)
       │
       ├──► 1. ticket_instance status updated to 'refunded'
       ├──► 2. QR credential immediately revoked (scanner will reject)
       ├──► 3. Assigned seat released back to 'available' pool
       └──► 4. Attendee receives email notice with cancellation receipt
```

---

## 🚫 Revoking VIP & Guest Invitations

If an invited guest is unable to attend or an invitation was sent in error:

1. Go to **Guests & Invites** (`/dashboard/events/[id]/guests`).
2. Locate the guest and click **Revoke / Delete**.
3. **Immediate Effects**:
   - Their unique invitation link (`/invitation/[token]`) is deactivated.
   - Any issued QR pass is voided.
   - Any assigned seat or table slot is instantly freed for other attendees.

---

## 🛑 Event Cancellation or Postponement

### Cancelling an Entire Event:
1. Navigate to **Edit Details** (`/events/edit/[id]`).
2. Scroll to the Danger Zone and select **Cancel Event**.
3. Enter the reason for cancellation.
4. Choose whether to automatically issue full refunds to all paid ticket holders via Stripe.
5. All ticket holders and invited guests receive an automated cancellation notification.
6. The public event page updates to display a prominent **Event Cancelled** banner.

### Postponing / Rescheduling:
1. Update the **Start Date & Time** in **Edit Details**.
2. Save changes and select **Notify All Ticket Holders**.
3. Existing QR passes remain valid for the new date unless an individual buyer requests a refund.
