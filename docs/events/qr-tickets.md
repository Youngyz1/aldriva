# QR Code Passes & Credential Architecture

Aldriva utilizes an authoritative **1 Ticket = 1 Unique QR Credential** security model to ensure rapid, counterfeit-proof admission at event doors.

---

## 🔐 The "1 Ticket = 1 Credential" Principle

In Aldriva, every ticket purchased or invitation accepted produces a single, discrete `ticket_instance` record:

```
Order / Invitation
       │
       ├──► Ticket Instance #1 ──► Unique QR Pass A (Row A, Seat 1)
       ├──► Ticket Instance #2 ──► Unique QR Pass B (Row A, Seat 2)
       └──► Ticket Instance #3 ──► Unique QR Pass C (Row A, Seat 3)
```

- Even if a buyer purchases 10 tickets in one transaction, **10 unique QR codes** are generated.
- Group orders do not share a single static barcode. Each attendee enters independently with their own pass.

---

## 🛡️ QR Credential Structure & Security

Aldriva QR codes encode a 32-character high-entropy hexadecimal token directly linked to the `ticket_instances.qr_code` column:

```
Example QR Token: 9F8A2B3C4D5E6F708192A1B2C3D4E5F6
```

### Security Features:
1. **High-Entropy UUIDs**: Ticket tokens are generated via cryptographically secure random bytes (`crypto.randomUUID().replace(/-/g, '').toUpperCase()`).
2. **Server-Side Atomic Verification**: Scanned QR codes are verified through the atomic server endpoint (`/api/verify-ticket`), enforcing event isolation and role validation.
3. **Immediate Revocation Sync**: If a ticket is refunded or an invitation is revoked, the QR token is immediately invalidated in the database.

---

## 📲 Pass Formats Supported

Attendees can present their QR credential in multiple formats:

| Format | Description | Offline Supported |
| :--- | :--- | :---: |
| **Mobile Web Pass** | Interactive webpage optimized for iOS and Android | ✅ (Cached) |
| **Printable PDF** | High-contrast printable pass | ✅ Yes |
| **Email Pass** | Embedded QR code in confirmation email | ✅ Yes |

---

## 🚫 Fraud Prevention & Single-Use Rules

- **Single Check-In**: Once a QR pass is successfully scanned at the door, its database state transitions from `valid` to `used`.
- **Duplicate Scan Detection**: Any subsequent scan of the same QR code will trigger a prominent 🟡 **Already Used** warning on the scanner screen, displaying the exact timestamp and staff member who performed the first check-in.
