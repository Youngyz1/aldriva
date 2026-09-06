# Operations Command Center & Analytics

The **Operations Dashboard** (`/dashboard/events/[id]/operations`) provides organizers and production heads with real-time visibility into capacity, arrival pacing, seating occupancy, revenue, and historical audit logs.

---

## 📊 Live Metrics & KPIs

```
+-------------------+-------------------+-------------------+-------------------+
|  TOTAL CAPACITY   |   TICKETS SOLD    |    CHECKED IN     |   REVENUE (GROSS) |
|      1,200        |    940 (78.3%)    |    612 (65.1%)    |     $47,000       |
+-------------------+-------------------+-------------------+-------------------+
```

### 1. Capacity & Occupancy
- **Total Venue Capacity**: Sum of all inventory slots (seated + general admission).
- **Sold / Issued Tickets**: Number of paid tickets sold + accepted VIP invitations.
- **Live Headcount (Checked In)**: Total attendees currently inside the venue.

### 2. Hourly Arrival Velocity Tracker
- Real-time hourly arrival breakdown chart displaying admissions per hour.
- Helps door supervisors analyze arrival distribution and adjust door staffing across operational peaks.

### 3. Seating Distribution Breakdown
- Total seating utilization percentage across published venue layout.
- VIP seating breakdown (VIP seats total vs. VIP seats assigned).

---

## 📜 Append-Only Audit Trail

Aldriva maintains an immutable, append-only audit trail recording every security-sensitive action taken during the event lifecycle:

| Timestamp | Actor | Action | Target Type |
| :--- | :--- | :--- | :--- |
| 2026-10-18 19:14:02 | gate1_usher@aldriva.com | `checkin_completed` | `ticket_instance` |
| 2026-10-18 18:30:11 | manager@aldriva.com | `seat_assigned` | `seat` |
| 2026-10-18 16:00:44 | owner@aldriva.com | `staff_role_changed` | `staff_member` |
| 2026-10-18 14:22:19 | owner@aldriva.com | `ticket_updated` | `ticket` |

---

## 📥 RFC 4180 CSV Data Exports

Organizers and Event Managers can export complete, un-truncated CSV reports for external analysis, sponsor reporting, or accounting:

### Available Export Reports:
1. **Guests Manifest Export** (`type=guests`):
   - `Guest Name`, `Title`, `Organization`, `Email`, `Phone`, `Invitation Status`, `RSVP Status`, `RSVP Date`, `Assigned Seat`, `Created At`.
2. **Check-Ins Attendance Export** (`type=checkins`):
   - `Ticket Instance ID`, `Attendee Name`, `Email`, `Seat / Table`, `Scanned By`, `Check-In Time`.
3. **Seating Allocation Export** (`type=seating`):
   - `Seat ID`, `Section`, `Row`, `Seat Number`, `Table Number`, `Table Name`, `Table Capacity`, `VIP`, `Status`, `Price Override`, `Assigned Guest / Buyer`.

All exports strictly comply with RFC 4180 CSV standards, featuring properly escaped quotes and standard CRLF (`\r\n`) line endings.
