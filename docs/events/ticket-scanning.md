# Door Scanner & Check-In App

The **Door Scanner** (`/dashboard/events/[id]/scan`) is Aldriva's purpose-built mobile web scanning application for door staff, ushers, and security personnel.

---

## 📱 Hardware & Device Compatibility

The scanner runs in any modern mobile browser without requiring app store downloads:
- **Smartphones & Tablets**: iOS (Safari) and Android (Chrome) using built-in rear or front cameras.
- **Dedicated Handheld 2D Scanners**: USB or Bluetooth barcode/QR scanners operating in HID keyboard wedge mode.
- **Laptops / Desktops**: Webcams or attached 2D barcode scanning guns.

---

## 🚀 Operating the Scanner

1. Log in to your Aldriva staff account and navigate to **Door Scanner** (`/dashboard/events/[id]/scan`).
2. When prompted, grant **Camera Permissions**.
3. Point the camera at an attendee's QR code (printed or on their smartphone).
4. The scanner automatically detects and evaluates the QR pass within **< 150ms**.

---

## 🚦 Scan Outcome Indicators & Audio Cues

The scanner provides instant visual feedback and distinct audio tones:

### 🟢 1. Valid — Check-In Successful
```
+------------------------------------------+
|            ✅ CHECK-IN VALID             |
|                                          |
|  Dr. Eleanor Vance                       |
|  Tier: VIP Sponsor                       |
|  Seating: Table 4 — Seat 2               |
+------------------------------------------+
```
- **Visual**: Full green screen banner with attendee name, tier, and seat assignment.
- **Audio**: Single crisp high-frequency chime.
- **Action**: Direct the attendee to their assigned seat or table.

### 🟡 2. Warning — Already Used (Duplicate Entry)
```
+------------------------------------------+
|          ⚠️ ALREADY CHECKED IN           |
|                                          |
|  Arthur Pendelton                        |
|  First Entry: 18:42:10 (14 mins ago)     |
|  Scanned by: Gate 2 - John Doe           |
+------------------------------------------+
```
- **Visual**: Amber screen banner showing original check-in timestamp and operator.
- **Audio**: Double alert buzzer.
- **Action**: Flag potential pass sharing or re-entry inquiry.

### 🔴 3. Error — Invalid / Not Found
```
+------------------------------------------+
|            ❌ INVALID TICKET             |
|                                          |
|  QR Code not recognized for this event   |
+------------------------------------------+
```
- **Visual**: Red screen banner.
- **Audio**: Low-frequency error buzz.
- **Action**: Check if the attendee has an email for a different event or date.

### ⛔ 4. Alert — Revoked / Refunded
```
+------------------------------------------+
|          ⛔ TICKET CANCELLED             |
|                                          |
|  Ticket was refunded or revoked on Oct 1 |
+------------------------------------------+
```
- **Visual**: Dark red/black banner.
- **Action**: Direct attendee to the help/registration desk.

---

## 🔍 Manual Lookup & Override Fallback

If an attendee's phone battery died or their printout is damaged:
1. Tap the **Manual Lookup** tab at the top of the scanner.
2. Type the attendee's name, email, or order reference code.
3. Tap **Check In** next to their verified record.
4. The manual check-in is logged with your staff user ID.

---

## 💡 Door Scanning Tips & Best Practices
- **Adjust Screen Brightness**: Ask attendees to increase their phone screen brightness for fastest camera read rates.
- **Line Pacing**: In continuous mode, the scanner resets automatically after 1.5 seconds, ready for the next guest.
- **Flashlight Toggle**: Use the on-screen **Torch / Flashlight** button in dimly lit venues.
