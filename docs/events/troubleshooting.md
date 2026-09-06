# Troubleshooting & Diagnostics

This guide provides step-by-step diagnostic workflows for common technical issues encountered by organizers, door staff, and attendees.

---

## 📷 Door Scanner Issues

### Problem 1: Scanner camera shows a black screen or permission error
- **Cause**: Browser camera access was denied or blocked by device privacy settings.
- **Resolution**:
  1. **iOS (Safari)**: Tap the `aA` or `Settings` icon in the address bar -> `Website Settings` -> Set `Camera` to **Allow**.
  2. **Android (Chrome)**: Tap the three dots menu -> `Settings` -> `Site Settings` -> `Camera` -> Allow Aldriva.
  3. Ensure no other application (e.g., FaceTime, Instagram) is actively using the camera in the background.
  4. Reload the page.

### Problem 2: QR code is not scanning or slow to read
- **Resolution**:
  1. Ask the attendee to increase their phone screen brightness to 100%.
  2. Hold the scanner camera approximately 6–10 inches (15–25 cm) away from the QR code.
  3. Ensure the QR code is centered within the viewfinder box.
  4. In low-light environments, tap the on-screen **Torch / Flashlight** button.

---

## 📂 CSV Import Issues

### Problem 1: "Invalid Header" or missing required fields error
- **Cause**: Column names in the CSV file do not match the expected format.
- **Resolution**:
  - Ensure the first row contains headers. At minimum, `guest_name` is required.
  - Check for special character encodings or BOM markers. Save the file as standard **UTF-8 CSV**.

### Problem 2: "Seat Coordinate Not Found" error during import
- **Cause**: The `seat_section`, `seat_row`, or `table_number` in the CSV does not exist in your published seating layout.
- **Resolution**:
  - Verify your floorplan in the **Seating Builder** to ensure matching section names (e.g., `Main` vs. `Main Floor`) and table numbers.

---

## 🪑 Seating & Floorplan Builder

### Problem 1: "Cannot delete section — seats have active assignments"
- **Cause**: One or more seats in that section have been purchased by a ticket buyer or assigned to an invited guest.
- **Resolution**:
  - Reassign those guests to another table/seat or process refunds before removing the structural section.

### Problem 2: Canvas panning or zooming feels sluggish
- **Resolution**:
  - Click the **Reset View** button to re-center the SVG viewport.
  - Disable browser extensions that intercept pointer events.

---

## ✉️ Digital Invitations & Email Delivery

### Problem 1: Guest reports they did not receive their invitation email
- **Resolution**:
  1. Check the **Guests & Invites** table to confirm their email address is spelled correctly.
  2. Check the delivery status column for a `Bounced` alert.
  3. Click **✉️ Resend Invite** to dispatch a new notification.
  4. Alternatively, click **Copy Link** and send the unique invitation URL directly via SMS or messaging app.
