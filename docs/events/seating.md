# Visual Seating & Venue Builder

Aldriva features a high-performance **Visual Seating & Venue Builder** designed for galas, conferences, charity dinners, theaters, and assigned-seating events.

---

## 🎨 Overview of the Seating Editor

The seating builder is accessible to Event Organizers and Event Managers under the **Seating** tab (`/dashboard/events/[id]/seating`).

It provides a vector-based 1200×800 SVG canvas with smooth panning, zooming, element rotation, table numbering, and VIP labeling.

---

## 🛠️ Canvas Controls & Navigation

The editor uses an authoritative 1200×800 SVG coordinate grid with isolated viewport panning and zooming:

| Interaction | Action |
| :--- | :--- |
| **Mouse Wheel / Two-Finger Trackpad** | Pan canvas vertically and horizontally |
| **Ctrl + Mouse Wheel / Cmd + Wheel** | Zoom in and out (25% to 300%) |
| **Drag Empty Canvas** | Pan the viewport without moving objects |
| **Click & Drag Object** | Move a section, table, stage, or label across the canvas |
| **Double-Click Object** | Open the **Properties Inspector** for that element |
| **Reset View Button** | Center and fit the entire 1200×800 floorplan into view |

---

## 🪑 Venue Elements & Templates

You can add and combine the following elements onto your floorplan:

### 1. Theater / Auditorium Grid Sections
- **Row Configuration**: Define row labels (e.g., A, B, C or 1, 2, 3) and seats per row.
- **Aisle Spacing**: Adjust gap distances between seating blocks.
- **Seat Numbering**: Left-to-right or right-to-left sequential numbering.

### 2. Round Banquet Tables
- **Standard Capacities**: 4, 6, 8, 10, or 12 seats arranged symmetrically around a circular table.
- **Custom Table Labels**: Assign numbers (e.g., *Table 12*) or descriptive names (e.g., *Gold Sponsor Table*).

### 3. Rectangular / Conference Tables
- **Capacities**: 4 to 20 seats arranged along the perimeter.
- **Orientation**: Rotate 0°, 90°, 180°, or 270° to match venue walls.

### 4. Stage & Presentation Areas
- Visual stage blocks with customizable width, height, and labels (e.g., *Main Stage, Podium, DJ Booth*).
- Orientation markers indicating where seats face.

### 5. General Admission (GA) Zones
- Standing or unreserved zones with assigned maximum capacities (e.g., *Dance Floor, VIP Lounge, Mezzanine Standing*).

### 6. Architectural & Text Labels
- Add labels for Restrooms, Emergency Exits, Registration Desks, Bars, and Sponsor Signage.

---

## ⚙️ Properties Inspector

Double-clicking any seat, table, or section opens the floating **Properties Inspector**:

- **Section / Table Name**: Customize the display name shown to attendees.
- **VIP Designation**: Mark individual seats or entire tables as **VIP** (highlighted with gold badge in seat picker and tickets).
- **Accessibility Flag**: Mark wheelchair-accessible seats (displays ADA accessibility icon).
- **Price Override**: Set a custom price for premium front-row seats or discounted obstructed-view seats, overriding the default tier price.
- **Seat Numbering Scheme**: Modify seat prefixes and numbering format.

---

## 👥 Assigning Seats to Guests & VIPs

Organizers can pre-assign seats to invited guests, sponsors, or VIP attendees directly from the Seating Manager:

1. Click on the desired seat or table seat circle on the canvas.
2. Click **Assign Guest** in the properties panel.
3. Search and select a guest from your **Guests & Invites** list.
4. The seat immediately updates to **Assigned** with the guest's name displayed.
5. If the guest has accepted their invitation, their issued QR pass will automatically include their assigned section, row, and seat/table number.

---

## 🚦 Seat States & Color Indicators

| Seat State | Color | Description |
| :--- | :---: | :--- |
| **Available** | 🟢 Emerald | Open for ticket purchase or manual guest assignment |
| **Reserved** | 🟡 Amber | Held in an active buyer checkout cart (10-min reservation lock) |
| **Sold** | 🔵 Blue | Purchased by a ticket buyer; linked to a paid ticket instance |
| **Assigned (VIP/Guest)** | 🟣 Purple | Assigned to an invited guest or dignitary |
| **Blocked / Unavailable**| ⚫ Slate | Off-sale seat (production hold, camera placement, buffer) |

---

## 🔄 Draft vs. Published Floorplans

- **Draft Mode**: You can modify layouts, move tables, add rows, and delete elements freely without affecting existing ticket holders.
- **Publish Layout**: Commits the seating arrangement to live inventory. Once tickets or invitations are assigned to specific seats, those seat IDs remain permanently authoritative.
- **Safe Modifications**: You can always rename tables, update VIP flags, and adjust price overrides on published layouts.
