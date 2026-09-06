# Creating & Configuring an Event

This guide walks event organizers through setting up, configuring, and publishing events on the Aldriva platform.

---

## 🚀 Quick Start: Event Creation Workflow

1. Navigate to your organizer dashboard and click **Create Event** (or visit `/events/create`).
2. Complete the **Event Details** (title, description, category, banner image).
3. Set the **Date, Time & Timezone** (start time, end time, local timezone).
4. Select the **Event Type & Location** (Physical In-Person, Virtual Online, or Hybrid).
5. Configure **Ticket Tiers** (pricing, inventory capacity, sales periods).
6. Configure **Event Settings & Visibility** (Public, Private/Unlisted, Seating mode).
7. Save as **Draft** or **Publish** immediately.

---

## 📋 Step-by-Step Configuration

### 1. Basic Event Details
- **Title**: A clear, compelling title for your event (e.g., *"Annual Charity Gala 2026"*).
- **Category**: Select the appropriate category (e.g., *Gala, Fundraiser, Conference, Concert, Community*).
- **Description**: Rich formatted markdown or plain text describing the event schedule, dress code, honorees, and purpose.
- **Cover Image / Banner**: High-resolution image (recommended 1920×1080px or 16:9 ratio) displayed on the public event page and ticket passes.

### 2. Schedule & Timezone
- **Start Date & Time**: When doors open or when the event officially begins.
- **End Date & Time**: Expected conclusion time.
- **Timezone**: Set the local timezone of the event to ensure ticket buyers and calendar invites display accurate local times.

### 3. Location & Venue
- **In-Person Venue**:
  - Enter the Venue Name (e.g., *"Grand Ballroom, Fairmont Hotel"*).
  - Physical street address, city, state/province, postal code, and country.
  - Optional parking notes or entrance instructions.
- **Virtual / Online**:
  - Streaming link (Zoom, YouTube Live, Vimeo, etc.) — securely hidden until ticket purchase or invitation acceptance.
- **Hybrid**:
  - Both physical venue address and virtual stream access links.

### 4. Ticket Tiers & Pricing
Aldriva allows you to create multiple ticket tiers for a single event:

| Setting | Description |
| :--- | :--- |
| **Tier Name** | e.g., *General Admission, VIP Table, Early Bird, Student* |
| **Price** | Free ($0.00) or Paid (currency based on connected Stripe account) |
| **Total Capacity** | Maximum number of tickets available for this tier |
| **Sales Window** | Specific start and end dates/times when this tier can be purchased |
| **Max Per Order** | Limit number of tickets a single buyer can purchase (default: 10) |
| **Description / Perks** | Bullet points of what is included (e.g., *"Includes 3-course dinner and champagne reception"*)|

> **Paid Events Requirement**: To sell paid tickets, ensure your organizer account has completed Stripe Connect onboarding.

### 5. Seating & Venue Layout Modes
When creating an event, you can choose how attendance is organized:
- **General Admission (Unassigned)**: Attendees receive tickets with tier access; seating is first-come, first-served.
- **Assigned Seating (Interactive Floorplan)**: Organizers design a custom floorplan using the **Visual Venue Builder**. Attendees pick specific seats or tables during checkout, or organizers assign seats to invited VIPs.

---

## 🔒 Visibility & Publishing States

| Status | Public Search | Direct Link Access | Ticket Sales Active |
| :--- | :---: | :---: | :---: |
| **Draft** | ❌ No | ❌ Only Organizer/Staff | ❌ Disabled |
| **Published (Public)** | ✅ Yes | ✅ Yes (`/events/[slug]`) | ✅ Enabled (within sales window) |
| **Private / Unlisted** | ❌ No | ✅ Anyone with direct URL | ✅ Enabled (or invite-only) |
| **Ended / Archived** | ❌ Hidden | ✅ View-only summary | ❌ Closed |

---

## 🛠️ Post-Creation Dashboard Navigation

Once your event is created, access the dedicated event management suite via the sub-navigation bar:

1. **Operations** (`/dashboard/events/[id]/operations`): Live sales, arrival velocity, audit history, and CSV data exports.
2. **Check-Ins & Roster** (`/dashboard/events/[id]/checkins`): Live attendee roster and manual check-in management.
3. **Door Scanner** (`/dashboard/events/[id]/scan`): High-speed mobile camera scanning for door staff.
4. **Guests & Invites** (`/dashboard/events/[id]/guests`): VIP guest list, bulk CSV import, and personalized digital invitations.
5. **Seating** (`/dashboard/events/[id]/seating`): Interactive 1200×800 SVG floorplan builder and seat assignments.
6. **Team & Staff** (`/dashboard/events/[id]/team`): Role-based staff invites (Event Manager, Ticket Scanner).
7. **Edit Details** (`/events/edit/[id]`): Update event description, dates, location, and ticket tier settings.

---

## 💡 Best Practices
- **Launch with Early Bird Tiers**: Set auto-expiring early bird tiers to incentivize initial ticket sales.
- **Double-Check Timezones**: Always confirm the venue timezone so calendar invites (.ics) sync accurately.
- **Test with a Free Promo Code / Test Ticket**: Perform a test purchase and scan the generated QR pass with the Door Scanner before opening sales to the public.
