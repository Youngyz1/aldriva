# Guest Management & CSV Import

The **Guests & Invites** module (`/dashboard/events/[id]/guests`) allows event organizers and managers to curate guest lists, invite VIPs, manage RSVPs, pre-assign seating, and bulk-import guest rosters using CSV files.

---

## ➕ Adding Individual Guests

To add a guest manually:
1. Open the event dashboard and navigate to **Guests & Invites**.
2. Click **+ Add Guest Manually**.
3. Fill in the guest details:
   - **Full Name** (Required): e.g., *Dr. Eleanor Vance*
   - **Email Address** (Optional if physical pass only, required for digital invites): e.g., *eleanor@example.org*
   - **Title / Role**: e.g., *Keynote Speaker, Board Member, Lead Sponsor*
   - **Organization**: e.g., *Vance Foundation*
   - **VIP Status**: Toggle on to give VIP credential badges and perks.
   - **Seating Assignment**: Optionally pick a table or seat directly from the dropdown.
   - **Notes**: Internal notes for door staff (e.g., *Needs front row seating, dietary restriction: vegan*).
4. Click **Create Guest**.

---

## 📂 Bulk CSV Import Workflow

Aldriva provides an RFC 4180-compliant CSV import engine with real-time schema validation and conflict preview.

### 1. CSV Format & Column Headers

Your CSV file can include the following headers (case-insensitive):

```csv
guest_name,email,guest_title,organization,is_vip,notes,seat_section,seat_row,seat_number,table_number
"Dr. Eleanor Vance",eleanor@example.org,"Keynote Speaker","Vance Foundation",true,"Vegan dinner",Main,A,12,
"Arthur Pendelton",arthur@merlin.com,"Honored Guest","Merlin Group",false,"",,,,4
"Sarah Jenkins",sarah@acme.corp,"VP Marketing","Acme Corp",true,"",VIP,1,1,
```

#### Header Specifications:
- `guest_name` (**Required**): Full name of the attendee.
- `email` (*Optional*): Used for delivering digital invitations and QR passes.
- `guest_title` (*Optional*): Position or honorific.
- `organization` (*Optional*): Company, NGO, or institution.
- `is_vip` (*Optional*): `true`, `false`, `yes`, `no`, `1`, `0`.
- `notes` (*Optional*): Dietary, accessibility, or host notes.
- `seat_section`, `seat_row`, `seat_number` (*Optional*): Matches seat coordinates in your published layout.
- `table_number` (*Optional*): Matches table number in your published layout.

### 2. Step-by-Step Import Process

1. Navigate to **Guests & Invites** and click **Import from CSV**.
2. Drag and drop your `.csv` file or click to browse.
3. **Interactive Preview Table**:
   - The system displays a preview of all parsed rows.
   - Valid rows display a 🟢 green checkmark.
   - Rows with validation issues (duplicate emails, invalid seat coordinates) display a ⚠️ warning or 🔴 error badge.
4. **Inline Row Correction**: You can edit row data directly inside the preview table before committing.
5. Click **Commit Import**. All valid guest records are created in a single database transaction.

---

## 📊 Guest Statuses & Tracking

The Guest Management table displays real-time tracking for every attendee:

| Column | Description |
| :--- | :--- |
| **Guest** | Name, Title, and Organization badge |
| **Contact** | Email address and delivery status |
| **Invitation** | `Draft`, `Sent`, `Delivered`, or `Bounced` |
| **RSVP** | `Pending`, `Attending` (Accepted), or `Declined` |
| **Seat / Table** | Assigned section/row/seat or banquet table |
| **QR Pass** | Link to view or download the guest's digital pass |
| **Actions** | Resend Invite, Edit Details, Reassign Seat, Delete Guest |

---

## ✉️ Sending & Resending Invitations

- **Send All Draft Invites**: Click **Send Pending Invites** to dispatch digital invitation emails to all guests in `Draft` status.
- **Individual Resend**: Click the **✉️ Resend** button next to any guest record to re-dispatch their unique invitation token.
- **Copy Direct Link**: Organizers can copy the guest's unique RSVP link (`/invitation/[token]`) to share via WhatsApp, SMS, or direct email.

---

## 🗑️ Removing Guests & Releasing Seats

- When an invited guest is deleted or declines their RSVP:
  - Any assigned seat is immediately released back to **Available** inventory.
  - Any generated QR pass is permanently revoked.
  - If scanned at the door, the scanner will alert: `Revoked / Cancelled`.
