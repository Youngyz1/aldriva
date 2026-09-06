# Digital Invitations & RSVP Portal

Aldriva provides an end-to-end **Digital Invitation and RSVP System** that delivers personalized, high-end invitation experiences to VIPs, dignitaries, donors, and invited guests.

---

## 🌟 The Digital Invitation Experience

When an organizer dispatches an invitation, the recipient receives a branded email containing their unique secure link to the digital invitation portal:

```
https://aldriva.com/invitation/[secure_token]
```

No password or account creation is required for the guest. The link utilizes a 64-character cryptographically secure token.

---

## 💌 Digital Invitation Card Features

The invitation portal page (`/invitation/[token]`) displays an interactive, high-end digital invitation card:

- **Host & Event Branding**: Event cover banner, host organization logo, and verified badge.
- **Personalized Salutation**: *"Dear Dr. Eleanor Vance, you are cordially invited to..."*
- **Event Highlights**: Start time, timezone, venue address with Google Maps integration, and dress code.
- **Seating & Table Allocation**: Displays their reserved table (e.g., *"Table 4 — Gold Sponsor Table"*) or specific seat if pre-assigned.
- **Personal Host Message**: Custom note written specifically for this recipient.
- **RSVP Deadline**: Clear countdown or deadline notice (e.g., *"Please respond by October 15, 2026"*).

---

## 📝 RSVP Actions & Responses

Recipients can choose between two primary actions on the invitation page:

### 1. Accept Invitation (RSVP: "Attending")
When the guest clicks **Accept Invitation**:
1. An optional RSVP form opens to collect:
   - Dietary requirements (Vegan, Gluten-Free, Halal, Kosher, Nut Allergy, etc.)
   - Accessibility or mobility requests
   - Plus-one attendee name (if enabled by organizer)
2. The guest submits their response.
3. **Automated Ticket Instance Generation**: The system immediately links an authoritative `ticket_instance` record to their guest profile and assigned seat with a 32-character hexadecimal credential.
4. **Instant Digital QR Pass**: The page transforms to display their official entry pass with a QR code.
5. **Add to Wallet**: Guests can save their pass directly to Apple Wallet or Google Wallet, or download a printable PDF.

### 2. Decline Invitation (RSVP: "Declined")
When the guest clicks **Decline Invitation**:
1. The guest is prompted to leave an optional message of regret for the organizer.
2. The system updates their RSVP status to `Declined`.
3. Any pre-assigned seat is automatically released back to available inventory.
4. If a ticket instance had previously been generated, it is automatically revoked.

---

## 🔄 Resending Invitations & Token Security

- **Secure Single-Recipient Tokens**: Each invitation link contains a 64-character high-entropy hex token generated via cryptographically secure random bytes.
- **Instant Token Invalidation**: If an organizer revokes an invitation, the token link immediately redirects to a notice stating the invitation is no longer active.
- **Organizer Resend**: Organizers can resend invitation emails with a single click from the **Guests & Invites** dashboard.

---

## 🛡️ Privacy & 90-Day Retention Cleanup

To protect sensitive donor, dignitary, and VIP information:
- Transient invitation PII (email, phone, personal messages, and notes) is retained during the active event lifecycle.
- **Automated Retention Purge**: 90 days after an event reaches its ended lifecycle state, an automated retention job anonymizes transient personal data while permanently preserving immutable financial and door check-in logs.
